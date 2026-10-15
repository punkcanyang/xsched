// 0.2.1: home "For you" compose modal. X swaps the same aria-modal dialog to
// the picker (editor unmounts) and rebuilds the composer after Confirm.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
await import('../probe/skeleton.js');await import('../probe/quick.js');await import('../probe/ui.js');await import('../probe/composer.js');
const C=globalThis.XSCHED_COMPOSER,Q=globalThis.XSCHED_QUICK,U=globalThis.XSCHED_UI;
const now=new Date(2027,11,31,21),NativeDate=Date;
const win=parseHTML('<html></html>').document.defaultView;
const proto=win.HTMLSelectElement.prototype;
const original=Object.getOwnPropertyDescriptor(proto,'value');
Object.defineProperty(proto,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? '';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===String(value));}});
const clickProto=win.HTMLElement.prototype,originalClick=Object.getOwnPropertyDescriptor(clickProto,'click');
after(()=>{Object.defineProperty(proto,'value',original);if(originalClick)Object.defineProperty(clickProto,'click',originalClick);else delete clickProto.click;globalThis.Date=NativeDate;});
function useClock(){globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now.getTime()]));}static now(){return now.getTime();}};}
function trusted(window,node){const event=new window.Event('click',{bubbles:true,cancelable:true});Object.defineProperty(event,'isTrusted',{value:true});node.dispatchEvent(event);}
function load(name,pathname){
 const {document,window}=parseHTML(readFileSync(new URL(`../fixtures/${name}.html`,import.meta.url),'utf8'));
 window.location={hostname:'x.com',pathname};window.requestAnimationFrame=fn=>setTimeout(fn,0);
 // Test-only: linkedom has no HTMLElement.click(); dispatch an untrusted click like a browser.
 Object.defineProperty(clickProto,'click',{configurable:true,value(){this.dispatchEvent(new window.Event('click',{bubbles:true}));}});
 const context=vm.createContext({document,window,HTMLSelectElement:window.HTMLSelectElement,Date:NativeDate,setTimeout,requestAnimationFrame:window.requestAnimationFrame});
 const fixtureScript=document.querySelector('script').textContent.replace("document.getElementById('fake-picker-template').content",'fixtureTemplate.content');
 vm.runInContext("const fixtureTemplate=document.getElementById('fake-picker-template');fixtureTemplate.remove();\n"+fixtureScript,context);
 const controller=C.create(document,{quick:Q,labels:()=>U.quickStringsFor(document.documentElement.lang,'en'),slotLabel:(id,at,time)=>U.slotLabel(id,at,time,document.documentElement.lang,'en'),settings:()=>({range:{a:10,b:10},cache:{time:new Date(2028,0,1,20).getTime()}})});
 const row=root=>root.querySelector('.xsched-composer-root');
 const run=(root,id)=>trusted(window,[...row(root).shadowRoot.querySelectorAll('[data-xsched-composer-slot]')].find(b=>b.dataset.xschedComposerSlot===id));
 return {document,window,controller,row,run};
}
async function settle(f){for(let i=0;i<350;i++){await new Promise(resolve=>setTimeout(resolve,10));const text=f.document.querySelector('.xsched-composer-notice')?.shadowRoot.firstElementChild?.textContent || '';if(text && !text.includes('Opening'))return text;}throw new Error('composer did not settle');}
const tick=()=>new Promise(resolve=>setTimeout(resolve,5));
const values=f=>['year','month','day','hour','minute','period'].map(key=>f.document.getElementById('fake-select-'+key)?.value);
test('modal composer: picker replaces the editor in the same dialog, slot still fills; Confirm rebuild and second slot work',async()=>{
 useClock();const f=load('quick-composer-modal','/home');f.controller.refresh();
 const modal=f.document.getElementById('compose-modal');
 assert.ok(f.row(modal),'modal composer has a quick-slot row');
 assert.ok(f.row(f.document.getElementById('home-inline')),'background inline composer keeps its own row');
 f.run(modal,'morning');
 assert.match(await settle(f),/filled/i,'modal slot fills the native fields instead of icon missing');
 assert.deepEqual(values(f),['2028','1','1','9','0','AM']);
 assert.equal(modal.querySelector('[data-testid="tweetTextarea_0"]'),null,'editor really unmounted while the picker is open');
 assert.equal(f.window.fixtureSend.icon,1);assert.equal(f.window.fixtureSend.inlineIcon,0);
 // User confirms; X rebuilds a new composer. A second slot must use the new nodes.
 trusted(f.window,f.document.getElementById('confirm'));await tick();
 assert.ok(f.document.getElementById('modal-schedule'));
 f.document.querySelector('.xsched-composer-notice').remove();f.controller.refresh();
 f.run(modal,'workday');
 assert.match(await settle(f),/filled/i);
 assert.deepEqual(values(f),['2028','1','3','9','0','AM']);
 assert.equal(f.window.fixtureSend.icon,2);
 for(const key of ['schedule','post','calendar','submit'])assert.equal(f.window.fixtureSend[key],0,key);
 f.controller.dispose();Q.stopSchedulingWatch(f.document);
});
test('modal composer: user Confirm then Schedule is observed and the draft preview is the first 20 characters, memory only',async()=>{
 useClock();const f=load('quick-composer-modal','/home');f.controller.refresh();
 const modal=f.document.getElementById('compose-modal');
 f.run(modal,'evening');await settle(f);
 trusted(f.window,f.document.getElementById('confirm'));await tick();
 assert.equal(Q.observeScheduling(f.document,now.getTime()),null,'confirm alone is not completion');
 trusted(f.window,f.document.getElementById('modal-schedule'));await tick();
 assert.equal(Q.observeScheduling(f.document,now.getTime()),null);
 assert.deepEqual(Q.observeScheduling(f.document,now.getTime()),{time:new NativeDate(2028,0,1,20,0).getTime()});
 assert.equal(f.controller.takeDraft(now.getTime()),'A synthetic modal dr');
 assert.equal(f.controller.takeDraft(now.getTime()),'','draft is handed out once');
 assert.equal(f.window.fixtureSend.schedule,1);assert.equal(f.window.fixtureSend.submit,0);
 f.controller.dispose();
});
test('draft capture ignores untrusted clicks and non-Schedule buttons; preview counts code points',()=>{
 const f=load('quick-composer-modal','/home');f.controller.refresh();
 f.document.querySelector('#compose-modal [data-testid="tweetTextarea_0"]').textContent='排程測試😀 一二三四五六七八九十甲乙丙丁戊';
 f.document.getElementById('post').click();
 trusted(f.window,f.document.getElementById('post'));
 assert.equal(f.controller.takeDraft(),'');
 f.document.getElementById('post').textContent='Schedule';
 f.document.getElementById('post').click();
 assert.equal(f.controller.takeDraft(),'','untrusted Schedule click is ignored');
 trusted(f.window,f.document.getElementById('post'));
 assert.equal(f.controller.takeDraft(),'排程測試😀 一二三四五六七八九十甲乙丙丁');
 assert.equal(f.controller.takeDraft(Date.now()+11*60*1000),'');
 assert.equal(C.previewOf(null),'');
 f.controller.dispose();
});
test('/compose/post: a re-rendered editor and icon do not leave the row on stale nodes',async()=>{
 useClock();const f=load('quick-composer','/compose/post');f.controller.refresh();
 const form=f.document.getElementById('fake-composer');
 const editor=form.querySelector('[data-testid="tweetTextarea_0"]'),fresh=editor.cloneNode(true);editor.replaceWith(fresh);
 const icon=form.querySelector('[data-testid="scheduleOption"]'),freshIcon=icon.cloneNode(true);icon.replaceWith(freshIcon);
 // The fixture's X handler stayed on the removed icon, so no picker opens here.
 f.controller.refresh();
 let clicked=0;freshIcon.addEventListener('click',()=>clicked++);
 f.run(form,'morning');
 const message=await settle(f);
 assert.equal(clicked,1,'the current icon is clicked, not the removed one');
 assert.match(message,/dialog not detected/i,'reaches the picker wait instead of icon missing');
 f.controller.dispose();Q.stopSchedulingWatch(f.document);
});
test('a hidden duplicate schedule icon does not make the visible composer ambiguous',()=>{
 const f=load('quick-composer','/compose/post');
 const bar=f.document.querySelector('#fake-composer .fixture-toolbar');
 const hidden=bar.querySelector('[data-testid="scheduleOption"]').cloneNode(true);
 const holder=f.document.createElement('div');holder.hidden=true;holder.append(hidden);bar.append(holder);
 assert.equal(C.findEntries(f.document).length,1);
 const visibleCopy=bar.querySelector('[data-testid="scheduleOption"]').cloneNode(true);bar.append(visibleCopy);
 assert.equal(C.findEntries(f.document).length,0,'two visible icons stay ambiguous');
 f.controller.dispose();
});
