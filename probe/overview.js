// Read-only schedule overview. Copies last Scheduled-list items in memory only.
// Never stores post text, never clicks or scrolls X, never sends or opens the picker.
(() => {
"use strict";
const STRINGS = Object.freeze({
  'zh-Hant': {heading:'排程總覽',synced:'最後同步時間',empty:'快取是空的。去 Scheduled 頁同步一次。',none:'（沒有文字）',unknown:'時間未解析',am:'上午',pm:'下午'},
  'zh-Hans': {heading:'排程总览',synced:'最后同步时间',empty:'缓存是空的。去 Scheduled 页同步一次。',none:'（没有文字）',unknown:'时间未解析',am:'上午',pm:'下午'},
  en: {heading:'Scheduled overview',synced:'Last synced',empty:'Cache is empty. Open Scheduled to sync once.',none:'(no text)',unknown:'Time not parsed',am:'AM',pm:'PM'},
  ja: {heading:'予約一覧',synced:'最終同期',empty:'キャッシュは空です。Scheduled で一度同期してください。',none:'（本文なし）',unknown:'時刻未解析',am:'午前',pm:'午後'},
  ko: {heading:'예약 개요',synced:'마지막 동기화',empty:'캐시가 비어 있습니다. Scheduled에서 한 번 동기화하세요.',none:'(텍스트 없음)',unknown:'시간 해석 실패',am:'오전',pm:'오후'},
  es: {heading:'Resumen programado',synced:'Última sincronización',empty:'La caché está vacía. Abre Scheduled para sincronizar una vez.',none:'(sin texto)',unknown:'Hora no interpretada',am:'a. m.',pm:'p. m.'},
  fr: {heading:'Aperçu programmé',synced:'Dernière synchro',empty:'Le cache est vide. Ouvrez Scheduled pour synchroniser une fois.',none:'(pas de texte)',unknown:'Heure non analysée',am:'AM',pm:'PM'},
  de: {heading:'Geplante Übersicht',synced:'Zuletzt synchronisiert',empty:'Der Cache ist leer. Öffne Scheduled einmal zum Synchronisieren.',none:'(kein Text)',unknown:'Zeit nicht erkannt',am:'AM',pm:'PM'},
  pt: {heading:'Visão geral agendada',synced:'Última sincronização',empty:'O cache está vazio. Abra Scheduled para sincronizar uma vez.',none:'(sem texto)',unknown:'Hora não interpretada',am:'AM',pm:'PM'},
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
globalThis.XSCHED_OVERVIEW = Object.freeze({STRINGS, stringsFor, language, snapshot, sortItems, formatItemTime, meridiem, previewText, validTime});
})();
