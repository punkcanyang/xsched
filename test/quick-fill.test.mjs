import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
await import('../probe/skeleton.js');await import('../probe/quick.js');
const Q=globalThis.XSCHED_QUICK,S=globalThis.XSCHED_SKELETON;
const proto=parseHTML('<html></html>').document.defaultView.HTMLSelectElement.prototype;
const descriptor=Object.getOwnPropertyDescriptor(proto,'value');
Object.defineProperty(proto,'value',{configurable:true,
 get(){return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? '';},
 set(value){for(const option of this.querySelectorAll('option'))option.removeAttribute('selected');const option=[...this.querySelectorAll('option')].find(option=>option.value===value);if(option)option.setAttribute('selected','');}
});
after(()=>Object.defineProperty(proto,'value',descriptor));
const native=Object.getOwnPropertyDescriptor(proto,'value').set;
const now=new Date(2027,11,31,21);
const pause=()=>new Promise(resolve=>setTimeout(resolve,10));
function fixture(variant='numeric', synchronous=false, paddedDays=false) {
 const {document}=parseHTML(readFileSync(new URL(`../fixtures/quick-real-${variant}.html`,import.meta.url),'utf8'));
 const window=document.defaultView;window.location={hostname:'x.com'};
 window.requestAnimationFrame=callback=>setTimeout(callback,0);window.cancelAnimationFrame=clearTimeout;
 const context=vm.createContext({document,window,HTMLSelectElement:window.HTMLSelectElement,Date,setTimeout,requestAnimationFrame:window.requestAnimationFrame});
 const rawScript=document.querySelector('script').textContent;
 const script=paddedDays ? rawScript.replace("const padded=old.querySelector('option[value=\"01\"]')!==null;",'const padded=true;') : rawScript;
 vm.runInContext(synchronous ? script.replace('function queue(){if(!queued){queued=true;requestAnimationFrame(render);}}','function queue(){render();}') : script,context);
 const field=key=>document.getElementById('fake-select-'+key);
 const values=()=>Object.fromEntries(['year','month','day','period','hour','minute'].map(key=>[key,field(key).value]));
 return {document,window,field,values};
}
function userEvent(f,node,type='click',extra={}) {
 const event=new f.window.Event(type,{bubbles:true});
 Object.defineProperty(event,'isTrusted',{value:true});Object.assign(event,extra);
 node.dispatchEvent(event);
}
function completionButton(f,text='Schedule') {
 const button=f.document.getElementById('schedule');button.textContent=text;return button;
}
function observeTwice(f) {
 assert.equal(Q.observeScheduling(f.document,now.getTime()),null,'first observation is provisional');
 return Q.observeScheduling(f.document,now.getTime());
}
test('0.1.4 completion: trusted final Schedule plus unchanged closure, one-shot observation, no extension activation',async()=>{
 const f=fixture();assert.equal(await Q.fillSlotResult(f.document,'lunch',now),'filled');
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
 const button=completionButton(f),dialog=Q.detectControls(f.document).dialog;
 userEvent(f,button);dialog.remove();
 assert.deepEqual(observeTwice(f),{time:new Date(2028,0,1,12,30).getTime()});
 assert.equal(f.window.fixtureSend.schedule,1,'only the simulated USER clicked Schedule');
 assert.equal(Q.observeScheduling(f.document,now.getTime()),null,'completion consumed once');
 assert.equal(Q.schedulingDiagnostic(f.document),'schedWatch=0 schedIntent=0');
});
test('0.1.4 closed without fill / plain close / cancel / untrusted activation never completes',async()=>{
 const blank=fixture();blank.document.querySelector('[aria-modal=true]').remove();assert.equal(observeTwice(blank),null);
 for(const mode of ['plain','cancel','escape','untrusted']) {
  const f=fixture();await Q.fillSlotResult(f.document,'evening',now);
  const dialog=Q.detectControls(f.document).dialog,button=completionButton(f,mode==='cancel'?'Cancel':'Schedule');
  if(mode==='cancel')userEvent(f,button);
  if(mode==='escape')userEvent(f,button,'keydown',{key:'Escape'});
  if(mode==='untrusted')button.dispatchEvent(new f.window.Event('click',{bubbles:true}));
  dialog.remove();assert.equal(observeTwice(f),null,mode);
 }
});
test('0.1.4 changed fields invalidate permanently, including changes during closing without events',async()=>{
 for(const mode of ['edit','closing-edit']) {
  const f=fixture();await Q.fillSlotResult(f.document,'lunch',now);
  const dialog=Q.detectControls(f.document).dialog,button=completionButton(f);
  if(mode==='closing-edit')userEvent(f,button);
  native.call(f.field('minute'),'31');
  if(mode==='edit'){userEvent(f,f.field('minute'),'input');native.call(f.field('minute'),'30');userEvent(f,button);}
  dialog.remove();assert.equal(observeTwice(f),null,mode);
 }
});
test('0.1.4 known fresh success requires final user action; errors/unknown notices veto and expiry disarms',async()=>{
 for(const mode of ['success','no-intent','error','unknown','expired']) {
  const f=fixture();await Q.fillSlotResult(f.document,'lunch',now);
  if(mode!=='no-intent')userEvent(f,completionButton(f));
  const notice=f.document.createElement('div');notice.setAttribute('role','alert');
  notice.textContent=mode==='unknown'?'Unrelated notice':'Your post was scheduled.';f.document.body.append(notice);
  if(mode==='error'){const error=f.document.createElement('div');error.setAttribute('role','alert');error.textContent='Error';f.document.body.append(error);}
  if(mode==='expired')assert.equal(Q.observeScheduling(f.document,now.getTime()+11*60000),null);
  const result=observeTwice(f);
  if(mode==='success')assert.equal(result.time,new Date(2028,0,1,12,30).getTime());else assert.equal(result,null,mode);
 }
});
test('0.1.4 picker Confirm is provisional; only original composer final Schedule can complete',async()=>{
 const f=fixture();await Q.fillSlotResult(f.document,'evening',now);
 const dialog=Q.detectControls(f.document).dialog,composer=dialog.parentElement.closest('[role=dialog]');
 const confirm=f.document.getElementById('confirm');confirm.textContent='Confirm';userEvent(f,confirm);dialog.remove();
 assert.equal(observeTwice(f),null,'Confirm closure is NOT scheduling');
 const button=f.document.createElement('button');button.textContent='Schedule';composer.append(button);
 userEvent(f,button);composer.remove();
 assert.equal(observeTwice(f).time,new Date(2028,0,1,20).getTime());
});
test('0.1.4 failed writer and disposed session cannot arm completion',async()=>{
 const failed=fixture('autocorrect');assert.equal(await Q.fillSlotResult(failed.document,'evening',now),'failed');
 userEvent(failed,completionButton(failed));failed.document.querySelector('[aria-modal=true]').remove();assert.equal(observeTwice(failed),null);
 const f=fixture();await Q.fillSlotResult(f.document,'morning',now);Q.stopSchedulingWatch(f.document);
 userEvent(f,completionButton(f));f.document.querySelector('[aria-modal=true]').remove();assert.equal(observeTwice(f),null);
});
test('0.1.4 stale success / disabled or foreign Schedule / unknown label cannot advance a filled picker',async()=>{
 for(const mode of ['stale','disabled','foreign','unknown']) {
  const f=fixture();
  const toast=f.document.createElement('div');toast.setAttribute('role','status');toast.textContent='Your post was scheduled.';f.document.body.append(toast);
  await Q.fillSlotResult(f.document,'lunch',now);
  let button=completionButton(f,mode==='unknown'?'Schedule fixture':'Schedule');
  if(mode==='foreign'){button=f.document.createElement('button');button.textContent='Schedule';f.document.body.append(button);}
  if(mode==='disabled')button.disabled=true;
  userEvent(f,button);
  if(mode!=='stale')f.document.querySelector('[aria-modal=true]').remove();
  assert.equal(observeTwice(f),null,mode);
 }
});
test('0.1.4 late error vetoes provisional closure; announcements and their identities never enter diagnostics',async()=>{
 const f=fixture();await Q.fillSlotResult(f.document,'lunch',now);userEvent(f,completionButton(f));
 f.document.querySelector('[aria-modal=true]').remove();assert.equal(Q.observeScheduling(f.document,now.getTime()),null);
 const error=f.document.createElement('div');error.setAttribute('role','alert');
 const decoy='Error @decoy_handle decoy@example.invalid https://example.invalid/private';error.textContent=decoy;f.document.body.append(error);
 assert.equal(Q.observeScheduling(f.document,now.getTime()),null,'error blocks second observation');
 for(const output of [Q.schedulingDiagnostic(f.document),Q.fillDiagnostic(f.document)]) {
  assert.ok(!output.includes(decoy));assert.ok(!output.includes('decoy'));assert.ok(!output.includes('https'));
 }
});
for(const variant of ['dialog','numeric','padded','zero','period-values'])test(`controlled ${variant}: four slots, dependent day replacement, exact option encodings and no sends`,async()=>{
 const f=fixture(variant);const oldDay=f.field('day');
 for(const id of Q.SLOT_IDS) {
  assert.equal(await Q.fillSlotResult(f.document,id,now),'filled');
  const value=f.values();
  assert.equal(value.year,'2028');
  assert.equal(value.month,variant==='zero'?'0':variant==='padded'?'01':variant==='dialog'?'fake-month-1':'1');
  assert.equal(Number(value.day),id==='workday'?3:1);
  assert.equal(Number(value.hour),id==='evening'?8:id==='lunch'?12:9);
  assert.equal(Number(value.minute),id==='lunch'?30:0);
  assert.equal(value.period,variant==='dialog'?'fake-period-'+(['lunch','evening'].includes(id)?1:0):variant==='period-values'?(['lunch','evening'].includes(id)?'下午':'上午'):['lunch','evening'].includes(id)?'PM':'AM');
  assert.match(Q.fillDiagnostic(f.document),/^fill=ok y=2028 m=1 d=\d h=\d+ min=\d+ period=(AM|PM)$/);
 }
 assert.equal(oldDay.isConnected,false);assert.equal(f.window.fixtureRebuilds,8);
 assert.equal(f.window.fixtureSend.input,24);assert.equal(f.window.fixtureSend.change,24);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
 assert.equal(f.document.querySelector('input[type=date]').value,'2027-01-01');
});
test('controlled fixture rejects direct value writes; native setter/input/change succeeds',async()=>{
 const f=fixture();const before=f.field('year').value;
 f.field('year').value='2028';await pause();assert.equal(f.field('year').value,before);
 f.field('year').value='2028';for(const type of ['input','change'])f.field('year').dispatchEvent(new f.window.Event(type,{bubbles:true}));
 await pause();assert.equal(f.field('year').value,before,'instance setter plus events is still rejected');
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'filled');
});
test('asynchronous automatic period correction is observed, diagnosed before rollback, and ALL originals restored',async()=>{
 const f=fixture('autocorrect'),before=f.values();
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');assert.deepEqual(f.values(),before);
 assert.equal(f.window.fixtureRejects,1);
 const diag=Q.fillDiagnostic(f.document);assert.match(diag,/^fill=failed failed=period\n/);
 assert.match(diag,/field=period target=PM value=PM read=AM options=AM\|PM/);
 assert.equal(diag.split('\n').length,7);
 assert.equal(f.window.fixtureSend.input,12);assert.equal(f.window.fixtureSend.change,12);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});
