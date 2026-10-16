import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {scanSource,calendarBoundarySelfTest} from '../scripts/verify.mjs';
await import('../probe/reader.js');
await import('../probe/overview.js');
await import('../probe/calendar.js');
const R=globalThis.XSCHED_READER, O=globalThis.XSCHED_OVERVIEW, C=globalThis.XSCHED_CALENDAR;
const storeSource=readFileSync(new URL('../probe/calendar-store.js',import.meta.url),'utf8');
const calendarSource=readFileSync(new URL('../probe/calendar.js',import.meta.url),'utf8');
const DATA='xsched.probe.calendar',TARGET='xsched.probe.calendarTarget';
const NOW=new Date(2027,11,31,21).getTime();
function storage(hostname='x.com') {
 const local=new Map(),session=new Map(),calls=[];
 const adapter=(data,type)=>({getItem(key){calls.push([type,'get',key]);return data.get(key)??null;},setItem(key,value){calls.push([type,'set',key]);data.set(key,value);},removeItem(key){calls.push([type,'remove',key]);data.delete(key);}});
 const location={hostname,pathname:'/compose/post/unsent/scheduled',assign(url){calls.push(['navigate',url]);}};
 const window={location,localStorage:adapter(local,'local'),sessionStorage:adapter(session,'session')};
 const context=vm.createContext({window,location,Date:class extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}});
 vm.runInContext(storeSource,context);
 return {local,session,calls,window,context,store:context.XSCHED_CALENDAR_STORE};
}
const json=value=>JSON.parse(JSON.stringify(value));
const good=()=>({version:1,syncedAt:NOW,partial:false,items:[{time:new Date(2028,0,1,9).getTime(),preview:'假資料😀'.repeat(4)}]});
test('0.3.0 strict calendar storage: bounded version/schema/codepoint data, invalid JSON is discarded, no other keys',()=>{
 const f=storage();const value=good();
 assert.equal(f.store.save(value),true);assert.deepEqual(json(f.store.load()),value);
 for(const bad of [null,[],{...value,version:2},{...value,extra:1},{...value,syncedAt:'1'},{...value,syncedAt:NaN},{...value,partial:1},{...value,items:[{time:NOW,preview:'a'.repeat(21)}]},{...value,items:[{time:NOW,preview:'ok',body:'private'}]},{...value,items:[{time:8640000000000001,preview:''}]},{...value,items:[{time:0,preview:''}]},{...value,items:Array(2001).fill(value.items[0])}]) {
  assert.equal(f.store.save(bad),false);
 }
 for(const raw of ['{','null','[]',JSON.stringify({...value,version:2}),JSON.stringify({...value,account:'fake'}),' '.repeat(1000001)]) {
  f.local.set(DATA,raw);assert.equal(f.store.load(),null);assert.equal(f.local.has(DATA),false);
 }
 assert.equal(f.store.save({version:1,syncedAt:0,partial:true,items:[]}),true);
 assert.equal(f.store.clear(),true);assert.equal(f.local.has(DATA),false);
 assert.ok(f.calls.every(call=>call[2]===DATA));
});
test('0.3.0 expiring edit target is one-use, exact-schema, and removed even if invalid',()=>{
 const f=storage(),item=good().items[0];
 assert.equal(f.store.putTarget(item,NOW),true);
 const raw=f.session.get(TARGET);assert.deepEqual(Object.keys(JSON.parse(raw)).sort(),['expiresAt','preview','time','version']);
 assert.equal(f.store.takeTarget(NOW).preview,item.preview);assert.equal(f.store.takeTarget(NOW),null);
 for(const [value,readAt] of [[JSON.parse(raw),NOW+120000],[{...JSON.parse(raw),expiresAt:NOW+120001},NOW],[{...JSON.parse(raw),version:2},NOW],[{...JSON.parse(raw),body:'private'},NOW]]) {
  f.session.set(TARGET,JSON.stringify(value));assert.equal(f.store.takeTarget(readAt),null);assert.equal(f.session.has(TARGET),false);
 }
 f.session.set(TARGET,'{');assert.equal(f.store.takeTarget(NOW),null);assert.equal(f.session.has(TARGET),false);
 assert.ok(f.calls.filter(call=>call[0]==='session').every(call=>call[2]===TARGET));
});
test('0.3.0 unavailable storage and non-x.com hosts fail closed without falling back to another store',()=>{
 const f=storage('twitter.com');assert.equal(f.store.load(),null);assert.equal(f.store.save(good()),false);assert.equal(f.store.putTarget(good().items[0],NOW),false);assert.equal(f.store.clear(),false);assert.equal(f.store.takeTarget(NOW),null);assert.deepEqual(f.calls,[]);
 const blocked=storage();Object.defineProperty(blocked.window,'localStorage',{get(){throw new Error('blocked');}});
 Object.defineProperty(blocked.window,'sessionStorage',{get(){throw new Error('blocked');}});
 assert.equal(blocked.store.load(),null);assert.equal(blocked.store.save(good()),false);assert.equal(blocked.store.clear(),false);assert.equal(blocked.store.putTarget(good().items[0],NOW),false);assert.equal(blocked.store.takeTarget(NOW),null);
});
function page(file='calendar.html',initialTarget=null) {
 const f=storage();const {document:doc}=parseHTML(readFileSync(new URL('../fixtures/'+file,import.meta.url),'utf8'));
 doc.defaultView.location=f.window.location;doc.defaultView.getComputedStyle=el=>({display:el.style.display,visibility:el.style.visibility});
 const create=doc.createElement.bind(doc);
 doc.createElement=(tag)=>{const el=create(tag);el.focus=()=>{};return el;};
 for(const row of doc.querySelectorAll('[data-example]'))row.getBoundingClientRect=()=>({width:200,height:50});
 const counts={rows:[],update:0,schedule:0,delete:0,post:0};
 for(const row of doc.querySelectorAll('[data-example]'))row.addEventListener('click',()=>counts.rows.push(row.dataset.example));
 for(const control of doc.querySelectorAll('[data-send]'))control.addEventListener('click',()=>counts[control.dataset.send]++);
 const host=create('div');host.id='xsched-probe-root';doc.body.append(host);const shadow=host.attachShadow({mode:'open'});
 const box=create('div'),body=create('div');shadow.append(box,body);
 const items=O.snapshot(R.readSnapshot(doc,{pathname:f.window.location.pathname,now:new Date(NOW)}).items);
 Object.assign(f.context,{XSCHED_OVERVIEW:O,document:doc});vm.runInContext(calendarSource,f.context);
 if(initialTarget)f.store.putTarget(initialTarget,NOW);
 const calendar=f.context.XSCHED_CALENDAR.create(doc,{reader:R,store:f.store,changed(){},clearData(){}});
 calendar.mount(shadow,box,body,null,items,NOW,false,false);
 const click=(selector,trusted=true)=>{const event=new doc.defaultView.Event('click',{bubbles:true,cancelable:true});Object.defineProperty(event,'isTrusted',{value:trusted});shadow.querySelector(selector).dispatchEvent(event);};
 return {...f,doc,shadow,items,calendar,counts,click};
}
test('0.3.0 calendar groups sort dates/times and gaps across midnight; Unicode and nine-language labels',()=>{
 const f=page();const groups=C.groups(f.items);
 assert.deepEqual(groups.map(group=>group.date),['2028-01-01','2028-01-02']);
 assert.deepEqual(groups.flatMap(group=>group.entries.map(row=>row.gap)),[null,45,2055]);
 const days=C.monthDays(2028,1);assert.equal(days.length,42);assert.ok(days.some(day=>day.date==='2028-02-29'&&day.current));
 for(const lang of Object.keys(C.WORDS))for(const text of Object.values(C.stringsFor(lang,'en')))assert.ok(typeof text==='string'&&text.length>0);
 assert.equal(C.stringsFor('zh-Hant','en').clear,'清除本機排程資料');assert.equal(C.stringsFor('en','en').calendar,'Calendar');
 f.calendar.dispose();
});
test('0.3.0 full calendar has 42 day grid cells, month navigation, close and Escape; untrusted click cannot expand',()=>{
 const f=page();f.click('.calendar-expand',false);assert.equal(f.shadow.querySelector('.calendar-full'),null);
 f.click('.calendar-expand');assert.equal(f.shadow.querySelectorAll('[role=gridcell]').length,42);
 assert.equal(f.shadow.querySelector('[data-calendar-date="2028-01-01"]').querySelectorAll('.calendar-entry').length,2);
 assert.deepEqual([...f.shadow.querySelectorAll('.calendar-full [data-calendar-date="2028-01-01"] .calendar-time')].map(el=>el.textContent),['09:00','09:45']);
 f.click('.calendar-next');assert.match(f.shadow.querySelector('.calendar-month').textContent,/2028-02/);
 f.click('.calendar-previous');assert.match(f.shadow.querySelector('.calendar-month').textContent,/2028-01/);
 const escape=new f.doc.defaultView.Event('keydown',{bubbles:true,cancelable:true});escape.key='Escape';f.doc.dispatchEvent(escape);assert.equal(f.shadow.querySelector('.calendar-full'),null);
 f.click('.calendar-expand');f.click('.calendar-close');assert.equal(f.shadow.querySelector('.calendar-full'),null);f.calendar.dispose();
});
test('0.3.0 two distinct trusted item clicks activate exactly their native row once and no send control',()=>{
 const f=page();f.click('.calendar-toggle');f.click('.calendar-entry',false);assert.deepEqual(f.counts.rows,[]);
 f.click('.calendar-entry');f.calendar.process();f.calendar.process();assert.deepEqual(f.counts.rows,['early']);assert.equal(f.session.has(TARGET),false);
 f.click('.calendar-expand');f.click('.calendar-full [data-calendar-date="2028-01-01"] .calendar-entry:nth-of-type(2)');f.calendar.process();
 assert.deepEqual(f.counts,{rows:['early','late'],update:0,schedule:0,delete:0,post:0});
 assert.equal(f.shadow.querySelector('.calendar-full'),null);f.calendar.dispose();
});
test('0.3.0 ambiguous and missing targets are consumed, highlight candidates only, and never retry',()=>{
 for(const file of ['calendar-ambiguous.html','calendar-missing.html']) {
  const item={time:new Date(2028,0,1,9).getTime(),preview:'Example early schedu'};
  const f=page(file,item);f.calendar.process();f.calendar.process();
  assert.deepEqual(f.counts,{rows:[],update:0,schedule:0,delete:0,post:0});assert.equal(f.session.has(TARGET),false);
  const highlighted=[...f.doc.querySelectorAll('[data-example]')].filter(row=>row.style.outline==='3px solid #ffd400');
  assert.equal(highlighted.length,file.includes('ambiguous')?2:0);
  assert.match(f.shadow.querySelector('.calendar-status').textContent,file.includes('ambiguous')?/Multiple matching/:/No matching/);
  f.calendar.dispose();assert.ok([...f.doc.querySelectorAll('[data-example]')].every(row=>row.style.outline!=='3px solid #ffd400'));
 }
});
test('0.3.0 a one-use edit target waits for the Scheduled tab/list to mount before its single attempt',()=>{
 const f=page('calendar.html',{time:new Date(2028,0,1,9).getTime(),preview:'Example early schedu'});
 const tab=f.doc.querySelector('[role=tab]');const parent=tab.parentElement;tab.remove();
 f.calendar.process();assert.deepEqual(f.counts.rows,[]);
 parent.append(tab);f.doc.querySelector('#sched-list').setAttribute('aria-busy','true');
 f.calendar.process();assert.deepEqual(f.counts.rows,[]);
 f.doc.querySelector('#sched-list').removeAttribute('aria-busy');f.calendar.process();f.calendar.process();
 assert.deepEqual(f.counts.rows,['early']);f.calendar.dispose();
});
test('0.3.0 row identification rejects hidden, disabled, form and non-Scheduled controls',()=>{
 const f=page();const early=f.doc.querySelector('[data-example=early]');
 const read=()=>C.editableRows(f.doc,R);assert.equal(read().length,3);
 early.hidden=true;assert.equal(read().length,2);early.hidden=false;
 early.disabled=true;assert.equal(read().length,2);early.disabled=false;
 early.style.display='none';assert.equal(read().length,2);early.style.display='';
 early.type='submit';assert.equal(read().length,2);early.type='button';
 const form=f.doc.createElement('form');early.parentElement.append(form);form.append(early);assert.equal(read().length,2);
 f.window.location.pathname='/home';assert.equal(read().length,0);f.calendar.dispose();
});
test('0.3.0 navigation persists only a bounded one-shot target before the fixed Scheduled navigation',()=>{
 const f=page();f.window.location.pathname='/home';f.click('.calendar-toggle');f.click('.calendar-entry');
 assert.deepEqual(f.calls.at(-1),['navigate','https://x.com/compose/post/unsent/scheduled']);
 assert.equal(JSON.parse(f.session.get(TARGET)).preview,'Example early schedu');assert.deepEqual(f.counts.rows,[]);
 f.calendar.dispose();
});
test('0.3.0 verify preserves all prior guards and rejects 31 calendar capability attacks',()=>{
 assert.equal(calendarBoundarySelfTest(),31);
 for(const source of ['row.click();','window.localStorage.getItem("xsched.probe.calendar");','window.sessionStorage.getItem("xsched.probe.calendarTarget");'])assert.ok(scanSource(source,'probe/overview.js').length);
});
