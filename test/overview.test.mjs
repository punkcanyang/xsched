import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runNode} from '../scripts/test-cli.mjs';
import {parseHTML} from 'linkedom';
await import('../probe/reader.js');
await import('../probe/overview.js');
const O=globalThis.XSCHED_OVERVIEW, R=globalThis.XSCHED_READER;
const html=readFileSync(new URL('../fixtures/overview.html',import.meta.url),'utf8');
const read=doc=>R.readSnapshot(doc,{pathname:'/compose/post/unsent/scheduled'});
const item=(date,preview='Fake preview')=>({at:date,preview});
test('groups local calendar days, cross month, sorted times, and both empty days',()=>{
 const {document}=parseHTML(html);const report=read(document);assert.equal(report.items.length,7);
 const model=O.groupDays(report.items);
 assert.deepEqual(model.days.map(d=>[d.key,d.items.length]),[['2027-02-28',1],['2027-03-01',2],['2027-03-02',0],['2027-03-03',1],['2027-03-04',0],['2027-03-05',3]]);
 assert.equal(model.days[1].items[0].at.getHours(),9);assert.equal(model.days[1].items[1].at.getHours(),20);
 assert.equal(model.omittedDays,0);
});
test('23:59/00:00 and cross-year dates use local day components',()=>{
 const model=O.groupDays([item(new Date(2028,0,1,0,0)),item(new Date(2027,11,31,23,59))]);
 assert.deepEqual(model.days.map(d=>d.key),['2027-12-31','2028-01-01']);
});
test('calendar iteration across DST is verified in three explicit time zones',()=>{
 const script=`await import('./probe/overview.js');const O=globalThis.XSCHED_OVERVIEW;console.log(JSON.stringify(O.groupDays([{at:new Date(2027,2,13,23,59)},{at:new Date(2027,2,15,0,0)}]).days.map(d=>d.key)));`;
 for(const TZ of ['America/New_York','Asia/Taipei','Pacific/Auckland']) {
  const result=runNode(['--input-type=module','-e',script],{env:{...process.env,TZ},timeout:10000});
  assert.equal(result.status,0,result.stderr.toString());
  assert.deepEqual(JSON.parse(result.stdout.toString()),['2027-03-13','2027-03-14','2027-03-15']);
 }
});
test('90-day cap bounds long empty ranges and reports omitted days and posts',()=>{
 const rows=[item(new Date(2027,0,1)),item(new Date(2028,0,1))];const model=O.groupDays(rows);
 assert.equal(model.days.length,90);assert.equal(model.totalDays,366);assert.equal(model.omittedDays,276);assert.equal(model.omittedPosts,1);
 for(const cap of [100000,-5,0,NaN,Infinity]) assert.ok(O.groupDays(rows,cap).days.length<=90);
 assert.equal(O.groupDays(rows,1).days.length,1);
});
test('empty input and unparsed items are kept separately without invented dates',()=>{
 assert.deepEqual(O.groupDays([]),{days:[],unknown:[],totalDays:0,omittedDays:0,omittedPosts:0});
 const unknown=[{at:null,preview:'fake'},{at:new Date(NaN)}];assert.deepEqual(O.groupDays(unknown).unknown,unknown);
 assert.equal(O.groupDays(unknown).days.length,0);
});
test('nine languages include labels, empty days, hints, counts, actions, and weekday headings',()=>{
 assert.deepEqual(Object.keys(O.STRINGS).sort(),['zh-Hant','zh-Hans','en','ja','ko','es','fr','de','pt'].sort());
 for(const lang of Object.keys(O.STRINGS)) {
  assert.equal(O.stringsFor(lang,'en'),O.STRINGS[lang]);
  for(const value of Object.values(O.STRINGS[lang])) assert.ok(value.length);
  assert.match(O.dayTitle(new Date(2027,2,1),lang,'en'),/^2027-03-01 \(.+\)$/);
 }
 assert.equal(O.stringsFor('zh-TW','en'),O.STRINGS['zh-Hant']);assert.equal(O.stringsFor('unknown','fr-FR'),O.STRINGS.fr);
 assert.equal(O.stringsFor('unknown','unknown'),O.STRINGS.en);
});
test('same-read native reference is non-enumerable, rejects disconnected or reused nodes, refreshes accumulation',()=>{
 const {document}=parseHTML(html);const report=read(document);const old=report.items[0];const row=R.nativeRowFor(old);const replacement=row.cloneNode(true);
 assert.ok(row===document.querySelector('#fake-row-0'));assert.equal(JSON.stringify(old).includes('fake-row'),false);
 assert.deepEqual(Object.keys(old),['time','preview','key','lang','tier','at','unparsed']);
 row.querySelector('[data-testid=tweetText]').textContent='Different synthetic recycled post';assert.equal(R.nativeRowFor(old),null);
 const newer=read(document).items;assert.equal(R.mergeItems([old],newer).length,8);
 row.remove();assert.equal(R.nativeRowFor(newer[0]),null);
 document.querySelector('#sched-list').prepend(replacement);
 const latest=read(document).items;const merged=R.mergeItems([old],latest);
 assert.equal(merged[0],old);assert.ok(R.nativeRowFor(old)===replacement);
});
test('fallback readers retain safe references without changing serialized output',()=>{
 for(const file of ['roles']) {
  const url=new URL(`../fixtures/${file}.html`,import.meta.url);
  const text=readFileSync(url,'utf8');
  const {document}=parseHTML(text);const report=read(document);
  for(const row of report.items) assert.ok(R.nativeRowFor(row)?.isConnected);
 }
});
function surface() {
 const {document}=parseHTML(html);const host=document.createElement('div');host.id='xsched-probe-root';document.body.append(host);
 const shadow=host.attachShadow({mode:'open'});const container=document.createElement('div');shadow.append(container);
 const timers=new Map();let id=0;
 const controller=O.createController({window:{setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);}},resolveRow:R.nativeRowFor});
 return {document,host,shadow,container,timers,controller};
}
function trustedClick(document,node,trusted=true) {const event=new document.defaultView.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:trusted});node.dispatchEvent(event);}
test('click only scrolls native row and creates a transient own shadow outline; X subtree never changes',async()=>{
 const f=surface(), rows=read(f.document).items, native=f.document.querySelector('#sched-list');
 let scrolls=0;const row=R.nativeRowFor(rows[0]);row.scrollIntoView=options=>{assert.deepEqual(options,{block:'center',behavior:'instant'});scrolls++;};
 row.getBoundingClientRect=()=>({left:10,top:20,width:100,height:50});
 const before=native.toString(), records=[];const observer=new f.document.defaultView.MutationObserver(list=>records.push(...list));observer.observe(native,{subtree:true,childList:true,attributes:true,characterData:true});
 f.controller.render(f.container,rows);
 const button=f.shadow.querySelector('[data-xsched-overview-item="0"]');trustedClick(f.document,button,false);assert.equal(scrolls,0);
 trustedClick(f.document,button);assert.equal(scrolls,1);assert.ok(f.shadow.querySelector('.overview-highlight'));assert.equal(f.document.querySelector('.overview-highlight'),null);
 for(const fn of [...f.timers.values()])fn();assert.equal(f.shadow.querySelector('.overview-highlight'),null);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(records.length,0);assert.equal(native.toString(),before);observer.disconnect();
});
test('recycled references show hint without scrolling, including synchronous recycling during scroll',()=>{
 const f=surface();const rows=read(f.document).items;const row=R.nativeRowFor(rows[0]);let calls=0;
 row.scrollIntoView=()=>{calls++;row.querySelector('[data-testid=tweetText]').textContent='Fake replacement';};
 f.controller.render(f.container,rows);trustedClick(f.document,f.shadow.querySelector('[data-xsched-overview-item="0"]'));
 assert.equal(calls,1);assert.match(f.shadow.querySelector('.overview-status').textContent,/Scroll the X list/);assert.equal(f.shadow.querySelector('.overview-highlight'),null);
 trustedClick(f.document,f.shadow.querySelector('[data-xsched-overview-item="0"]'));assert.equal(calls,1);
});
test('render refuses foreign roots and non-Scheduled clicks never scroll X',()=>{
 const f=surface();const rows=read(f.document).items;let scrolls=0;R.nativeRowFor(rows[0]).scrollIntoView=()=>scrolls++;
 const before=f.document.body.toString();f.controller.render(f.document.body,rows);assert.equal(f.document.body.toString(),before);
 f.controller.render(f.container,rows,{onScheduled:false});trustedClick(f.document,f.shadow.querySelector('[data-xsched-overview-item="0"]'));assert.equal(scrolls,0);
 assert.ok(f.shadow.querySelector('.overview-hint').textContent.includes('Scheduled'));
});
test('verify exact scroll boundary and all overview/native-write attack self-tests remain mandatory',async()=>{
 const {scanSource,overviewSelfTest}=await import('../scripts/verify.mjs');const source=readFileSync(new URL('../probe/overview.js',import.meta.url),'utf8');
 assert.deepEqual(scanSource(source,'overview.js',{overviewModule:true}),[]);assert.equal(overviewSelfTest(),22);
 for(const name of ['remove','removeChild','replaceWith','setAttribute']) assert.ok(scanSource(source+`\nrow.${name}();`,'overview.js',{overviewModule:true}).length);
});