test('late correction of an earlier field is caught by final whole-group readback',async()=>{
 const f=fixture(),before=f.values();let corrected=false;
 f.document.addEventListener('change',event=>{
  if(event.target===f.field('minute')&&!corrected){corrected=true;f.window.requestAnimationFrame(()=>{
   const period=f.field('period');native.call(period,'AM');
   for(const type of ['input','change'])period.dispatchEvent(new f.window.Event(type,{bubbles:true}));
  });}
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');assert.deepEqual(f.values(),before);
 assert.match(Q.fillDiagnostic(f.document),/failed=period/);
});
test('native writer serializes overlapping user actions without interleaving writes',async()=>{
 const f=fixture();const first=Q.fillSlotResult(f.document,'lunch',now);
 assert.equal(Q.isFilling(f.document),true);
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');
 assert.equal(await first,'filled');assert.equal(f.window.fixtureSend.change,6);assert.equal(Q.isFilling(f.document),false);
 assert.match(Q.fillDiagnostic(f.document),/fill=ok.*h=12 min=30 period=PM/);
});
test('safe samples preserve encodings only; no identity, prose, URLs or long numeric IDs in failed diagnostic or skeleton',async()=>{
 for(const secret of ['@decoy_handle','decoy@example.invalid','https://example.invalid/private','123456789012345','550e8400-e29b-41d4-a716-446655440000','private prose','AM\nprivate']) {
  const f=fixture('rollback');const month=f.field('month');month.querySelector('option[value="fake-month-1"]').value=secret;
  assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');
  const diag=Q.fillDiagnostic(f.document),skeleton=S.buildSkeleton(f.document);
  for(const output of [diag,skeleton])assert.ok(!output.includes(secret),secret);
  assert.match(diag,/field=month target=1 value=x read=x options=empty\|x\|x\|x/);
  assert.equal(S.safeOptionValue(secret),'x');
 }
 for(const value of ['0','01','2028','59','AM','PM','a','p','上午','下午','午前','午後','오전','오후'])assert.equal(S.safeOptionValue(value),value);
 const f=fixture('padded');assert.match(S.buildSkeleton(f.document),/option-values=empty\|01\|02\|12/);
 const outside=parseHTML('<html><body><select><option value="2028">Private</option></select><article role="dialog"><select><option value="2028">Body</option></select></article></body></html>').document;
 assert.ok(!S.buildSkeleton(outside).includes('option-values='));
});
test('unavailable year gives six safe preflight rows, no events and no partial writes',async()=>{
 const f=fixture('year-missing'),before=f.values();
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'yearMissing');assert.deepEqual(f.values(),before);
 assert.match(Q.fillDiagnostic(f.document),/^fill=yearMissing failed=year/);
 assert.equal(Q.fillDiagnostic(f.document).split('\n').length,7);
 assert.equal(f.window.fixtureSend.input+f.window.fixtureSend.change,0);
});
test('0-based numeric month domain without readable labels, a/p periods, and conflicting domains',async()=>{
 const f=fixture('zero');for(const option of f.field('month').querySelectorAll('option:not([disabled])'))option.textContent='Neutral';
 assert.equal(await Q.fillSlotResult(f.document,'lunch',now),'filled');assert.equal(f.field('month').value,'0');
 const g=fixture('period-values');const options=[...g.field('period').querySelectorAll('option')];options[0].value='a';options[1].value='p';
 assert.equal(Q.detectControls(g.document).ready,true);
 options[0].textContent='下午';assert.equal(Q.detectControls(g.document).ready,false);
 const h=fixture('numeric');h.field('month').querySelector('option[value="2"]').textContent='3 月';
 assert.equal(Q.detectControls(h.document).ready,false);assert.equal(h.window.fixtureSend.change,0);
});

test('controlled leap-month rebuild has the exact new day option domain',async()=>{
 const f=fixture('padded'),oldDay=f.field('day');
 assert.equal(await Q.fillSlotResult(f.document,'morning',new Date(2028,0,31,21)),'filled');
 assert.equal(f.field('month').value,'02');assert.equal(f.field('day').value,'01');
 assert.equal(f.field('day').querySelectorAll('option').length,30,'blank plus 29 leap-February days');
 assert.equal(oldDay.isConnected,false);assert.equal(f.window.fixtureRebuilds,2);
});

test('complete 0..11 numeric month labels map consistently, conflicting offsets do not',async()=>{
 const f=fixture('zero');for(const option of f.field('month').querySelectorAll('option:not([disabled])'))option.textContent=option.value;
 assert.equal(Q.detectControls(f.document).ready,true);
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'filled');assert.equal(f.field('month').value,'0');
 const g=fixture('zero');g.field('month').querySelector('option[value="1"]').textContent='1';
 assert.equal(Q.detectControls(g.document).ready,false,'mixed zero/one-based readable labels are ambiguous');
});

