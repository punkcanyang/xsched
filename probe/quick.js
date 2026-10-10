// 1.0 first item: deliberately unverified native-picker assumptions, not list selectors.
// No X control is activated. The user opens the picker and confirms it themselves.
(() => {
'use strict';
const QUICK_CONFIG = Object.freeze({
  // GATE0 evidence table #5: article-only, not personally read or real-DOM verified.
  dialog: '[role="dialog"]', date: '[data-testid="scheduledDateField"]', time: '[data-testid="scheduledTimeField"]',
  // Synthetic fixture contract ONLY. Never infer a field from its position or body text.
  fields: Object.freeze({ month:'select[name="month"]', day:'select[name="day"]', year:'select[name="year"]', hour:'select[name="hour"]', minute:'select[name="minute"]', period:'select[name="period"]' }),
  marginMs: 5 * 60 * 1000,
});
const SLOT_IDS = Object.freeze(['morning','lunch','evening','workday']);
function nextSlot(id, now = new Date()) {
  if (!SLOT_IDS.includes(id) || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const hour = id === 'lunch' ? 12 : id === 'evening' ? 20 : 9;
  const minute = id === 'lunch' ? 30 : 0;
  // Workday means the next calendar weekday, never today's remaining morning.
  for (let offset = id === 'workday' ? 1 : 0; offset < 8; offset++) {
    const at = new Date(now.getFullYear(),now.getMonth(),now.getDate()+offset,hour,minute,0,0);
    if (id === 'workday' && (at.getDay() === 0 || at.getDay() === 6)) continue;
    // Refuse DST-normalized hours: never silently fill a different wall-clock time.
    if (at.getHours() !== hour || at.getMinutes() !== minute) continue;
    if (at.getTime() >= now.getTime() + QUICK_CONFIG.marginMs) return at;
  }
  return null;
}
function visible(node, doc) {
  for (let el = node; el; el = el.parentElement) {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('inert')) return false;
    const style = doc.defaultView.getComputedStyle?.(el) || el.style;
    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return false;
  }
  return true;
}
function detectControls(doc) {
  const candidates = [...doc.querySelectorAll(QUICK_CONFIG.dialog)].filter(el => !el.closest('[data-xsched-host="1"]') && visible(el,doc));
  const dialogs = candidates.filter(dialog => [QUICK_CONFIG.date,QUICK_CONFIG.time].some(selector => [...dialog.querySelectorAll(selector)].some(el => el.closest(QUICK_CONFIG.dialog) === dialog)));
  // Even an unknown picker can report native select count, without guessing its roles.
  const counts = {schedDialog:dialogs.length,dateCtl:0,timeCtl:0,selects:candidates.reduce((sum,dialog)=>sum+[...dialog.querySelectorAll('select')].filter(el=>el.closest(QUICK_CONFIG.dialog)===dialog).length,0)};
  for (const dialog of dialogs) {
    for (const [key,selector] of [['dateCtl',QUICK_CONFIG.date],['timeCtl',QUICK_CONFIG.time]]) counts[key] += [...dialog.querySelectorAll(selector+' select')].filter(el => el.closest(QUICK_CONFIG.dialog) === dialog).length;
  }
  if (dialogs.length !== 1) return {counts,ready:false};
  const dialog = dialogs[0];
  const fields = {};
  for (const [key,selector] of Object.entries(QUICK_CONFIG.fields)) {
    const containers = [...dialog.querySelectorAll(['month','day','year'].includes(key) ? QUICK_CONFIG.date : QUICK_CONFIG.time)].filter(el => el.closest(QUICK_CONFIG.dialog) === dialog);
    if (containers.length !== 1) return {counts,ready:false};
    const found = [...containers[0].querySelectorAll(selector)].filter(el => el.closest(QUICK_CONFIG.dialog) === dialog);
    if (key === 'period' && found.length === 0) continue; // explicitly complete 24h domain below
    if (found.length !== 1) return {counts,ready:false};
    const control = found[0];
    if (!(control instanceof doc.defaultView.HTMLSelectElement) || control.multiple || control.hasAttribute('multiple') || control.disabled || control.matches(':disabled') || !visible(control,doc)) return {counts,ready:false};
    fields[key] = control;
  }
  const domain = (field,values) => values.every(value => optionValue(field,value) !== null);
  // Require a complete, explicit domain so zero-based months / 12h without period cannot be mistaken for 1-based / 24h.
  if (!domain(fields.month,Array.from({length:12},(_,i)=>i+1)) || optionValue(fields.month,0) !== null
    || !domain(fields.hour,Array.from({length:fields.period ? 12 : 24},(_,i)=>fields.period ? i+1 : i))
    || (fields.period && (optionValue(fields.hour,0) !== null || optionValue(fields.period,'AM') === null || optionValue(fields.period,'PM') === null))) return {counts,ready:false};
  return {counts,ready:true,fields};
}
function optionValue(select, wanted) {
  const matches = [...select.querySelectorAll('option')].filter(option => {
    if (option.disabled || option.hasAttribute('disabled') || option.parentElement?.hasAttribute('disabled')) return false;
    const value = option.getAttribute('value'); // don't use arbitrary option text as a value
    return typeof wanted === 'number' ? /^\d{1,4}$/.test(value || '') && Number(value) === wanted : typeof value === 'string' && value.toUpperCase() === wanted;
  });
  return matches.length === 1 ? matches[0].getAttribute('value') : null;
}
function fieldValues(fields,at) {
  const wanted = {month:at.getMonth()+1,day:at.getDate(),year:at.getFullYear(),hour:fields.period ? at.getHours()%12 || 12 : at.getHours(),minute:at.getMinutes()};
  if (fields.period) wanted.period = at.getHours()<12 ? 'AM' : 'PM';
  const values = Object.entries(wanted).map(([key,value])=>[fields[key],optionValue(fields[key],value)]);
  return values.some(([control,value])=>!control || value === null) ? null : values;
}
// Sole audited event writer. Native prototype setter; ALL fields/options validated
// before any writes. Only ordinary bubbling input/change, no activation/submit events.
function writeNativeControls(doc,values) {
  const setter = Object.getOwnPropertyDescriptor(doc.defaultView.HTMLSelectElement.prototype,'value')?.set;
  if (typeof setter !== 'function') return false;
  const originals = values.map(([control])=>[control,control.value]);
  try {
    for (const [control,value] of values) setter.call(control,value);
    if (!values.every(([control,value])=>control.value === value)) throw new Error('native setter refused');
  } catch {
    for (const [control,value] of originals) { try { setter.call(control,value); } catch { /* no events on failure */ } }
    return false;
  }
  for (const [control] of values) {
    control.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
    control.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
  }
  return values.every(([control,value])=>control.isConnected && control.value === value);
}
function fillSlot(doc,id,now = new Date()) {
  if (doc.defaultView.location?.hostname !== 'x.com') return false;
  const detected = detectControls(doc);
  const at = nextSlot(id,now);
  if (!detected.ready || !at) return false;
  const values = fieldValues(detected.fields,at);
  return values ? writeNativeControls(doc,values) : false;
}
function diagnostic(counts) {
  return ['schedDialog','dateCtl','timeCtl','selects'].map(key=>`${key}=${Number.isSafeInteger(counts?.[key]) && counts[key]>=0 ? counts[key] : 0}`).join(' ');
}
globalThis.XSCHED_QUICK = {QUICK_CONFIG,SLOT_IDS,nextSlot,detectControls,fillSlot,diagnostic};
})();
