import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHTML} from 'linkedom';
await import('../probe/quick.js');await import('../probe/ui.js');await import('../probe/skeleton.js');
const Q=globalThis.XSCHED_QUICK, U=globalThis.XSCHED_UI, S=globalThis.XSCHED_SKELETON;
const original=Object.getOwnPropertyDescriptor(parseHTML('<html></html>').document.defaultView.HTMLSelectElement.prototype,'value');
after(()=>Object.defineProperty(parseHTML('<html></html>').document.defaultView.HTMLSelectElement.prototype,'value',original));
function fixture(name='dialog') {
 const {document}=parseHTML(readFileSync(new URL(`../fixtures/quick-real-${name}.html`,import.meta.url),'utf8'));
 document.defaultView.location={hostname:'x.com'};
 Object.defineProperty(document.defaultView.HTMLSelectElement.prototype,'value',{configurable:true,
  get(){return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? '';},
  set(value){for(const option of this.querySelectorAll('option'))option.removeAttribute('selected');for(const option of this.querySelectorAll('option'))if(option.value===value){option.setAttribute('selected','');break;}}
 });
 const counts={click:0,submit:0,input:0,change:0};
 for(const button of document.querySelectorAll('button'))button.addEventListener('click',()=>counts.click++);
 for(const form of document.querySelectorAll('form'))form.addEventListener('submit',()=>counts.submit++);
 for(const select of document.querySelectorAll('select'))for(const type of ['input','change'])select.addEventListener(type,event=>{assert.equal(event.bubbles,true);counts[type]++;});
 const field=key=>document.getElementById('fake-select-'+key);
 const values=()=>Object.fromEntries(['month','day','year','hour','minute','period'].map(key=>[key,field(key)?.value]));
 return {document,counts,field,values};
}
const now=new Date(2027,11,31,21,0);
test('true skeleton structure: nested dialogs, two groups, empty testids, linked labels, 6 counted controls',()=>{
 const f=fixture();const detected=Q.detectControls(f.document);
 assert.equal(detected.ready,true);assert.deepEqual(detected.counts,{schedDialog:1,dateCtl:3,timeCtl:3,selects:6});
 assert.equal(f.document.querySelector('select').getAttribute('data-testid'),'');
 for(const id of Q.SLOT_IDS) {
  assert.equal(Q.fillSlotResult(f.document,id,now),'filled');
  const at=Q.nextSlot(id,now),v=f.values();
  assert.deepEqual(v,{month:'fake-month-1',day:String(at.getDate()),year:'2028',hour:String(at.getHours()%12||12),minute:String(at.getMinutes()),period:at.getHours()<12?'fake-period-0':'fake-period-1'});
 }
 assert.equal(f.counts.change,24);assert.equal(f.counts.input,24);assert.equal(f.counts.click+f.counts.submit,0);
 assert.equal(f.document.querySelector('input[type=date]').value,'2027-01-01','calendar input is never written');
});
test('numeric value and calendar text fallback; full zero-based months require agreeing month labels',()=>{
 const f=fixture();const opts=[...f.field('month').querySelectorAll('option:not([disabled])')];
 opts.forEach((option,index)=>option.setAttribute('value',String(index)));
 assert.equal(Q.fillSlotResult(f.document,'lunch',now),'filled');assert.equal(f.field('month').value,'0');
 const g=fixture();for(const field of ['day','hour','minute','year'])for(const option of g.field(field).querySelectorAll('option:not([disabled])'))option.textContent='Neutral';
 assert.equal(Q.fillSlot(g.document,'evening',now),true,'numeric values provide fallback when text does not parse');
 const h=fixture();h.field('day').querySelector('option[value="1"]').textContent='2';const before=h.values();
 assert.equal(Q.fillSlotResult(h.document,'lunch',now),'optionsMissing');assert.deepEqual(h.values(),before);assert.equal(h.counts.change,0);
});
test('AM/PM value, words and position must agree; twelve AM/PM boundary values are exact',()=>{
 const f=fixture();const detected=Q.detectControls(f.document);
 for(const [hour,wantedHour,period] of [[0,'12','fake-period-0'],[12,'12','fake-period-1'],[11,'11','fake-period-0'],[23,'11','fake-period-1']]) {
  const values=Q.fieldValues(detected.fields,new Date(2028,0,1,hour,5),detected.maps);
  assert.equal(values.find(([control])=>control===f.field('hour'))[1],wantedHour);
  assert.equal(values.find(([control])=>control===f.field('period'))[1],period);
 }
 for(const words of [['AM','PM'],['上午','下午'],['午前','午後'],['오전','오후'],['a. m.','p. m.'],['matin','après-midi'],['vormittags','nachmittags'],['manhã','tarde']]) {
  const g=fixture();[...g.field('period').querySelectorAll('option')].forEach((option,index)=>{option.textContent=words[index];});assert.equal(Q.detectControls(g.document).ready,true,words.join('/'));
 }
 for(const edit of [select=>select.prepend(select.lastElementChild),select=>select.firstElementChild.setAttribute('value','PM'),select=>select.firstElementChild.textContent='Unknown']) {
  const g=fixture();edit(g.field('period'));const before=g.values();assert.equal(Q.fillSlot(g.document,'morning',now),false);assert.deepEqual(g.values(),before);assert.equal(g.counts.input,0);
 }
});
test('missing target year is distinct and no fields/events change; missing day/minute options are atomic',()=>{
 const f=fixture('year-missing');const before=f.values();assert.equal(Q.detectControls(f.document).ready,true);
 assert.equal(Q.fillSlotResult(f.document,'morning',now),'yearMissing');assert.deepEqual(f.values(),before);assert.equal(f.counts.input+f.counts.change,0);
 for(const field of ['day','minute']) {
  const g=fixture();g.field(field).querySelector(`option[value="${field==='day'?'1':'30'}"]`).remove();const before=g.values();
  assert.equal(Q.fillSlotResult(g.document,'lunch',now),'optionsMissing');assert.deepEqual(g.values(),before);assert.equal(g.counts.change,0);
 }
});
test('after-event readback mismatch restores entire group and emits restoration input/change with no activation',()=>{
 const f=fixture();const before=f.values();let rejected=false;
 f.field('hour').addEventListener('change',()=>{if(!rejected&&f.field('hour').value==='8'){rejected=true;f.field('hour').value='';}});
 assert.equal(Q.fillSlotResult(f.document,'evening',now),'failed');assert.deepEqual(f.values(),before);
 assert.deepEqual(f.counts,{click:0,submit:0,input:12,change:12});
});
test('restoration refusal or replaced controls reports incomplete restoration, never success',()=>{
 const f=fixture();let phase=0;f.field('hour').addEventListener('change',()=>{phase++;f.field('hour').value=phase===1?'':'1';});
 assert.equal(Q.fillSlotResult(f.document,'evening',now),'rollbackFailed');assert.equal(f.counts.click+f.counts.submit,0);
 const g=fixture();g.field('hour').addEventListener('change',()=>g.field('hour').remove());
 assert.equal(Q.fillSlotResult(g.document,'evening',now),'rollbackFailed');assert.equal(g.counts.click+g.counts.submit,0);
 const h=fixture(),before=h.values(),oldHour=h.field('hour');let replacement,replacementEvents=0;
 oldHour.addEventListener('change',()=>{
  replacement=oldHour.cloneNode(true);replacement.value='1';
  for(const type of ['input','change'])replacement.addEventListener(type,()=>replacementEvents++);
  oldHour.replaceWith(replacement);
 });
 assert.equal(Q.fillSlotResult(h.document,'evening',now),'rollbackFailed');
 assert.equal(h.field('hour'),replacement);assert.equal(replacement.value,'1','replacement remains at the page-chosen value');
 assert.equal(replacementEvents,0,'no guessed restoration writes or events on a replacement node');
 for(const key of ['month','day','year','minute','period'])assert.equal(h.field(key).value,before[key],'all surviving original controls restored: '+key);
 assert.equal(h.counts.click+h.counts.submit,0);
});
test('calendar bounds are checked but calendar input/button and min/max are never modified',()=>{
 for(const attrs of [{max:'2027-12-31'},{min:'2028-02-01'},{max:'unknown'},{min:'2028-02-30'}]) {
  const f=fixture();const input=f.document.querySelector('input[type=date]');for(const [key,value] of Object.entries(attrs))input.setAttribute(key,value);const before=f.values(),inputBefore=input.toString();
  assert.equal(Q.fillSlotResult(f.document,'lunch',now),'range');assert.deepEqual(f.values(),before);assert.equal(input.toString(),inputBefore);assert.equal(f.counts.input+f.counts.change+f.counts.click+f.counts.submit,0);
 }
});
test('label identity, grouping, ambiguity, disabled, duplicate options, and partial controls fail closed',()=>{
 const edits=[
 f=>f.field('month').removeAttribute('aria-labelledby'),
 f=>f.document.querySelector('label[id]').id='changed-fixture-label',
 f=>f.document.body.append(f.document.querySelector('label[id]').cloneNode(true)),
 f=>f.field('hour').setAttribute('disabled',''),
 f=>f.field('minute').append(f.field('minute').querySelector('option[value="30"]').cloneNode(true)),
 f=>f.field('minute').remove(),
 f=>f.document.body.append(f.document.querySelector('[aria-modal]').cloneNode(true)),
 ];
 for(const edit of edits){const f=fixture();edit(f);const before=f.values();assert.equal(Q.fillSlot(f.document,'lunch',now),false);assert.deepEqual(f.values(),before);assert.equal(f.counts.change,0);}
});
test('safe select/label testid export is narrowly scoped and never exposes identity or option data',()=>{
 const f=fixture();f.field('month').setAttribute('data-testid','select-month');f.document.querySelector('label[id]').setAttribute('data-testid','month-label');
 f.document.querySelector('[aria-modal]').setAttribute('data-testid','select-month');
 const output=S.buildSkeleton(f.document);assert.match(output,/select .*data-testid=select-month/);assert.match(output,/label .*data-testid=month-label/);assert.match(output,/div .*data-testid=x/);
 for(const secret of ['@decoy_handle','decoy@example.invalid','https://example.invalid/private','123456789012345','550e8400-e29b-41d4-a716-446655440000','decoy_handle','select-decoy_handle']) {
  f.field('month').setAttribute('data-testid',secret);f.document.querySelector('label[id]').setAttribute('data-testid',secret);
  const masked=S.buildSkeleton(f.document);assert.ok(!masked.includes(secret),secret);
 }
 assert.ok(!output.includes('fake-month'));assert.ok(!output.includes('2027'));assert.ok(!output.includes('上午'));
});
test('all nine languages have distinct year/options/readback/rollback/range error labels',()=>{
 for(const strings of Object.values(U.QUICK_STRINGS))for(const key of ['yearMissing','optionsMissing','failed','rollbackFailed','range'])assert.ok(strings[key]?.length,key);
 assert.equal(U.QUICK_STRINGS['zh-Hant'].yearMissing,'目標年份不在 X 的選項中');
});