test('synchronous controlled repaint resets uncommitted values and replaces day; sequential native events still complete',async()=>{
 const f=fixture('numeric',true),order=[];
 f.document.addEventListener('change',event=>order.push(event.target.id.replace('fake-select-','')));
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'filled');
 assert.deepEqual(order,['year','month','day','period','hour','minute']);
 assert.deepEqual(f.values(),{year:'2028',month:'1',day:'1',period:'PM',hour:'8',minute:'0'});
 assert.equal(f.window.fixtureRebuilds,2);assert.equal(f.window.fixtureSend.change,6);
});

test('input-time replacement never receives a detached change; verified replacement retries and completes',async()=>{
 const f=fixture(),before=f.values();let replaced=false,oldYear;
 f.document.addEventListener('input',event=>{
  if(!replaced&&event.target===f.field('year')){replaced=true;oldYear=event.target;oldYear.replaceWith(oldYear.cloneNode(true));}
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'filled');
 assert.deepEqual(f.values(),{year:'2028',month:'1',day:'1',period:'PM',hour:'8',minute:'0'});
 assert.equal(oldYear.isConnected,false);assert.equal(f.window.fixtureSend.input,7);assert.equal(f.window.fixtureSend.change,6,'no change event dispatched to detached old control');
 assert.match(Q.fillDiagnostic(f.document),/^fill=ok/);
});

test('re-rendered option encodings are mapped afresh, including logical restoration of an original day',async()=>{
 const f=fixture('numeric',false,true);
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'filled');assert.equal(f.field('day').value,'01');
 const g=fixture('autocorrect',false,true);
 native.call(g.field('day'),'1');
 for(const type of ['input','change'])g.field('day').dispatchEvent(new g.window.Event(type,{bubbles:true}));
 await pause();const before=g.values();
 assert.equal(await Q.fillSlotResult(g.document,'evening',now),'failed');
 const after=g.values();assert.equal(after.day,'01','original logical day 1 is restored through the new encoding');
 for(const key of ['year','month','period','hour','minute'])assert.equal(after[key],before[key]);
 assert.match(Q.fillDiagnostic(g.document),/failed=period/);
});

