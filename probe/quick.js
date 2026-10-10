// 0.1.1: picker structure proven by a masked skeleton; option encodings unverified.
// No X control is activated. The user opens the picker and confirms it themselves.
(() => {
'use strict';
const QUICK_CONFIG = Object.freeze({
  // GATE0 evidence table #5: article-only, not personally read or real-DOM verified.
  dialog: '[role="dialog"]', date: '[data-testid="scheduledDateField"]', time: '[data-testid="scheduledTimeField"]',
  // Synthetic fixture contract ONLY. Never infer a field from its position or body text.
  fields: Object.freeze({ month:'select[name="month"]', day:'select[name="day"]', year:'select[name="year"]', hour:'select[name="hour"]', minute:'select[name="minute"]', period:'select[name="period"]' }),
  // Picker skeleton L36/L42: nearest inner dialog owns the controls.
  realDialog: '[role="dialog"][aria-modal="true"]',
  group: '[role="group"]', select: 'select', option:'option',
  ownHost:'[data-xsched-host="1"]', disabled:':disabled',
  // L88/101/114/141/154/165: preceding labels, linked by aria-labelledby.
  label: 'label', labelIds: '[id]', labelledBy: 'aria-labelledby',
  // L86/L132: date group contains three selects and a native calendar input.
  dateInput: 'input[type="date"]',
  // L91/104/117/144/157/168: data-testid exists but is EMPTY, no prefix evidence.
  // No new testid/name/class guess. Legacy selectors above stay as a fallback.
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
function detectLegacy(doc) {
  const candidates = [...doc.querySelectorAll(QUICK_CONFIG.dialog)].filter(el => !el.closest(QUICK_CONFIG.ownHost) && visible(el,doc));
  const dialogs = candidates.filter(dialog => [QUICK_CONFIG.date,QUICK_CONFIG.time].some(selector => [...dialog.querySelectorAll(selector)].some(el => el.closest(QUICK_CONFIG.dialog) === dialog)));
  // Even an unknown picker can report native select count, without guessing its roles.
  const counts = {schedDialog:dialogs.length,dateCtl:0,timeCtl:0,selects:candidates.reduce((sum,dialog)=>sum+[...dialog.querySelectorAll(QUICK_CONFIG.select)].filter(el=>el.closest(QUICK_CONFIG.dialog)===dialog).length,0)};
  for (const dialog of dialogs) {
    for (const [key,selector] of [['dateCtl',QUICK_CONFIG.date],['timeCtl',QUICK_CONFIG.time]]) counts[key] += [...dialog.querySelectorAll(selector+' '+QUICK_CONFIG.select)].filter(el => el.closest(QUICK_CONFIG.dialog) === dialog).length;
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
    if (!(control instanceof doc.defaultView.HTMLSelectElement) || control.multiple || control.hasAttribute('multiple') || control.disabled || control.matches(QUICK_CONFIG.disabled) || !visible(control,doc)) return {counts,ready:false};
    fields[key] = control;
  }
  const domain = (field,values) => values.every(value => optionValue(field,value) !== null);
  // Require a complete, explicit domain so zero-based months / 12h without period cannot be mistaken for 1-based / 24h.
  if (!domain(fields.month,Array.from({length:12},(_,i)=>i+1)) || optionValue(fields.month,0) !== null
    || !domain(fields.hour,Array.from({length:fields.period ? 12 : 24},(_,i)=>fields.period ? i+1 : i))
    || (fields.period && (optionValue(fields.hour,0) !== null || optionValue(fields.period,'AM') === null || optionValue(fields.period,'PM') === null))) return {counts,ready:false};
  return {counts,ready:true,fields};
}
const FIELD_LABELS = Object.freeze({
  month:['month','月','月份','月份选择','月份選擇','月の選択','월','mes','mois','monat','mês'],
  day:['day','日','日期','日付','일','día','jour','tag','dia'],
  year:['year','年','年份','년','año','année','jahr','ano'],
  hour:['hour','小時','小时','時','时','時刻','시간','시','hora','heure','stunde'],
  minute:['minute','分鐘','分钟','分','분','minuto','minuten'],
  period:['am/pm','上午/下午','午前/午後','오전/오후','period','période','tageszeit','período'],
});
const PERIOD_WORDS = Object.freeze({
  AM:['am','a.m.','上午','午前','오전','a. m.','matin','vormittags','vormittag','manhã'],
  PM:['pm','p.m.','下午','午後','오후','p. m.','après-midi','nachmittags','nachmittag','tarde'],
});
const normalizeWord = text => String(text || '').trim().toLowerCase().replace(/[.\s]/g,'');
const MONTH_WORDS = new Map();
for (const lang of ['zh-Hant','zh-Hans','en','ja','ko','es','fr','de','pt']) {
  for (const width of ['long','short']) for (let i=0;i<12;i++) {
    const word = new Intl.DateTimeFormat(lang,{month:width}).format(new Date(2027,i,1));
    MONTH_WORDS.set(normalizeWord(word),i+1);
  }
}
function enabledOptions(select) {
  return [...select.querySelectorAll(QUICK_CONFIG.option)].filter(option=>!option.disabled && !option.hasAttribute('disabled') && !option.parentElement?.hasAttribute('disabled'));
}
function numericText(text, field) {
  const raw=String(text || '').trim();
  if (field==='month' && MONTH_WORDS.has(normalizeWord(raw))) return MONTH_WORDS.get(normalizeWord(raw));
  const suffix={month:'月월',day:'日일',year:'年년',hour:'時时시',minute:'分분'}[field] || '';
  const match=new RegExp('^(\\d{1,4})(?:['+suffix+'])?$').exec(raw);
  return match ? Number(match[1]) : null;
}
function periodWord(text) {
  const word=normalizeWord(text);
  return Object.keys(PERIOD_WORDS).find(key=>PERIOD_WORDS[key].some(value=>normalizeWord(value)===word)) || null;
}
function realOptions(select,field) {
  const options=enabledOptions(select);
  if (!options.length || options.some(option=>typeof option.value!=='string' || option.value==='')) return null;
  if (field==='period') {
    if (options.length!==2) return null;
    const pairs=options.map((option,index)=>{
      const expected=index===0?'AM':'PM', text=periodWord(option.textContent), value=periodWord(option.value);
      return text===expected && (!value || value===expected) ? [expected,option.value] : null;
    });
    return pairs.every(Boolean) && new Set(pairs.map(pair=>pair[1])).size===2 ? new Map(pairs) : null;
  }
  const entries=options.map(option=>({value:option.value,raw:/^\d{1,4}$/.test(option.value)?Number(option.value):null,text:numericText(option.textContent,field)}));
  // A proven whole 0..11 domain + all twelve agreeing month labels can map
  // zero-based values. A lone disagreement never implies an offset.
  const zeroBased=field==='month' && entries.length===12 && new Set(entries.map(e=>e.raw)).size===12
    && entries.every(e=>e.raw!==null && e.raw>=0 && e.raw<=11 && e.text===e.raw+1);
  const result=new Map(), rawValues=new Set();
  for (const entry of entries) {
    if (entry.raw!==null && entry.text!==null && entry.raw!==entry.text && !zeroBased) return null;
    const number=entry.text ?? entry.raw;
    if (number===null || result.has(number) || rawValues.has(entry.value)) return null;
    const bounds={month:[1,12],day:[1,31],year:[2000,9999],hour:[0,23],minute:[0,59]}[field];
    if (!bounds || number<bounds[0] || number>bounds[1]) return null;
    result.set(number,entry.value);rawValues.add(entry.value);
  }
  return result;
}
function linkedLabel(select,group,doc) {
  const ids=(select.getAttribute(QUICK_CONFIG.labelledBy) || '').trim().split(/\s+/).filter(Boolean);
  if (ids.length!==1) return null;
  const matches=[...doc.querySelectorAll(QUICK_CONFIG.labelIds)].filter(node=>node.id===ids[0]);
  const label=matches[0];
  return matches.length===1 && label?.matches(QUICK_CONFIG.label) && group.contains(label)
    && label.closest(QUICK_CONFIG.group)===group ? label : null;
}
function fieldHint(label) {
  const word=normalizeWord(label.textContent);
  return Object.keys(FIELD_LABELS).find(key=>FIELD_LABELS[key].some(value=>normalizeWord(value)===word)) || null;
}
function domain(select,field) {
  const map=realOptions(select,field);
  if (!map) return false;
  const has=values=>values.every(value=>map.has(value));
  if (field==='month') return map.size===12 && has(Array.from({length:12},(_,i)=>i+1));
  if (field==='day') return map.size>=28 && map.size<=31 && has(Array.from({length:map.size},(_,i)=>i+1));
  if (field==='year') return map.size>=1;
  if (field==='hour') return (map.size===12 && has(Array.from({length:12},(_,i)=>i+1))) || (map.size===24 && has(Array.from({length:24},(_,i)=>i)));
  if (field==='period') return map.has('AM') && map.has('PM');
  const values=[...map.keys()].sort((a,b)=>a-b);
  if (map.size===60) return has(Array.from({length:60},(_,i)=>i));
  const step=values[1]-values[0];
  return values[0]===0 && values.length>=2 && step>1 && values.every((value,index)=>value===index*step);
}
function groupFields(group,kind,doc,dialog) {
  const selects=[...group.querySelectorAll(QUICK_CONFIG.select)].filter(el=>el.closest(QUICK_CONFIG.group)===group && el.closest(QUICK_CONFIG.dialog)===dialog);
  if (kind==='date' ? selects.length!==3 : ![2,3].includes(selects.length)) return null;
  const allowed=kind==='date'?['month','day','year']:['hour','minute','period'];
  const fields={};
  for (const select of selects) {
    const label=linkedLabel(select,group,doc);if (!label) return null;
    const hint=fieldHint(label);
    const choices=hint ? allowed.filter(field=>field===hint) : allowed.filter(field=>domain(select,field));
    if (choices.length!==1 || fields[choices[0]]) return null;
    fields[choices[0]]=select;
  }
  if (!fields[allowed[0]] || !fields[allowed[1]] || (kind==='date' && !fields.year)) return null;
  return fields;
}
function usable(control,doc) {
  return control instanceof doc.defaultView.HTMLSelectElement && !control.multiple && !control.hasAttribute('multiple')
    && !control.disabled && !control.matches(QUICK_CONFIG.disabled) && visible(control,doc);
}
function detectControls(doc) {
  const legacy=detectLegacy(doc);
  const candidates=[...doc.querySelectorAll(QUICK_CONFIG.dialog)].filter(el=>!el.closest(QUICK_CONFIG.ownHost) && visible(el,doc));
  const found=[];
  for (const dialog of candidates) {
    if (!dialog.matches(QUICK_CONFIG.realDialog)) continue;
    const groups=[...dialog.querySelectorAll(QUICK_CONFIG.group)].filter(group=>group.closest(QUICK_CONFIG.dialog)===dialog && visible(group,doc));
    const dates=[],times=[];
    for (const group of groups) {
      const inputs=[...group.querySelectorAll(QUICK_CONFIG.dateInput)].filter(input=>input.closest(QUICK_CONFIG.group)===group && input.closest(QUICK_CONFIG.dialog)===dialog);
      if (inputs.length===1) {const fields=groupFields(group,'date',doc,dialog);if(fields)dates.push({...fields,dateInput:inputs[0]});}
      else if (!inputs.length) {const fields=groupFields(group,'time',doc,dialog);if(fields)times.push(fields);}
    }
    if (dates.length || times.length) found.push({dialog,dates,times});
  }
  // Do not choose between simultaneous complete/partial setting dialogs.
  const legacyDialogs=candidates.filter(dialog=>[QUICK_CONFIG.date,QUICK_CONFIG.time].some(selector=>[...dialog.querySelectorAll(selector)].some(node=>node.closest(QUICK_CONFIG.dialog)===dialog)));
  const allDialogs=new Set([...legacyDialogs,...found.map(entry=>entry.dialog)]);
  const counts={...legacy.counts,schedDialog:allDialogs.size,dateCtl:legacy.counts.dateCtl,timeCtl:legacy.counts.timeCtl};
  for (const entry of found) if (!legacyDialogs.includes(entry.dialog)) {
    counts.dateCtl+=entry.dates.length*3;counts.timeCtl+=entry.times.reduce((sum,fields)=>sum+Object.keys(fields).length,0);
  }
  if (!found.length) return legacy;
  if (allDialogs.size!==1 || found.length!==1 || found[0].dates.length!==1 || found[0].times.length!==1) return {counts,ready:false};
  const fields={...found[0].dates[0],...found[0].times[0]};
  if (Object.entries(fields).some(([key,control])=>key!=='dateInput' && !usable(control,doc))) return {counts,ready:false};
  const maps={};
  for (const key of ['month','day','year','hour','minute',...(fields.period?['period']:[])]) {
    maps[key]=realOptions(fields[key],key);
    if (!maps[key]) return {counts,ready:false,reason:'optionsMissing'};
  }
  const full=(map,start,size)=>map.size===size && Array.from({length:size},(_,i)=>start+i).every(value=>map.has(value));
  if (!full(maps.month,1,12) || !full(maps.hour,fields.period?1:0,fields.period?12:24)) return {counts,ready:false,reason:'optionsMissing'};
  return {counts,ready:true,fields,maps};
}
function optionValue(select, wanted) {
  const matches = [...select.querySelectorAll(QUICK_CONFIG.option)].filter(option => {
    if (option.disabled || option.hasAttribute('disabled') || option.parentElement?.hasAttribute('disabled')) return false;
    const value = option.getAttribute('value');
    return typeof wanted === 'number' ? /^\d{1,4}$/.test(value || '') && Number(value) === wanted : typeof value === 'string' && value.toUpperCase() === wanted;
  });
  return matches.length === 1 ? matches[0].getAttribute('value') : null;
}
function fieldValues(fields,at,maps=null) {
  const wanted = {month:at.getMonth()+1,day:at.getDate(),year:at.getFullYear(),hour:fields.period ? at.getHours()%12 || 12 : at.getHours(),minute:at.getMinutes()};
  if (fields.period) wanted.period = at.getHours()<12 ? 'AM' : 'PM';
  const values = Object.entries(wanted).map(([key,value])=>[fields[key],maps ? maps[key]?.get(value) ?? null : optionValue(fields[key],value)]);
  return values.some(([control,value])=>!control || value === null) ? null : values;
}
function withinDateBounds(input,at) {
  if (!input) return true;
  const target=`${at.getFullYear()}-${String(at.getMonth()+1).padStart(2,'0')}-${String(at.getDate()).padStart(2,'0')}`;
  for (const name of ['min','max']) {
    const bound=input.getAttribute(name);if(!bound)continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bound) || (name==='min'?target<bound:target>bound)) return false;
    const [year,month,day]=bound.split('-').map(Number),date=new Date(year,month-1,day);
    if(date.getFullYear()!==year || date.getMonth()+1!==month || date.getDate()!==day)return false;
  }
  return true;
}
// Sole audited event writer. Native prototype setter; ALL fields/options validated
// before any writes. Only ordinary bubbling input/change, no activation/submit events.
function writeNativeControls(doc,values) {
  const setter = Object.getOwnPropertyDescriptor(doc.defaultView.HTMLSelectElement.prototype,'value')?.set;
  if (typeof setter !== 'function') return 'failed';
  const originals = values.map(([control])=>[control,control.value]);
  function send(entries) {
    for (const [control] of entries) {
      if (!control.isConnected) continue;
      control.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
      control.dispatchEvent(new doc.defaultView.Event('change',{bubbles:true}));
    }
  }
  const matches=entries=>entries.every(([control,value])=>control.isConnected && control.ownerDocument===doc && control.value===value);
  try {
    for (const [control,value] of values) setter.call(control,value);
    if (!matches(values)) throw new Error('refused');
    send(values);
    if (!matches(values)) throw new Error('readback');
    return 'filled';
  } catch {
    // Restore the entire original group BEFORE restoration events. A controlled
    // page may refuse restoration or replace nodes; report that explicitly.
    for (const [control,value] of originals) { try { if(control.isConnected)setter.call(control,value); } catch { /* check below */ } }
    try { send(originals); } catch { /* check below */ }
    return matches(originals) ? 'failed' : 'rollbackFailed';
  }
}
function fillSlotResult(doc,id,now = new Date()) {
  if (doc.defaultView.location?.hostname !== 'x.com') return 'missing';
  const detected = detectControls(doc), at = nextSlot(id,now);
  if (!detected.ready || !at) return detected.reason || 'missing';
  const year=detected.maps ? detected.maps.year.get(at.getFullYear()) : optionValue(detected.fields.year,at.getFullYear());
  if (year===null || year===undefined) return 'yearMissing';
  if (!withinDateBounds(detected.fields.dateInput,at)) return 'range';
  const values = fieldValues(detected.fields,at,detected.maps);
  return values ? writeNativeControls(doc,values) : 'optionsMissing';
}
function fillSlot(doc,id,now = new Date()) {return fillSlotResult(doc,id,now)==='filled';}
function diagnostic(counts) {
  return ['schedDialog','dateCtl','timeCtl','selects'].map(key=>`${key}=${Number.isSafeInteger(counts?.[key]) && counts[key]>=0 ? counts[key] : 0}`).join(' ');
}
globalThis.XSCHED_QUICK = {QUICK_CONFIG,SLOT_IDS,nextSlot,detectControls,fillSlot,fillSlotResult,fieldValues,diagnostic};
})();
