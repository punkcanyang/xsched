// Read-only schedule overview. Copies last Scheduled-list items in memory only.
// Never stores post text, never clicks or scrolls X, never sends or opens the picker.
(() => {
"use strict";
const STRINGS = Object.freeze({
  'zh-Hant': {heading:'排程總覽',synced:'最後同步時間',empty:'已同步，目前沒有排程。去 Scheduled 頁同步一次。',unsynced:'快取是空的。去 Scheduled 頁同步一次。',stale:'這份總覽未捲完或內容已變，可能不是完整列表。',count:'共 {n} 則',next:'最近一則還有 {when}',passed:'最近一則已過 {when}',day:'天',hour:'小時',minute:'分',none:'（沒有文字）',unknown:'時間未解析',am:'上午',pm:'下午'},
  'zh-Hans': {heading:'排程总览',synced:'最后同步时间',empty:'已同步，目前没有排程。去 Scheduled 页同步一次。',unsynced:'尚未同步。请到 Scheduled 页读一次。',stale:'这份总览未卷完或内容已变，可能不是完整列表。',count:'共 {n} 则',next:'最近一则还有 {when}',passed:'最近一则已过 {when}',day:'天',hour:'小时',minute:'分',none:'（没有文字）',unknown:'时间未解析',am:'上午',pm:'下午'},
  en: {heading:'Scheduled overview',synced:'Last synced',empty:'Cache is empty: synced, no scheduled posts. Open Scheduled to sync once.',unsynced:'Not synced yet. Open Scheduled to sync once.',stale:'This overview is incomplete or the text changed, so it may not be the full list.',count:'{n} scheduled',next:'Next in {when}',passed:'Latest was {when} ago',day:'d',hour:'h',minute:'m',none:'(no text)',unknown:'Time not parsed',am:'AM',pm:'PM'},
  ja: {heading:'予約一覧',synced:'最終同期',empty:'同期済みです。予約投稿はありません。Scheduled で再同期できます。',unsynced:'未同期です。Scheduled を開いて一度読み取ってください。',stale:'この一覧は途中までか本文が変わったため、完全ではない可能性があります。',count:'{n} 件',next:'次の予定まで {when}',passed:'直近の予定から {when}',day:'日',hour:'時間',minute:'分',none:'（本文なし）',unknown:'時刻未解析',am:'午前',pm:'午後'},
  ko: {heading:'예약 개요',synced:'마지막 동기화',empty:'동기화 완료: 예약된 게시물이 없습니다. Scheduled에서 다시 동기화할 수 있습니다.',unsynced:'아직 동기화하지 않았습니다. Scheduled를 열어 한 번 읽으세요.',stale:'이 개요는 끝까지 보지 않았거나 본문이 바뀌어 전체 목록이 아닐 수 있습니다.',count:'{n}개',next:'가장 가까운 일정까지 {when}',passed:'가장 가까운 일정이 {when} 지남',day:'일',hour:'시간',minute:'분',none:'(텍스트 없음)',unknown:'시간 해석 실패',am:'오전',pm:'오후'},
  es: {heading:'Resumen programado',synced:'Última sincronización',empty:'Sincronizado: no hay publicaciones programadas. Abre Scheduled para actualizar.',unsynced:'Aún no está sincronizado. Abre Scheduled para leer una vez.',stale:'Este resumen está incompleto o el texto cambió; puede no ser la lista completa.',count:'{n} programados',next:'Falta {when} para el más próximo',passed:'El más próximo pasó hace {when}',day:'d',hour:'h',minute:'min',none:'(sin texto)',unknown:'Hora no interpretada',am:'a. m.',pm:'p. m.'},
  fr: {heading:'Aperçu programmé',synced:'Dernière synchro',empty:'Synchronisé : aucune publication programmée. Ouvrez Scheduled pour actualiser.',unsynced:'Pas encore synchronisé. Ouvrez Scheduled pour lire une fois.',stale:'Cet aperçu est incomplet ou le texte a changé ; ce n’est peut-être pas la liste entière.',count:'{n} programmés',next:'Prochain dans {when}',passed:'Le plus proche date de {when}',day:'j',hour:'h',minute:'min',none:'(pas de texte)',unknown:'Heure non analysée',am:'AM',pm:'PM'},
  de: {heading:'Geplante Übersicht',synced:'Zuletzt synchronisiert',empty:'Synchronisiert: keine geplanten Beiträge. Öffne Scheduled zum Aktualisieren.',unsynced:'Noch nicht synchronisiert. Öffne Scheduled einmal zum Lesen.',stale:'Diese Übersicht ist unvollständig oder der Text hat sich geändert und ist vielleicht nicht die ganze Liste.',count:'{n} geplant',next:'Nächster in {when}',passed:'Der nächste lag vor {when}',day:'T',hour:'Std',minute:'Min',none:'(kein Text)',unknown:'Zeit nicht erkannt',am:'AM',pm:'PM'},
  pt: {heading:'Visão geral agendada',synced:'Última sincronização',empty:'Sincronizado: não há publicações agendadas. Abra Scheduled para atualizar.',unsynced:'Ainda não sincronizado. Abra Scheduled para ler uma vez.',stale:'Esta visão está incompleta ou o texto mudou e pode não ser a lista inteira.',count:'{n} agendados',next:'Próximo em {when}',passed:'O mais próximo foi há {when}',day:'d',hour:'h',minute:'min',none:'(sem texto)',unknown:'Hora não interpretada',am:'AM',pm:'PM'},
});
function language(doclang, navlang) {
  for (const raw of [doclang, navlang]) {
    const tag = String(raw || '').toLowerCase();
    if (/^zh(?:-|$)/.test(tag)) return /hant|tw|hk|mo/.test(tag) ? 'zh-Hant' : 'zh-Hans';
    const key = tag.split('-')[0];
    if (STRINGS[key]) return key;
  }
  return 'en';
}
function stringsFor(doclang, navlang) { return STRINGS[language(doclang, navlang)]; }
function validTime(item) { return item && item.at instanceof Date && Number.isFinite(item.at.getTime()); }
function previewText(value) { return Array.from(String(value == null ? '' : value)).slice(0, 20).join(''); }
function meridiem(date, doclang, navlang) {
  const labels = stringsFor(doclang, navlang);
  return date.getHours() < 12 ? labels.am : labels.pm;
}
function pad(value) { return String(value).padStart(2, '0'); }
function formatItemTime(item, doclang, navlang) {
  const labels = stringsFor(doclang, navlang);
  if (!validTime(item)) return labels.unknown;
  const at = item.at;
  const week = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getDay()];
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())} (${week}) ${meridiem(at, doclang, navlang)}`;
}
function sortItems(items) {
  return [...(items || [])].sort((left, right) => {
    const a = validTime(left) ? left.at.getTime() : Number.POSITIVE_INFINITY;
    const b = validTime(right) ? right.at.getTime() : Number.POSITIVE_INFINITY;
    if (a !== b) return a - b;
    const previewA = String(left && left.preview || '');
    const previewB = String(right && right.preview || '');
    return previewA < previewB ? -1 : previewA > previewB ? 1 : 0;
  });
}
function snapshot(items) {
  const copies = [];
  for (const item of items || []) {
    const copy = {
      time: typeof item.time === 'string' ? item.time : '',
      preview: previewText(item.preview),
      at: validTime(item) ? new Date(item.at.getTime()) : null,
      unparsed: item.unparsed === true,
      sample: typeof item.sample === 'string' ? item.sample : '',
    };
    copies.push(copy);
  }
  return sortItems(copies);
}
function formatCount(count, doclang, navlang) {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return stringsFor(doclang, navlang).count.replaceAll('{n}', String(n));
}
function formatSpan(ms, labels) {
  const abs = Math.max(0, Math.floor(Math.abs(Number(ms) || 0) / 60000));
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = abs % 60;
  const parts = [];
  if (days) parts.push(`${days}${labels.day}`);
  if (hours || days) parts.push(`${hours}${labels.hour}`);
  parts.push(`${minutes}${labels.minute}`);
  return parts.join(' ');
}
function formatRemaining(items, now, doclang, navlang) {
  const dated = (items || []).filter(validTime);
  if (!dated.length || !(now instanceof Date) || !Number.isFinite(now.getTime())) return '';
  const nowMs = now.getTime();
  const labels = stringsFor(doclang, navlang);
  const future = dated.filter((item) => item.at.getTime() >= nowMs).sort((left, right) => left.at - right.at);
  if (future.length) return labels.next.replaceAll('{when}', formatSpan(future[0].at.getTime() - nowMs, labels));
  const past = dated.sort((left, right) => right.at - left.at)[0];
  return labels.passed.replaceAll('{when}', formatSpan(nowMs - past.at.getTime(), labels));
}
function itemKey(item) {
  if (validTime(item)) return `t:${item.at.getTime()}`;
  return `u:${item.sample || ''}\u0000${item.time || ''}`;
}
// Keep rows the current window does not show. Same time with a new preview replaces that row.
function mergeSnapshots(previous, incoming) {
  const base = snapshot(previous);
  const next = snapshot(incoming);
  const buckets = new Map();
  for (const item of base) {
    const key = itemKey(item);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(item);
  }
  const extras = [];
  const replacements = new Map();
  for (const item of next) {
    const bucket = buckets.get(itemKey(item));
    if (bucket && bucket.length) {
      const prior = bucket.shift();
      replacements.set(prior, item);
    } else extras.push(item);
  }
  return sortItems([...base.map(item => replacements.get(item) || item), ...extras]);
}
globalThis.XSCHED_OVERVIEW = Object.freeze({STRINGS, stringsFor, language, snapshot, sortItems, formatItemTime, meridiem, previewText, validTime, formatCount, formatRemaining, mergeSnapshots});
})();