test('calendar-shaped controls inside tweetText/article never become a native picker or receive writes',async()=>{
 for(const kind of ['article','tweetText']) {
  const f=fixture(),before=f.values(),wrapper=f.document.createElement(kind==='article'?'article':'div');
  if(kind==='tweetText')wrapper.setAttribute('data-testid','tweetText');
  const dialog=f.document.querySelector('div[role=dialog]');dialog.before(wrapper);wrapper.append(dialog);
  assert.equal(Q.detectControls(f.document).ready,false);
  assert.equal(await Q.fillSlotResult(f.document,'morning',now),'missing');assert.deepEqual(f.values(),before);
  assert.equal(f.window.fixtureSend.input+f.window.fixtureSend.change,0);
  assert.match(Q.fillDiagnostic(f.document),/read=x options=x/);
 }
});

test('late month encoding change cannot pass raw readback or restore a different logical month',async()=>{
 const f=fixture();
 native.call(f.field('month'),'1');
 for(const type of ['input','change'])f.field('month').dispatchEvent(new f.window.Event(type,{bubbles:true}));
 await pause();let changed=false;
 f.document.addEventListener('change',event=>{
  if(!changed && event.target===f.field('minute')) {
   changed=true;
   for(const option of f.field('month').querySelectorAll('option:not([disabled])'))option.value=String(Number(option.value)-1);
  }
 });
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'failed');
 assert.equal(f.field('month').value,'0','restore January through its new encoding, not original raw 1 / February');
 assert.match(Q.fillDiagnostic(f.document),/failed=month/);
 assert.match(Q.fillDiagnostic(f.document),/field=month target=1 value=0 read=1/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});

