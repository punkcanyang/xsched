import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
import {nativeWriterSelfTest,scanSource} from '../scripts/verify.mjs';
import {runNode} from '../scripts/test-cli.mjs';
await import('../probe/quick.js');
await import('../probe/ui.js');
await import('../probe/reader.js');
await import('../probe/skeleton.js');
const Q=globalThis.XSCHED_QUICK;
const html=readFileSync(new URL('../fixtures/quick-dialog.html',import.meta.url),'utf8');
const {document:sample}=parseHTML(html);
// linkedom intentionally has no native select value setter. Model the browser
// prototype setter (never production fallback); Chrome e2e checks the real setter.
const prototype=sample.defaultView.HTMLSelectElement.prototype;
const original=Object.getOwnPropertyDescriptor(prototype,'value');
Object.defineProperty(prototype,'value',{configurable:true,get(){return original.get.call(this) ?? this.querySelector('option')?.getAttribute('value');},set(value){for(const option of this.querySelectorAll('option'))option.removeAttribute('selected');this.querySelectorAll('option').forEach(option=>{if(option.getAttribute('value')===value)option.setAttribute('selected','');});}});
after(()=>Object.defineProperty(prototype,'value',original));
function fixture(file='quick-dialog') {
  const {document}=parseHTML(readFileSync(new URL(`../fixtures/${file}.html`,import.meta.url),'utf8'));
  document.defaultView.location={hostname:'x.com'};
  const sends={click:0,submit:0,input:0,change:0};
  for(const el of document.querySelectorAll('button'))el.addEventListener('click',()=>sends.click++);
  for(const el of document.querySelectorAll('form'))el.addEventListener('submit',()=>sends.submit++);
  for(const el of document.querySelectorAll('select'))for(const type of ['input','change'])el.addEventListener(type,event=>{assert.equal(event.bubbles,true);sends[type]++;});
  return {document,sends,values:()=>[...document.querySelectorAll('select')].map(el=>[el.name,el.value])};
}
function localParts(at) {return [at.getFullYear(),at.getMonth()+1,at.getDate(),at.getHours(),at.getMinutes()];}
const now=new Date(2027,11,31,21,0);
test('four local future slots cross years, months and leap days; five-minute margin',()=>{
  for(const [id,clock,expected] of [
    ['morning',now,[2028,1,1,9,0]],['lunch',now,[2028,1,1,12,30]],['evening',now,[2028,1,1,20,0]],
    ['morning',new Date(2027,0,31,10),[2027,2,1,9,0]],
    ['morning',new Date(2028,1,28,21),[2028,2,29,9,0]],
    ['morning',new Date(2027,0,1,8,55),[2027,1,1,9,0]],
    ['morning',new Date(2027,0,1,8,55,1),[2027,1,2,9,0]],
    ['lunch',new Date(2027,0,1,12,26),[2027,1,2,12,30]],
    ['evening',new Date(2027,0,1,19,54),[2027,1,1,20,0]],
  ]) {const at=Q.nextSlot(id,clock);assert.deepEqual(localParts(at),expected);assert.ok(at-clock>=300000);}
  assert.equal(Q.nextSlot('unknown',now),null);assert.equal(Q.nextSlot('morning',new Date(NaN)),null);
});
test('next workday is strictly next weekday, skips weekends and crosses a year',()=>{
  for(const [clock,expected] of [[now,[2028,1,3,9,0]],[new Date(2027,0,2,1),[2027,1,4,9,0]],[new Date(2027,0,3,1),[2027,1,4,9,0]],[new Date(2027,0,4,1),[2027,1,5,9,0]]]) assert.deepEqual(localParts(Q.nextSlot('workday',clock)),expected);
});
test('complete native picker is counted without exposing any values',()=>{
  const f=fixture();assert.equal(Q.detectControls(f.document).ready,true);
  assert.deepEqual(Q.detectControls(f.document).counts,{schedDialog:1,dateCtl:3,timeCtl:3,selects:6});
  assert.equal(Q.diagnostic(Q.detectControls(f.document).counts),'schedDialog=1 dateCtl=3 timeCtl=3 selects=6');
  assert.equal(Q.diagnostic({schedDialog:'@secret',dateCtl:NaN,timeCtl:-1,selects:1.5}),'schedDialog=0 dateCtl=0 timeCtl=0 selects=0');
});
test('fills ALL native values before bubbling events, with zero clicks/submits',()=>{
  const f=fixture();const firstInput=[];
  f.document.addEventListener('input',()=>firstInput.push(f.values()));
  assert.equal(Q.fillSlot(f.document,'lunch',now),true);
  const expected=[['month','1'],['day','1'],['year','2028'],['hour','12'],['minute','30'],['period','PM']];
  assert.deepEqual(f.values(),expected);assert.deepEqual(firstInput[0],expected);
  assert.deepEqual(f.sends,{click:0,submit:0,input:6,change:6});
});
test('12-hour and explicit 24-hour domains fill correctly',()=>{
  for(const id of Q.SLOT_IDS) {
    const f=fixture();const at=Q.nextSlot(id,now);
    assert.equal(Q.fillSlot(f.document,id,now),true);
    const fields=Q.detectControls(f.document).fields;
    assert.equal(fields.hour.value,String(at.getHours()%12||12));assert.equal(fields.period.value,at.getHours()<12?'AM':'PM');
    assert.equal(f.sends.click+f.sends.submit,0);
  }
  const f=fixture();f.document.querySelector('select[name=period]').remove();
  const hour=f.document.querySelector('select[name=hour]');hour.replaceChildren();
  for(let i=0;i<24;i++){const option=f.document.createElement('option');option.setAttribute('value',String(i).padStart(2,'0'));hour.append(option);}
  assert.equal(Q.fillSlot(f.document,'evening',now),true);assert.equal(hour.value,'20');assert.equal(f.sends.change,5);
});
test('absent and partial fields never half-fill or emit events',()=>{
  for(const file of ['quick-missing','quick-partial']) {
    const f=fixture(file);const before=f.values();assert.equal(Q.detectControls(f.document).ready,false);
    for(const id of Q.SLOT_IDS)assert.equal(Q.fillSlot(f.document,id,now),false);
    assert.deepEqual(f.values(),before);assert.deepEqual(f.sends,{click:0,submit:0,input:0,change:0});
  }
});
test('unrepresentable minute/year, duplicate options and zero-based month fail atomically',()=>{
  const edits=[
    doc=>doc.querySelector('select[name=minute] option[value="30"]').remove(),
    doc=>doc.querySelector('select[name=year] option[value="2028"]').remove(),
    doc=>{const select=doc.querySelector('select[name=minute]');select.append(select.querySelector('option[value="30"]').cloneNode(true));},
    doc=>{const select=doc.querySelector('select[name=month]');select.querySelector('option[value="12"]').setAttribute('value','0');},
    doc=>doc.querySelector('select[name=day] option[value="1"]').setAttribute('disabled',''),
  ];
  for(const edit of edits){const f=fixture();edit(f.document);const before=f.values();assert.equal(Q.fillSlot(f.document,'lunch',now),false);assert.deepEqual(f.values(),before);assert.equal(f.sends.input+f.sends.change,0);}
});
test('hidden, disabled, ambiguous and non-x.com pickers fail closed',()=>{
  const edits=[
    doc=>doc.querySelector('[role=dialog]').setAttribute('hidden',''),
    doc=>doc.querySelector('select[name=day]').setAttribute('disabled',''),
    doc=>{const control=doc.querySelector('select[name=day]');control.parentElement.append(control.cloneNode(true));},
    doc=>doc.body.append(doc.querySelector('[role=dialog]').cloneNode(true)),
    doc=>{doc.defaultView.location={hostname:'twitter.com'};},
    doc=>doc.querySelector('[role=dialog]').setAttribute('aria-hidden','true'),
    doc=>{for(const el of doc.querySelectorAll('[data-testid]'))el.removeAttribute('data-testid');},
  ];
  for(const edit of edits){const f=fixture();edit(f.document);const before=f.values();assert.equal(Q.fillSlot(f.document,'morning',now),false);assert.deepEqual(f.values(),before);assert.equal(f.sends.change,0);}
});
test('setter failure restores all values and emits restoration events; missing native setter never writes',()=>{
  const f=fixture();const before=f.values();
  Object.defineProperty(prototype,'value',{...Object.getOwnPropertyDescriptor(prototype,'value'),set:undefined});
  assert.equal(Q.fillSlot(f.document,'lunch',now),false);assert.deepEqual(f.values(),before);assert.equal(f.sends.change,0);
  // Restore the test-only browser model for the remaining cases.
  Object.defineProperty(prototype,'value',{configurable:true,get(){return original.get.call(this) ?? this.querySelector('option')?.getAttribute('value');},set(value){if(this.name==='year'&&value==='2028')throw Error('refuse');for(const o of this.querySelectorAll('option'))o.removeAttribute('selected');for(const o of this.querySelectorAll('option'))if(o.getAttribute('value')===value)o.setAttribute('selected','');}});
  assert.equal(Q.fillSlot(f.document,'lunch',now),false);assert.deepEqual(f.values(),before);assert.equal(f.sends.input,6);assert.equal(f.sends.change,6);assert.equal(f.sends.click+f.sends.submit,0);
});
test('nine localized slot/status labels, aria/title sources and language fallback',()=>{
  const U=globalThis.XSCHED_UI;assert.deepEqual(Object.keys(U.QUICK_STRINGS).sort(),Object.keys(U.STRINGS).sort());
  for(const [lang,strings] of Object.entries(U.QUICK_STRINGS)){assert.equal(strings.slots.length,4);for(const value of [...strings.slots,strings.heading,strings.missing,strings.ready,strings.filled])assert.ok(value.length>0);assert.equal(U.quickStringsFor(lang,'en'),strings);}
  assert.equal(U.quickStringsFor('unknown','zh-TW'),U.QUICK_STRINGS['zh-Hant']);assert.equal(U.quickStringsFor('unknown','unknown'),U.QUICK_STRINGS.en);
});
test('skeleton visits native dialog; option labels/values never become calendar samples',()=>{
  const f=fixture();const option=f.document.querySelector('option');option.textContent='Jan 1 2028 9:00 AM private @decoy_handle decoy@example.invalid https://example.invalid/private';
  const result=globalThis.XSCHED_SKELETON.buildSkeleton(f.document,{pathname:'/compose/post'});
  assert.match(result,/role=dialog/);assert.match(result,/select /);assert.match(result,/option /);
  for(const text of ['Jan','2028','9:00','private','decoy_handle','decoy@example','https://example'])assert.ok(!result.includes(text),text);
  assert.ok(!result.includes('calendar='));
});
test('native event writer guard accepts only exact audited file and catches activation attacks',()=>{
  assert.equal(nativeWriterSelfTest(),39);
  const source=readFileSync(new URL('../probe/quick.js',import.meta.url),'utf8');
  assert.deepEqual(scanSource(source,'probe/quick.js',{quickModule:true}),[]);
  assert.ok(scanSource(source,'probe/other.js').length);
});

test('unknown picker counts six selects without guessing date/time roles or changing fields',()=>{
  const f=fixture();for(const el of f.document.querySelectorAll('[data-testid]'))el.removeAttribute('data-testid');
  assert.deepEqual(Q.detectControls(f.document).counts,{schedDialog:0,dateCtl:0,timeCtl:0,selects:6});
  assert.equal(Q.detectControls(f.document).ready,false);
});

test('local timezone arithmetic keeps wall-clock slots across DST and business weekends',()=>{
  const result=runNode(['--input-type=module','-e',`
    await import('./probe/quick.js');
    const Q=globalThis.XSCHED_QUICK;
    const at=Q.nextSlot('morning',new Date(2027,2,13,21,0));
    const work=Q.nextSlot('workday',new Date(2027,2,12,21,0));
    if(at.toISOString()!=='2027-03-14T13:00:00.000Z'||work.toISOString()!=='2027-03-15T13:00:00.000Z')process.exit(1);
  `],{env:{...process.env,TZ:'America/New_York'}});
  assert.equal(result.status,0,result.stderr.toString());
});
