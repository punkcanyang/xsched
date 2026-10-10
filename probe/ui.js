// Gate 0.5: button anchor and panel geometry are independent of reader assumptions.
(() => {
"use strict";
const STRINGS = Object.freeze({
  'zh-Hant': { shortcut: 'xsched：開關排程浮層', goto: '前往 Scheduled', collapse: '縮小', reset: '重設位置' },
  'zh-Hans': { shortcut: 'xsched：打开或关闭排程面板', goto: '前往 Scheduled', collapse: '收起', reset: '重置位置' },
  en: { shortcut: 'xsched: toggle scheduled posts panel', goto: 'Go to Scheduled', collapse: 'Minimize', reset: 'Reset position' },
  ja: { shortcut: 'xsched：予約投稿パネルを開閉', goto: '予約済みへ移動', collapse: '最小化', reset: '位置をリセット' },
  ko: { shortcut: 'xsched: 예약 게시물 패널 열기/닫기', goto: '예약 게시물로 이동', collapse: '접기', reset: '위치 초기화' },
  es: { shortcut: 'xsched: abrir o cerrar el panel de publicaciones programadas', goto: 'Ir a Programadas', collapse: 'Minimizar', reset: 'Restablecer posición' },
  fr: { shortcut: 'xsched : ouvrir ou fermer le panneau des publications programmées', goto: 'Voir les publications programmées', collapse: 'Réduire', reset: 'Réinitialiser la position' },
  de: { shortcut: 'xsched: Bereich für geplante Beiträge öffnen oder schließen', goto: 'Zu geplanten Beiträgen', collapse: 'Minimieren', reset: 'Position zurücksetzen' },
  pt: { shortcut: 'xsched: abrir ou fechar o painel de publicações agendadas', goto: 'Ver publicações agendadas', collapse: 'Minimizar', reset: 'Redefinir posição' },
});
// One nine-language table for slot labels, status, aria-label and native title.
const QUICK_STRINGS = Object.freeze({
  'zh-Hant': { slots:['9:00','12:30','20:00','下個工作日 9:00'], heading:'快速選時段（原生欄位尚待驗證）', missing:'未偵測到排程欄位', ready:'只填欄位；請自行確認，不會送出', filled:'已填入欄位；尚未排程', yearMissing:"目標年份不在 X 的選項中", optionsMissing:"日期／時間選項無法表示此時段", failed:"填值失敗，已還原；請逐欄檢查", rollbackFailed:"還原不完整，請自行檢查所有欄位", range:"目標日期不在 X 的允許範圍" },
  'zh-Hans': { slots:['9:00','12:30','20:00','下个工作日 9:00'], heading:'快速选时段（原生字段尚待验证）', missing:'未检测到排程字段', ready:'只填字段；请自行确认，不会发送', filled:'已填入字段；尚未排程', yearMissing:"目标年份不在 X 的选项中", optionsMissing:"日期／时间选项无法表示此时段", failed:"填值失败，已还原；请逐栏检查", rollbackFailed:"还原不完整，请自行检查所有字段", range:"目标日期不在 X 的允许范围" },
  en: { slots:['9:00','12:30','20:00','Next workday 9:00'], heading:'Quick slots (native fields unverified)', missing:'Schedule fields not detected', ready:'Fill fields only; confirm yourself. Nothing is sent.', filled:'Fields filled; not scheduled yet', yearMissing:"Target year is not in X’s options", optionsMissing:"Date/time options cannot represent this slot", failed:"Fill failed; restored. Check every field", rollbackFailed:"Restoration incomplete; check every field yourself", range:"Target date is outside X’s allowed range" },
  ja: { slots:['9:00','12:30','20:00','次の平日 9:00'], heading:'時刻を選択（実画面の項目は未検証）', missing:'予約項目を検出できません', ready:'項目の入力のみ。確認・送信はご自身で。', filled:'項目を入力しました。未予約です', yearMissing:"対象年がXの選択肢にありません", optionsMissing:"この日時を選択肢で表せません", failed:"入力失敗。元に戻しました。各項目を確認してください", rollbackFailed:"復元が不完全です。全項目を確認してください", range:"対象日がXの許容範囲外です" },
  ko: { slots:['9:00','12:30','20:00','다음 평일 9:00'], heading:'빠른 시간 선택 (실제 필드 미검증)', missing:'예약 필드를 찾지 못했습니다', ready:'필드만 입력합니다. 직접 확인하세요. 전송하지 않습니다.', filled:'필드를 입력했습니다. 아직 예약하지 않았습니다', yearMissing:"목표 연도가 X 선택지에 없습니다", optionsMissing:"이 시간을 날짜/시간 선택지로 표시할 수 없습니다", failed:"입력 실패. 복원했습니다. 각 필드를 확인하세요", rollbackFailed:"복원이 불완전합니다. 모든 필드를 직접 확인하세요", range:"목표 날짜가 X 허용 범위를 벗어납니다" },
  es: { slots:['9:00','12:30','20:00','Próximo día laborable 9:00'], heading:'Horarios rápidos (campos sin verificar)', missing:'No se detectaron campos de programación', ready:'Solo rellena campos; confirma tú. No se envía nada.', filled:'Campos rellenados; aún sin programar', yearMissing:"El año objetivo no está en las opciones de X", optionsMissing:"Las opciones no representan este horario", failed:"Error al rellenar; restaurado. Revisa cada campo", rollbackFailed:"Restauración incompleta; revisa todos los campos", range:"La fecha está fuera del rango permitido por X" },
  fr: { slots:['9:00','12:30','20:00','Prochain jour ouvré 9:00'], heading:'Créneaux rapides (champs non vérifiés)', missing:'Champs de programmation non détectés', ready:'Remplit les champs seulement ; confirmez vous-même.', filled:'Champs remplis ; pas encore programmé', yearMissing:"L’année cible ne figure pas dans les options X", optionsMissing:"Les options ne représentent pas ce créneau", failed:"Échec du remplissage ; restauré. Vérifiez chaque champ", rollbackFailed:"Restauration incomplète ; vérifiez tous les champs", range:"La date est hors de la plage autorisée par X" },
  de: { slots:['9:00','12:30','20:00','Nächster Werktag 9:00'], heading:'Schnellzeiten (Felder ungeprüft)', missing:'Planungsfelder nicht erkannt', ready:'Füllt nur Felder; selbst bestätigen. Kein Versand.', filled:'Felder ausgefüllt; noch nicht geplant', yearMissing:"Das Zieljahr fehlt in den X-Optionen", optionsMissing:"Die Optionen können diese Zeit nicht darstellen", failed:"Ausfüllen fehlgeschlagen; wiederhergestellt. Alle Felder prüfen", rollbackFailed:"Wiederherstellung unvollständig; alle Felder selbst prüfen", range:"Das Datum liegt außerhalb des erlaubten X-Bereichs" },
  pt: { slots:['9:00','12:30','20:00','Próximo dia útil 9:00'], heading:'Horários rápidos (campos não verificados)', missing:'Campos de agendamento não detectados', ready:'Só preenche campos; confirme você. Nada é enviado.', filled:'Campos preenchidos; ainda não agendado', yearMissing:"O ano de destino não está nas opções do X", optionsMissing:"As opções não representam este horário", failed:"Falha ao preencher; restaurado. Confira cada campo", rollbackFailed:"Restauração incompleta; confira todos os campos", range:"A data está fora do intervalo permitido pelo X" },
});
function quickStringsFor(doclang,navlang) { return QUICK_STRINGS[languageKey(doclang) || languageKey(navlang) || 'en']; }
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
    if (el?.nodeType === 1 && candidates.size < 256 && !el.closest('[data-xsched-host="1"], [role="dialog"], [role="alertdialog"]')) candidates.add(el);
  };
  let queried = 0;
  // Include direct injected wrappers even when their buttons live in closed shadow.
  for (const el of doc.querySelectorAll('body > *, html > *')) {
    if (queried++ >= 64) break;
    if (el !== doc.body && el.tagName !== 'HEAD') add(el);
  }
  queried = 0;
  for (const el of doc.querySelectorAll('button, a, [role="button"], aside')) {
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
    for (let node = el; node && node !== doc.body && node !== doc.documentElement && depth++ < 12; node = node.parentElement) {
      const style = styleOf(node);
      if (!style || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') break;
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = visible(node, style);
      if (!rect) break;
      // Full-page wrappers/backdrops never become floating-control obstacles.
      const fullPage = rect.width >= width * .85 && rect.height >= height * .85;
      const obstacle = fullPage ? null : node;
      if (obstacle && !emitted.has(obstacle)) {
        const bounds = visible(obstacle, styleOf(obstacle));
        if (bounds) { emitted.add(obstacle); out.push(bounds); }
      }
      break;
    }
  }
  return out;
}
function placement(width, height, obstacles) {
  const panelWidth = 44;
  const totalHeight = 44;
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
function clampPosition(pos, width, height) {
  const maxX = Math.max(0, width - 44 - 16), maxY = Math.max(0, height - 44 - 16);
  return { x: Math.min(maxX, Math.max(Math.min(16, maxX), pos.x)), y: Math.min(maxY, Math.max(Math.min(16, maxY), pos.y)) };
}
// Clamp an independent panel without rewriting its original saved coordinates.
function panelSize(width, height) {
  return { width:Math.max(0,Math.min(344,width-32)), height:Math.max(0,Math.min(Math.floor(height*.6),height-32)) };
}
function clampPanelPosition(pos, width, height) {
  const size = panelSize(width,height);
  const maxX=Math.max(0,width-size.width-16), maxY=Math.max(0,height-size.height-16);
  return {x:Math.min(maxX,Math.max(Math.min(16,maxX),pos.x)),y:Math.min(maxY,Math.max(Math.min(16,maxY),pos.y))};
}
// Only the panel moves. Try above/below, then beside the immutable button anchor.
function panelPlacement(width, height, anchor, obstacles, naturalHeight, minimum) {
  const panelWidth = Math.min(344, Math.max(0, width - 32));
  const cap = Math.min(Math.floor(height * .6), height - 32);
  const align = left => Math.max(16, Math.min(width - panelWidth - 16, left));
  const above = anchor.y - 12 - 16, below = height - 16 - anchor.y - 44 - 12;
  const lefts = [...new Set([align(anchor.x+44-panelWidth),align(anchor.x),
    ...obstacles.slice(0,32).flatMap(rect => [rect.left-panelWidth-8,rect.right+8]),
  ])].filter(left => left>=16 && left+panelWidth<=width-16).slice(0,32);
  const vertical = ['above','below'].flatMap(side => lefts.map(left => ({side,left,available:side==='above'?above:below})))
    .sort((a,b) => Math.min(cap,b.available)-Math.min(cap,a.available));
  const candidates = [...vertical,
    { side:'beside', available:height-32, left:anchor.x-12-panelWidth },
    { side:'beside', available:height-32, left:anchor.x+44+12 },
  ];
  for (const candidate of candidates) {
    if (candidate.left < 16 || candidate.left + panelWidth > width - 16) continue;
    const available = Math.min(cap, candidate.available);
    if (available < minimum) continue;
    const heights = [Math.min(available, Math.max(minimum, naturalHeight))];
    for (let next=heights[0]-32; next>=minimum && heights.length<13; next-=32) heights.push(next);
    heights.push(minimum);
    for (const h of heights) {
      const top = candidate.side==='above' ? anchor.y-12-h : candidate.side==='below' ? anchor.y+56 : Math.max(16, Math.min(height-h-16, anchor.y+44-h));
      const rect = { left:candidate.left, top, right:candidate.left+panelWidth, bottom:top+h };
      const button = { left:anchor.x, top:anchor.y, right:anchor.x+44, bottom:anchor.y+44 };
      if (!overlaps(rect,button) && !obstacles.some(other => overlaps(rect,other))) return { ...rect, width:panelWidth, maxHeight:h, clear:true };
    }
  }
  return { clear:false };
}
globalThis.XSCHED_UI = { STRINGS, QUICK_STRINGS, quickStringsFor, stringsFor, overlaps, placement, collectObstacles, clampPosition, panelPlacement, panelSize, clampPanelPosition };
})();
