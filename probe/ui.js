// Gate 0.2 UI vocabulary and pure placement helper; independent of reader assumptions.
(() => {
"use strict";
const STRINGS = Object.freeze({
  'zh-Hant': { shortcut: 'xsched：開關排程浮層', goto: '前往 Scheduled' },
  'zh-Hans': { shortcut: 'xsched：打开或关闭排程面板', goto: '前往 Scheduled' },
  en: { shortcut: 'xsched: toggle scheduled posts panel', goto: 'Go to Scheduled' },
  ja: { shortcut: 'xsched：予約投稿パネルを開閉', goto: '予約済みへ移動' },
  ko: { shortcut: 'xsched: 예약 게시물 패널 열기/닫기', goto: '예약 게시물로 이동' },
  es: { shortcut: 'xsched: abrir o cerrar el panel de publicaciones programadas', goto: 'Ir a Programadas' },
  fr: { shortcut: 'xsched : ouvrir ou fermer le panneau des publications programmées', goto: 'Voir les publications programmées' },
  de: { shortcut: 'xsched: Bereich für geplante Beiträge öffnen oder schließen', goto: 'Zu geplanten Beiträgen' },
  pt: { shortcut: 'xsched: abrir ou fechar o painel de publicações agendadas', goto: 'Ver publicações agendadas' },
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
function placement(width, height, obstacles, panelHeight = 0) {
  const panelWidth = panelHeight ? Math.min(344, width - 32) : 44;
  const totalHeight = 44 + (panelHeight ? panelHeight + 12 : 0);
  // Keep the compact button above the ordinary FAB/closed Messages area. If an
  // actual fixed control intersects, search upward, then left. No X testid guesses.
  const maxBottom = height - totalHeight - 16;
  const bottoms = [Math.min(112, maxBottom)];
  for (let bottom = bottoms[0] + 56; bottom <= maxBottom; bottom += 56) bottoms.push(bottom);
  bottoms.push(16);
  for (let right = 16; right <= width - panelWidth - 16; right += 56) {
    for (const bottom of bottoms) {
      const rect = { left: width - right - panelWidth, right: width - right, top: height - bottom - totalHeight, bottom: height - bottom };
      if (rect.top >= 16 && !obstacles.some((other) => overlaps(rect, other))) return { right, bottom, clear: true };
    }
  }
  return { right: 16, bottom: Math.max(16, Math.min(112, height - 60)), clear: false };
}
globalThis.XSCHED_UI = { STRINGS, stringsFor, overlaps, placement };
})();