test('neutral linked labels infer roles from complete domains; 24h and stepped minutes remain unambiguous',()=>{
 const f=fixture();for(const label of f.document.querySelectorAll('label[id]'))label.textContent='Neutral fixture label';
 assert.equal(Q.detectControls(f.document).ready,true);assert.equal(Q.fillSlot(f.document,'evening',now),true);
 const g=fixture();g.field('period').parentElement.remove();const hour=g.field('hour');hour.replaceChildren();
 for(let i=0;i<24;i++){const option=g.document.createElement('option');option.value=String(i);option.textContent=String(i);hour.append(option);}
 const minute=g.field('minute');for(const option of [...minute.querySelectorAll('option')])if(!['0','30'].includes(option.value))option.remove();
 for(const label of g.document.querySelectorAll('label[id]'))label.textContent='Neutral fixture label';
 assert.equal(Q.detectControls(g.document).ready,true);assert.equal(Q.fillSlot(g.document,'evening',now),true);
 assert.equal(hour.value,'20');assert.equal(minute.value,'0');assert.equal(g.counts.change,5);
});

test('disabled duplicate target values and hidden options cannot be selected through the new mapper',()=>{
 for(const edit of [
  field=>{const copy=field.querySelector('option[value="30"]').cloneNode(true);copy.setAttribute('disabled','');field.prepend(copy);},
  field=>field.querySelector('option[value="30"]').setAttribute('hidden',''),
 ]) {
  const f=fixture();edit(f.field('minute'));const before=f.values();assert.equal(Q.fillSlotResult(f.document,'lunch',now),'optionsMissing');assert.deepEqual(f.values(),before);assert.equal(f.counts.change,0);
 }
});
