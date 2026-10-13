import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
await import('../probe/skeleton.js');await import('../probe/quick.js');await import('../probe/ui.js');await import('../probe/composer.js');
const C=globalThis.XSCHED_COMPOSER,Q=globalThis.XSCHED_QUICK,U=globalThis.XSCHED_UI;
const now=new Date(2027,11,31,21),NativeDate=Date;
const proto=parseHTML('<html></html>').document.defaultView.HTMLSelectElement.prototype;
const original=Object.getOwnPropertyDescriptor(proto,'value');
Object.defineProperty(proto,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? '';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
after(()=>{Object.defineProperty(proto,'value',original);globalThis.Date=NativeDate;});
function setup(){
 const {document,window}=parseHTML(readFileSync(new URL('../fixtures/quick-composer.html',import.meta.url),'utf8'));
 window.location={hostname:'x.com'};window.requestAnimationFrame=fn=>setTimeout(fn,0);
 const context=vm.createContext({document,window,HTMLSelectElement:window.HTMLSelectElement,Date:NativeDate,setTimeout,requestAnimationFrame:window.requestAnimationFrame});
 // linkedom queries inert template descendants; browsers do not. Keep the
 // fixture template detached so DOM lookup matches real browser semantics.
 const fixtureScript=document.querySelector('script').textContent.replace("document.getElementById('fake-picker-template').content",'fixtureTemplate.content');
 vm.runInContext("const fixtureTemplate=document.getElementById('fake-picker-template');fixtureTemplate.remove();\n"+fixtureScript,context);
 const icon=document.querySelector(C.COMPOSER_CONFIG.icon);
 icon.click=()=>icon.dispatchEvent(new window.Event('click',{bubbles:true}));
 const controller=C.create(document,{quick:Q,labels:()=>U.quickStringsFor(document.documentElement.lang,'en'),slotLabel:(id,at,time)=>U.slotLabel(id,at,time,document.documentElement.lang,'en'),settings:()=>({range:{a:10,b:10},cache:{time:new Date(2028,0,1,20).getTime()}})});
 const buttons=()=>document.querySelector('.xsched-composer-root')?.shadowRoot.querySelectorAll('[data-xsched-composer-slot]');
 const run=id=>{const event=new window.Event('click',{bubbles:true,cancelable:true});Object.defineProperty(event,'isTrusted',{value:true});[...buttons()].find(b=>b.dataset.xschedComposerSlot===id).dispatchEvent(event);};
 return {document,window,icon,controller,buttons,run};
}
async function done(f){for(let i=0;i<350;i++){await new Promise(resolve=>setTimeout(resolve,10));const text=f.document.querySelector('.xsched-composer-notice')?.shadowRoot.firstElementChild?.textContent || '';if(text && !text.includes('Opening'))return text;}throw new Error('composer did not settle: '+JSON.stringify({notice:f.document.querySelector('.xsched-composer-notice')?.shadowRoot.firstElementChild?.textContent,counts:f.window.fixtureSend,picker:Q.detectControls(f.document).ready,diag:Q.fillDiagnostic(f.document)}));}
function useClock(){globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}};}
test('composer evidence requires a unique visible editor and exact non-submit icon, never a send button',()=>{
 const f=setup();assert.equal(C.findEntries(f.document).length,1);
 for(const change of [()=>f.icon.setAttribute('type','submit'),()=>f.icon.setAttribute('data-testid','tweetButton'),()=>f.icon.disabled=true,()=>f.icon.querySelector('svg').remove()]) {
  const g=setup();const saved=f.icon;f.icon=g.icon;change();assert.equal(C.findEntries(g.document).length,0);f.icon=saved;
 }
 const extra=f.document.querySelector(C.COMPOSER_CONFIG.editor).cloneNode(true);f.document.getElementById('fake-composer').append(extra);
 assert.equal(C.findEntries(f.document).length,0);assert.equal(f.window.fixtureSend.icon,0);
});
test('nine composer messages and wrapped shadow-only five slots; untrusted click never activates X',async()=>{
 useClock();for(const lang of Object.keys(U.STRINGS)){const f=setup();f.document.documentElement.lang=lang;f.controller.refresh();assert.equal(f.buttons().length,5);for(const b of f.buttons()){assert.equal(b.title,b.getAttribute('aria-label'));assert.ok(b.textContent);assert.equal(b.style.whiteSpace,'normal');}for(const key of ['opening','iconMissing','dialogMissing'])assert.ok(C.OPEN_STRINGS[lang][key]);f.buttons()[0].dispatchEvent(new f.window.Event('click'));await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.window.fixtureSend.icon,0);f.controller.dispose();}
});
test('walkthrough three consecutive composer uses open once each, fill controlled rebuilt fields, never confirm/send',async()=>{
 useClock();const f=setup();f.controller.refresh();
 for(const [id,hour,minute,period] of [['morning','9','0','AM'],['lunch','12','30','PM'],['evening','8','0','PM']]) {
  f.run(id);const message=await done(f);assert.match(message,/filled/i);
  assert.equal(f.document.getElementById('fake-select-year').value,'2028');assert.equal(f.document.getElementById('fake-select-month').value,'1');assert.equal(f.document.getElementById('fake-select-day').value,'1');
  assert.equal(f.document.getElementById('fake-select-hour').value,hour);assert.equal(f.document.getElementById('fake-select-minute').value,minute);assert.equal(f.document.getElementById('fake-select-period').value,period);
  assert.ok(f.window.fixtureRebuilds>=2);assert.match(Q.fillDiagnostic(f.document),/^fill=ok/);
  f.document.querySelector('[role="dialog"]').remove();f.controller.refresh();
 }
 assert.equal(f.window.fixtureSend.icon,3);assert.ok(f.window.fixtureSend.input>=18);assert.ok(f.window.fixtureSend.change>=18);
 for(const key of ['confirm','schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0,key);
 f.controller.dispose();Q.stopSchedulingWatch(f.document);
});
test('stale removed icon and missing dialog cause no field writes and clear busy state',async()=>{
 useClock();for(const mode of ['removed','no-dialog']){const f=setup();f.controller.refresh();if(mode==='removed')f.icon.remove();else f.window.fixtureMode='no-dialog';f.run('morning');const message=await done(f);assert.match(message,/not found|not detected/);assert.equal(f.window.fixtureSend.icon,mode==='removed'?0:1);assert.equal(f.window.fixtureSend.input,0);assert.equal(f.window.fixtureSend.change,0);assert.equal(f.window.fixtureSend.submit,0);f.controller.dispose();}
});
test('writer rejection restores all native values; success observation still requires trusted user Schedule',async()=>{
 useClock();const failed=setup();failed.window.fixtureMode='reject';failed.controller.refresh();failed.run('evening');const message=await done(failed);assert.match(message,/restored/i);for(const key of ['year','month','day','hour','minute'])assert.equal(failed.document.getElementById('fake-select-'+key).value,'');assert.equal(failed.document.getElementById('fake-select-period').value,'AM');assert.equal(failed.window.fixtureSend.schedule,0);failed.controller.dispose();
 const f=setup();f.controller.refresh();f.run('lunch');await done(f);assert.equal(Q.observeScheduling(f.document,now.getTime()),null);
 const event=new f.window.Event('click',{bubbles:true});Object.defineProperty(event,'isTrusted',{value:true});f.document.getElementById('schedule').textContent='Schedule';f.document.getElementById('schedule').dispatchEvent(event);f.document.querySelector('[role="dialog"]').remove();assert.equal(Q.observeScheduling(f.document,now.getTime()),null);assert.deepEqual(Q.observeScheduling(f.document,now.getTime()),{time:new NativeDate(2028,0,1,12,30).getTime()});assert.equal(f.window.fixtureSend.schedule,1);assert.equal(f.window.fixtureSend.submit,0);f.controller.dispose();
});
