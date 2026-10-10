// Gate 0.3 UI vocabulary and pure placement helper; independent of reader assumptions.
(() => {
"use strict";
const STRINGS = Object.freeze({
  'zh-Hant': { shortcut: 'xsched：開關排程浮層', goto: '前往 Scheduled', collapse: '縮小' },
  'zh-Hans': { shortcut: 'xsched：打开或关闭排程面板', goto: '前往 Scheduled', collapse: '收起' },
  en: { shortcut: 'xsched: toggle scheduled posts panel', goto: 'Go to Scheduled', collapse: 'Minimize' },
  ja: { shortcut: 'xsched：予約投稿パネルを開閉', goto: '予約済みへ移動', collapse: '最小化' },
  ko: { shortcut: 'xsched: 예약 게시물 패널 열기/닫기', goto: '예약 게시물로 이동', collapse: '접기' },
  es: { shortcut: 'xsched: abrir o cerrar el panel de publicaciones programadas', goto: 'Ir a Programadas', collapse: 'Minimizar' },
  fr: { shortcut: 'xsched : ouvrir ou fermer le panneau des publications programmées', goto: 'Voir les publications programmées', collapse: 'Réduire' },
  de: { shortcut: 'xsched: Bereich für geplante Beiträge öffnen oder schließen', goto: 'Zu geplanten Beiträgen', collapse: 'Minimieren' },
  pt: { shortcut: 'xsched: abrir ou fechar o painel de publicações agendadas', goto: 'Ver publicações agendadas', collapse: 'Minimizar' },
});
function languageKey(value) {
  const tag = typeof value === 'string' ? value.toLowerCase() : '';
  if (/^zh(?:-|$)/.test(tag)) return /(?:-hant|-tw|-hk|-mo)(?:-|$)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
  const base = tag.split('-')[0];
  return Object.hasOwn(STRINGS, base) ? base : null;
}
function stringsFor(doclang, navlang) {
  // Prefer X's document language; fall back to browser language, then English.
  return STRINGS[languageKey(doclang) || languageKey(navlang) || 'en'];
}
function overlaps(a, b, gap = 8) {
  return a.left < b.right + gap && a.right > b.left - gap && a.top < b.bottom + gap && a.bottom > b.top - gap;
}
// Geometry only: finite point sampling catches non-button widgets (including a
// fixed wrapper with an unread dot). No X selectors, clicks or DOM writes.
function collectObstacles(doc, getStyle, width, height) {
  const candidates = new Set();
  const add = el => {
    if (el?.nodeType === 1 && candidates.size < 256 && !el.closest('[data-xsched-host="1"]')) candidates.add(el);
  };
  let queried = 0;
  for (const el of doc.querySelectorAll('button, a, [role="button"], [role="dialog"], aside')) {
    if (queried++ >= 96) break;
    add(el);
  }
  // 32px spacing over the lower-right 448 x 640 region, at most 320 samples.
  let points = 0;
  if (typeof doc.elementsFromPoint === 'function') {
    for (let y = height - 16; y >= Math.max(16, height - 640) && points < 320; y -= 32) {
      for (let x = width - 16; x >= Math.max(16, width - 448) && points < 320; x -= 32) {
        points++;
        for (const el of doc.elementsFromPoint(x,y).slice(0,8)) add(el);
      }
    }
  }
  const styles = new Map();
  const rectangles = new Map();
  const emitted = new Set();
  const out = [];
  const styleOf = el => {
    if (!styles.has(el) && styles.size < 768) styles.set(el, getStyle(el));
    return styles.get(el);
  };
  const rectOf = el => {
    if (!rectangles.has(el)) rectangles.set(el, el.getBoundingClientRect());
    return rectangles.get(el);
  };
  const visible = (el, style) => {
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return null;
    const rect = rectOf(el);
    return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height ? rect : null;
  };
  for (const el of candidates) {
    let depth = 0;
    for (let node = el; node && node !== doc.body && depth++ < 12; node = node.parentElement) {
      const style = styleOf(node);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') break;
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = visible(node, style);
      if (!rect) break;
      // A full-page fixed modal/backdrop is not a corner widget. Its interactive
      // descendant still counts, without treating the whole viewport as blocked.
      const fullPage = rect.width >= width * .85 && rect.height >= height * .85;
      const obstacle = fullPage && el.matches('button, a, [role="button"]') ? el : fullPage ? null : node;
      if (obstacle && !emitted.has(obstacle)) {
        const bounds = visible(obstacle, styleOf(obstacle));
        if (bounds) { emitted.add(obstacle); out.push(bounds); }
      }
      break;
    }
  }
  return out;
}
function placement(width, height, obstacles, panelHeight = 0) {
  const panelWidth = panelHeight ? Math.min(344, width - 32) : 44;
  const totalHeight = 44 + (panelHeight ? panelHeight + 12 : 0);
  const maxBottom = height - totalHeight - 16;
  const maxRight = width - panelWidth - 16;
  const base = Math.min(112, maxBottom);
  const rights = [16, ...obstacles.map(rect => width - rect.left + 8)];
  const bottoms = [base, ...obstacles.map(rect => height - rect.top + 8)];
  for (let right=72; right<=maxRight && rights.length<64; right+=56) rights.push(right);
  for (let bottom=base+56; bottom<=maxBottom && bottoms.length<64; bottom+=56) bottoms.push(bottom);
  const bounded = (values, max) => [...new Set(values.filter(value => value >= 16 && value <= max))].sort((a,b) => a-b).slice(0,64);
  const orderedBottoms = [base, ...bounded(bottoms, maxBottom).filter(value => value > base), 16];
  for (const right of bounded(rights,maxRight)) {
    for (const bottom of orderedBottoms) {
      const rect = { left: width-right-panelWidth, right: width-right, top: height-bottom-totalHeight, bottom: height-bottom };
      if (rect.top >= 16 && !obstacles.some(other => overlaps(rect,other))) return { right,bottom,clear:true };
    }
  }
  return { right:16,bottom:Math.max(16,Math.min(112,height-60)),clear:false };
}
globalThis.XSCHED_UI = { STRINGS, stringsFor, overlaps, placement, collectObstacles };
})();