test('rollback maps original calendar meaning even when the old raw month value still exists',async()=>{
 const f=fixture('autocorrect');
 native.call(f.field('month'),'1');
 for(const type of ['input','change'])f.field('month').dispatchEvent(new f.window.Event(type,{bubbles:true}));
 await pause();let changed=false;
 f.document.addEventListener('change',event=>{
  if(!changed && event.target===f.field('year')) {
   changed=true;
   for(const option of f.field('month').querySelectorAll('option:not([disabled])'))option.value=String(Number(option.value)-1);
  }
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');
 assert.equal(f.field('month').value,'0','original January must remain January after rollback');
 assert.match(Q.fillDiagnostic(f.document),/failed=period/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});

test('input handler moving a control outside the original dialog cannot receive its change event',async()=>{
 const f=fixture(),year=f.field('year');let moved=false,yearChanges=0;
 year.addEventListener('change',()=>yearChanges++);
 f.document.addEventListener('input',event=>{
  if(!moved && event.target===year){moved=true;f.document.body.append(year);}
 });
 assert.equal(await Q.fillSlotResult(f.document,'morning',now),'rollbackFailed');
 assert.equal(yearChanges,0,'change is forbidden after the original control leaves its dialog');
 assert.match(Q.fillDiagnostic(f.document),/failed=year/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});

test('temporary period correction while filling does not fail early; completed hour restores period and final group matches',async()=>{
 const f=fixture();let corrected=false,recovered=false;
 f.document.addEventListener('change',event=>{
  if(event.target===f.field('period') && !corrected){
   corrected=true;native.call(f.field('period'),'AM');
   for(const type of ['input','change'])f.field('period').dispatchEvent(new f.window.Event(type,{bubbles:true}));
  } else if(event.target===f.field('hour') && f.field('hour').value==='8' && !recovered){
   recovered=true;native.call(f.field('period'),'PM');
   for(const type of ['input','change'])f.field('period').dispatchEvent(new f.window.Event(type,{bubbles:true}));
  }
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'filled');
 assert.ok(corrected&&recovered);assert.equal(f.values().period,'PM');assert.equal(f.values().hour,'8');assert.match(Q.fillDiagnostic(f.document),/^fill=ok/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});

test('transient missing day select is retried in the same dialog',async()=>{
 const f=fixture();let removed=false;
 f.document.addEventListener('change',event=>{
  if(!removed && event.target===f.field('month')) {
   removed=true;
   f.window.requestAnimationFrame(()=>{const day=f.field('day'),parent=day.parentElement;day.remove();setTimeout(()=>parent.append(day),40);});
  }
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'filled');assert.equal(f.values().day,'1');
 assert.match(Q.fillDiagnostic(f.document),/^fill=ok/);
});

for(const mode of ['transient','interim'])test(`013 generated ${mode} controlled fixture completes all six fields and never activates`,async()=>{
 const f=fixture(mode);
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'filled');
 assert.deepEqual(f.values(),{year:'2028',month:'1',day:'1',period:'PM',hour:'8',minute:'0'});
 assert.equal(f.window.fixtureSend.input,6);assert.equal(f.window.fixtureSend.change,6);
 assert.match(Q.fillDiagnostic(f.document),/^fill=ok/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});
test('013 repeated input recycling stops at three writes and restores the whole original group',async()=>{
 const f=fixture(),before=f.values();let recycled=0;
 const detached=[];
 f.document.addEventListener('input',event=>{
  if(event.target===f.field('year') && recycled<3){
   recycled++;detached.push(event.target);
   event.target.replaceWith(event.target.cloneNode(true));
  }
 });
 assert.equal(await Q.fillSlotResult(f.document,'evening',now),'failed');
 assert.equal(recycled,3);
 assert.deepEqual(f.values(),before);
 assert.equal(f.window.fixtureSend.input,9,'three attempted input events plus six restoration input events');
 assert.equal(f.window.fixtureSend.change,6,'no detached node receives change; restoration covers six fields');
 assert.ok(detached.every(node=>!node.isConnected));
 assert.match(Q.fillDiagnostic(f.document),/failed=year/);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0);
});
