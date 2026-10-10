// Run the real glue against local DOM. Geometry/hit testing remains Chrome e2e's job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/reader.js');
await import('../probe/skeleton.js');
await import('../probe/ui.js');
await import('../probe/quick.js');
const source = readFileSync(new URL('../probe/content.js', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('../probe/ui.js', import.meta.url), 'utf8');
const positionSource = readFileSync(new URL('../probe/position.js', import.meta.url), 'utf8');
function fixture(pathname = '/compose/post/unsent/scheduled', lang = 'en', file = '../fixtures/en.html', clock = null, ui = globalThis.XSCHED_UI, reader = globalThis.XSCHED_READER, stored = new Map(), hostname = 'x.com', startReady = true) {
  const { document } = parseHTML(readFileSync(new URL(file, import.meta.url), 'utf8'));
  document.documentElement.lang = lang;
  const timers = new Map();
  const polls = new Map();
  let id = 0;
  let manifest = '0.1.2';
  let invalidated = false;
  const navigated = [];
  let mutationCallback;
  const location = { hostname, pathname, search: '', assign(target) { navigated.push(target); } };
  document.defaultView.location=location;
  const listeners = new Map();
  const window = {
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    setInterval(fn) { polls.set(++id, fn); return id; }, clearInterval(key) { polls.delete(key); },
    location, localStorage:{ getItem(key) { return stored.get(key) ?? null; }, setItem(key,value) { stored.set(key,value); }, removeItem(key) { stored.delete(key); } },
    addEventListener(type,fn) { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(fn); },
    removeEventListener(type,fn) { listeners.get(type)?.delete(fn); },
  };
  const rect = function () {
    let el = this;
    while (el) { if (el.style?.display === 'none') return { width: 0, height: 0 }; el = el.parentElement; }
    return { left: 0, right: 44, top: 0, bottom: 44, width: 44, height: 44 };
  };
  for (const el of document.querySelectorAll('*')) el.getBoundingClientRect = rect;
  const create = document.createElement.bind(document);
  document.createElement = (...args) => { const el = create(...args); el.getBoundingClientRect = rect; return el; };
  const context = vm.createContext({
    XSCHED_READER: clock ? { ...reader, readSnapshot(doc, options) { return reader.readSnapshot(doc, { ...options, now: clock() }); } } : reader,
    XSCHED_SKELETON: globalThis.XSCHED_SKELETON, XSCHED_UI: ui, XSCHED_QUICK:clock ? {...globalThis.XSCHED_QUICK,fillSlot(doc,id){return globalThis.XSCHED_QUICK.fillSlot(doc,id,clock());},fillSlotResult(doc,id){return globalThis.XSCHED_QUICK.fillSlotResult(doc,id,clock());}} : globalThis.XSCHED_QUICK,
    document, window, navigator: { language: 'en-US' }, location, innerWidth: 1100, innerHeight: 820,
    chrome: { runtime: { id: 'local-test', getManifest() { if (invalidated) throw new Error('private exception'); return { version: manifest }; } } },
    getComputedStyle() { return { position: 'static' }; },
    MutationObserver: class { constructor(callback) { mutationCallback = callback; } observe() {} disconnect() {} },
  });
  function flush() { for (let n = 0; timers.size && n < 10; n++) { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); } }
  function poll() { [...polls.values()].forEach((fn) => fn()); flush(); }
  // Match the browser isolated world: the zero-argument factory closes over this
  // document, while geometry overrides remain available to the existing fixtures.
  vm.runInContext(uiSource, context);
  context.XSCHED_UI = { ...ui, createAuthorLink: context.XSCHED_UI.createAuthorLink };
  vm.runInContext(positionSource, context);
  vm.runInContext(source, context); if (startReady) flush();
  const host = () => document.getElementById('xsched-probe-root');
  const shadow = () => host().shadowRoot;
  const click = (selector, trusted = true) => {
    const event = new document.defaultView.Event('click');
    // linkedom has no browser input pipeline; explicitly model the trust flag.
    Object.defineProperty(event, 'isTrusted', { value: trusted });
    shadow().querySelector(selector).dispatchEvent(event);
  };
  return { document, host, shadow, click, location, navigated, poll, flush, context, stored,
    emit(type) { for (const fn of listeners.get(type) || []) fn({}); flush(); },
    resize(width,height) { context.innerWidth=width; context.innerHeight=height; for (const fn of listeners.get('resize') || []) fn(); flush(); },
    pointer(type,x,y,extras={}) {
      const event = new document.defaultView.Event(type, {cancelable:true,bubbles:true});
      Object.assign(event,{clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,...extras});
      shadow().querySelector(extras.selector || '.shortcut').dispatchEvent(event);
    },
    mutate(records) { mutationCallback(records); flush(); },
    setManifest(value) { manifest = value; }, invalidate() { invalidated = true; } };
}
test('panel author link stays outside scrolling content and is excluded from skeleton/diagnostics', () => {
  const f = fixture();
  const check = () => {
    const links = f.shadow().querySelectorAll('a');
    assert.equal(links.length, 1);
    const link = links[0];
    assert.equal(link.getAttribute('href'), 'https://x.com/punkcan');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.ok(link.getAttribute('rel').split(/\s+/).includes('noopener'));
    assert.equal(link.textContent, '@punkcan');
    assert.equal(link.className, 'panel-author');
    assert.equal(link.parentElement, f.shadow().querySelector('section'));
    assert.equal(link.style.position, 'absolute', 'author cannot add a flex row to the fixed chrome');
    const actions = f.shadow().querySelector('.panel-actions');
    assert.equal(actions.contains(link), false);
    assert.deepEqual([...actions.children].map(el => el.tagName), ['BUTTON', 'BUTTON', 'BUTTON'], 'original fixed actions keep exactly their three buttons');
    assert.equal(f.shadow().querySelector('.panel-body').contains(link), false);
    for (const output of [f.host().dataset.xschedDiag, globalThis.XSCHED_SKELETON.buildSkeleton(f.document)]) {
      assert.ok(!output.includes('punkcan'));
      assert.ok(!output.includes('https://x.com/punkcan'));
    }
  };
  check(); f.poll(); check();
  f.click('[data-xsched-minimize]');
  assert.equal(f.shadow().querySelector('a'), null);
  f.click('.shortcut'); check();
  const skeleton = globalThis.XSCHED_SKELETON.buildSkeleton(f.document);
  f.host().remove();
  assert.equal(globalThis.XSCHED_SKELETON.buildSkeleton(f.document), skeleton, 'entire extension host is excluded');
  f.poll(); check();
});
test('real content script mounts shadow Dagaz, toggles Scheduled and preserves choice across SPA/remount', () => {
  const f = fixture();
  assert.equal(f.host().dataset.xschedCount, '2');
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'), 'true');
  assert.equal(f.shadow().querySelector('.shortcut svg path').getAttribute('d'), 'M12 10 L12 54 L52 10 L52 54 Z');
  f.click('.shortcut');
  assert.equal(f.shadow().querySelector('section').style.display, 'none');
  f.location.pathname = '/home'; f.poll();
  assert.equal(f.host().dataset.xschedCount, '0');
  f.location.pathname = '/compose/post/unsent/scheduled'; f.poll();
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'), 'false');
  f.host().remove(); f.poll();
  assert.equal(f.host().dataset.xschedRemounts, '1');
  assert.equal(f.shadow().querySelector('section').style.display, 'none');
  f.click('.shortcut');
  assert.equal(f.shadow().querySelector('section').style.display, 'flex');
});
test('polls and rerenders preserve an externally hidden host and report mounted zero until restored', () => {
  const f = fixture();
  const host = f.host();
  assert.equal(host.dataset.xschedMounted, '1');
  host.style.setProperty('display', 'none', 'important');
  for (let n = 0; n < 3; n++) {
    f.poll();
    assert.equal(host.style.display, 'none');
    assert.equal(host.dataset.xschedMounted, '0');
    assert.match(host.dataset.xschedDiag, /\bmounted=0\b/);
  }
  f.setManifest('0.0.3'); f.poll(); // Force a full render while the host is hidden.
  assert.equal(f.host(), host, 'hiding must not create a replacement host');
  assert.equal(host.style.display, 'none');
  assert.equal(host.dataset.xschedMounted, '0');
  assert.match(host.dataset.xschedDiag, /\bmounted=0\b/);
  host.style.setProperty('display', 'block', 'important'); f.poll();
  assert.equal(host.dataset.xschedMounted, '1');
  assert.match(host.dataset.xschedDiag, /\bmounted=1\b/);
});
test('no-space hiding only retries on resize and preserves external display and open intent', () => {
  let room = true;
  const ui = { ...globalThis.XSCHED_UI, placement(...args) {
    return room ? globalThis.XSCHED_UI.placement(...args) : { clear: false, right: 16, bottom: 112 };
  } };
  const f = fixture(undefined, undefined, undefined, null, ui);
  for (let n = 0; n < 2; n++) {
    room = false; f.resize(1100,820);
    assert.equal(f.host().style.display, 'block');
    assert.equal(f.host().style.visibility, 'hidden');
    assert.equal(f.host().dataset.xschedMounted, '0');
    assert.match(f.host().dataset.xschedDiag, /\bmounted=0\b/);
    if (n === 1) f.host().style.setProperty('display', 'none', 'important');
    room = true; f.poll();
    assert.equal(f.host().style.visibility,'hidden','poll must not move or unhide the fixed anchor');
    f.resize(1100,820);
    assert.equal(f.host().style.visibility, 'visible');
    assert.equal(f.host().dataset.xschedMounted, n === 1 ? '0' : '1');
  }
  assert.equal(f.host().style.display, 'none', 'placement recovery cannot unhide an external display override');
  f.host().style.setProperty('display', 'block', 'important'); f.poll();
  assert.equal(f.host().dataset.xschedMounted, '1');
  assert.equal(f.shadow().querySelector('section').style.display, 'flex');
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'), 'true');
});
test('legacy body dates never rescue rewritten metadata, including virtual accumulation and scope reset', () => {
  for (const virtual of [false, true]) {
    const readSnapshot = (doc, options) => {
      const report = globalThis.XSCHED_READER.readSnapshot(doc, options);
      return virtual ? { ...report, virtualized: 1, needsScroll: 1 } : report;
    };
    const f = fixture(undefined, undefined, undefined, null, undefined, { ...globalThis.XSCHED_READER, readSnapshot });
    assert.equal(f.host().dataset.xschedCount, '2');
    const cell = f.document.querySelector('[data-testid="cellInnerDiv"]');
    const label = cell.querySelector('.when');
    label.textContent = 'Will send on 2027-01-01 23:59 UTC';
    cell.querySelector('[data-testid="tweetText"]').textContent = '將於 2026年11月3日 週二 下午11:19 發送 @decoy_handle decoy@example.invalid https://fake.invalid/';
    cell.querySelector('[role="button"]').setAttribute('aria-label', label.textContent + ' ' + cell.querySelector('[data-testid="tweetText"]').textContent);
    f.mutate([{ type: 'childList', target: label, addedNodes: [...label.childNodes], removedNodes: [] }]);
    assert.equal(f.host().dataset.xschedCount, virtual ? '2' : '1');
    assert.match(f.host().dataset.xschedDiag, /\bl1=1 l2=1\b/);
    assert.match(f.host().dataset.xschedDiag, /\btimeFail=1\b/);
    assert.ok(f.host().dataset.xschedDiag.includes(`timeOk=${virtual ? 2 : 1} `));
    const scope = f.document.querySelector('[role="dialog"]');
    const replacement = scope.cloneNode(true); scope.replaceWith(replacement);
    f.mutate([{ type: 'childList', target: replacement.parentElement, addedNodes: [replacement], removedNodes: [scope] }]);
    assert.equal(f.host().dataset.xschedCount, '1', 'new scope clears even virtual accumulated 09:00');
    assert.deepEqual([...f.shadow().querySelectorAll('.time')].map(el => el.textContent), ['2026-11-09 20:05 (Mon)']);
    assert.match(f.host().dataset.xschedDiag, /\btimeOk=1 timeFail=1 unparsed=0\b/);
    assert.match(f.host().dataset.xschedDiag, /\bsamples=none\nfmt=none$/);
    for (const leak of ['將於', '11月3日', '23:19', 'decoy_handle', 'example.invalid', 'fake.invalid', 'http', '@']) {
      assert.ok(!decodeURIComponent(f.host().dataset.xschedDiag).includes(leak), `${virtual}: ${leak}`);
    }
  }
});
test('button anchor never changes on toggle, poll, SPA, modal mutations or remount', () => {
  let placements=0;
  const ui={...globalThis.XSCHED_UI,placement(...args){placements++;return globalThis.XSCHED_UI.placement(...args);}};
  const f=fixture(undefined,undefined,undefined,null,ui);
  const point=()=>({left:f.host().style.left,top:f.host().style.top});
  const initial=point();assert.equal(placements,1);
  for(let n=0;n<3;n++){f.click('.shortcut');f.poll();assert.deepEqual(point(),initial);}
  const modal=f.document.createElement('div');modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');f.document.body.append(modal);
  f.mutate([{type:'childList',target:f.document.body,addedNodes:[modal],removedNodes:[]}]);
  f.click('.shortcut');f.poll();assert.deepEqual(point(),initial);
  f.location.pathname='/home';f.poll();assert.deepEqual(point(),initial);
  f.host().remove();f.poll();assert.deepEqual(point(),initial);
  assert.equal(placements,1,'only initialization can auto-place before resize/reset');
  assert.ok(['BODY','HTML'].includes(f.host().parentElement.tagName));assert.equal(f.host().closest('[role="dialog"]'),null);
  f.resize(1280,600);assert.equal(placements,2);
});
test('pointer drag persists numeric position, reload/restored viewport preserves it, reset returns to auto',()=>{
  const f=fixture();const shortcut=()=>f.shadow().querySelector('.shortcut');
  const open=shortcut().getAttribute('aria-expanded');
  const original={x:parseFloat(f.host().style.left),y:parseFloat(f.host().style.top)};
  f.pointer('pointerdown',original.x+22,original.y+22);
  f.pointer('pointermove',222,122);f.pointer('pointerup',222,122);
  f.click('.shortcut'); // Browser's compatibility click after dragging is suppressed.
  assert.equal(shortcut().getAttribute('aria-expanded'),open);
  assert.deepEqual(JSON.parse(f.stored.get('xsched.probe.pos')),{x:200,y:100});
  const reloaded=fixture(undefined,undefined,undefined,null,undefined,undefined,f.stored);
  assert.equal(reloaded.host().style.left,'200px');assert.equal(reloaded.host().style.top,'100px');
  reloaded.resize(180,150);assert.equal(reloaded.host().style.left,'120px');assert.equal(reloaded.host().style.top,'90px');
  assert.deepEqual(JSON.parse(f.stored.get('xsched.probe.pos')),{x:200,y:100},'resize does not overwrite raw preference');
  reloaded.resize(1100,820);assert.equal(reloaded.host().style.left,'200px');assert.equal(reloaded.host().style.top,'100px');
  assert.equal(reloaded.shadow().querySelector('[role="tooltip"], .tooltip'),null);
  reloaded.click('[data-xsched-reset-position]');assert.equal(f.stored.size,0);
  assert.deepEqual({x:parseFloat(reloaded.host().style.left),y:parseFloat(reloaded.host().style.top)},original);
});
test('pointer threshold, cancellation and secondary pointers never persist accidental moves',()=>{
  const f=fixture();const point=()=>[f.host().style.left,f.host().style.top];const start=point();
  f.pointer('pointerdown',100,100);f.pointer('pointermove',102,102);f.pointer('pointerup',102,102);
  assert.deepEqual(point(),start);assert.equal(f.stored.has('xsched.probe.pos'),false);
  f.click('.shortcut');assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),'false');
  f.pointer('pointerdown',100,100);f.pointer('pointermove',200,200,{pointerId:2});assert.deepEqual(point(),start);
  f.pointer('pointermove',200,200);f.pointer('pointercancel',200,200);assert.deepEqual(point(),start);assert.equal(f.stored.has('xsched.probe.pos'),false);
  f.pointer('pointerdown',100,100,{button:2});f.pointer('pointermove',300,300);f.pointer('pointerup',300,300);
  assert.deepEqual(point(),start);assert.equal(f.stored.has('xsched.probe.pos'),false);
});
test('interrupted drags immediately release capture without persisting or allowing stale movement', () => {
  for (const reason of ['resize', 'reset', 'pagehide', 'dispose', 'pointercancel', 'lostpointercapture']) {
    const f = fixture();
    const shortcut = f.shadow().querySelector('.shortcut');
    const originalPanel=f.stored.get('xsched.probe.panelPos');
    const captures = new Set();
    shortcut.setPointerCapture = id => captures.add(id);
    shortcut.releasePointerCapture = id => {
      captures.delete(id);
      // Browser capture loss must not re-enter cancellation with active state.
      const event = new f.document.defaultView.Event('lostpointercapture');
      Object.assign(event, { pointerId: id }); shortcut.dispatchEvent(event);
    };
    f.pointer('pointerdown', 100, 100); f.pointer('pointermove', 160, 160);
    assert.ok(captures.has(1), reason);
    if (reason === 'resize') f.resize(1100, 820);
    else if (reason === 'reset') f.click('[data-xsched-reset-position]');
    else if (reason === 'pagehide') f.emit('pagehide');
    else if (reason === 'dispose') f.context.XSCHED_PROBE_SESSION.dispose();
    else f.pointer(reason, 160, 160);
    assert.equal(captures.size, 0, reason);
    assert.equal(f.stored.has('xsched.probe.pos'), false, reason);
    assert.equal(f.stored.get('xsched.probe.panelPos'),reason==='reset'?undefined:originalPanel,reason);
    if (f.host()) {
      const point = [f.host().style.left, f.host().style.top];
      f.pointer('pointermove', 300, 300); f.pointer('pointerup', 300, 300);
      assert.deepEqual([f.host().style.left, f.host().style.top], point, reason);
      assert.equal(f.stored.has('xsched.probe.pos'), false, reason);
    }
  }
});
test('another primary pointer cannot replace an active drag or take its capture', () => {
  const f = fixture();
  const shortcut = f.shadow().querySelector('.shortcut');
  const captures = new Set();
  shortcut.setPointerCapture = id => captures.add(id);
  shortcut.releasePointerCapture = id => captures.delete(id);
  const initial = [f.host().style.left, f.host().style.top];
  f.pointer('pointerdown', 100, 100);
  f.pointer('pointerdown', 200, 200, { pointerId: 2 });
  f.pointer('pointermove', 300, 300, { pointerId: 2 });
  assert.deepEqual([f.host().style.left, f.host().style.top], initial);
  assert.deepEqual([...captures], [1]);
  f.pointer('pointermove', 80, 80);
  assert.notDeepEqual([f.host().style.left, f.host().style.top], initial);
  f.pointer('pointercancel', 80, 80);
  assert.deepEqual([f.host().style.left, f.host().style.top], initial);
  assert.equal(captures.size, 0); assert.equal(f.stored.has('xsched.probe.pos'), false);
});
test('twitter.com retains its matching probe UI without accessing position storage', () => {
  const stored = new Map([['xsched.probe.pos', JSON.stringify({ x: 200, y: 100 })]]);
  const calls = [];
  for (const method of ['get', 'set', 'delete']) {
    const original = stored[method].bind(stored);
    stored[method] = (...args) => { calls.push(method); return original(...args); };
  }
  const f = fixture(undefined, undefined, undefined, null, undefined, undefined, stored, 'twitter.com');
  assert.equal(f.host().dataset.xschedCount, '2');
  f.pointer('pointerdown', 100, 100); f.pointer('pointermove', 80, 80); f.pointer('pointerup', 80, 80);
  f.click('[data-xsched-reset-position]');
  assert.deepEqual(calls, [], 'load/save/reset remain x.com only');
  assert.equal(Map.prototype.get.call(stored, 'xsched.probe.pos'), JSON.stringify({ x: 200, y: 100 }));
});
test('resize while the host is removed clamps the remounted anchor and retains its saved preference', () => {
  const stored = new Map([['xsched.probe.pos', JSON.stringify({ x: 1000, y: 700 })]]);
  const f = fixture(undefined, undefined, undefined, null, undefined, undefined, stored);
  f.host().remove(); f.resize(390, 600);
  assert.equal(f.host().style.left, '330px'); assert.equal(f.host().style.top, '540px');
  assert.equal(stored.get('xsched.probe.pos'), JSON.stringify({ x: 1000, y: 700 }));
  f.resize(1100, 820);
  assert.equal(f.host().style.left, '1000px'); assert.equal(f.host().style.top, '700px');
});
test('home has only closed shortcut; localized goto navigates fixed target despite dataset tampering', () => {
  const f = fixture('/home', 'zh-Hant');
  assert.equal(f.shadow().querySelector('section').style.display, 'none');
  assert.equal(f.shadow().querySelector('.shortcut').title, globalThis.XSCHED_UI.STRINGS['zh-Hant'].shortcut);
  f.click('.shortcut');
  const go = f.shadow().querySelector('[data-xsched-goto]');
  assert.equal(go.textContent, '前往 Scheduled');
  assert.equal(go.dataset.xschedTarget, 'https://x.com/compose/post/unsent/scheduled');
  go.dataset.xschedTarget = 'https://invalid.example/';
  f.click('[data-xsched-goto]', false);
  assert.deepEqual(f.navigated, [], 'synthetic page clicks cannot navigate');
  f.click('[data-xsched-goto]');
  assert.deepEqual(f.navigated, ['https://x.com/compose/post/unsent/scheduled']);
});
test('runtime version warning updates diagnostic/header and suppresses exception contents', () => {
  const f = fixture();
  assert.equal(f.host().dataset.xschedDiag.split('\n')[0], 'xsched probe v0.1.2 (manifest 0.1.2)');
  f.setManifest('0.0.2'); f.poll();
  assert.match(f.shadow().querySelector('.version').textContent, /⚠ 版本不符/);
  assert.match(f.host().dataset.xschedDiag.split('\n')[0], /script 0.1.2 \/ manifest 0.0.2/);
  f.invalidate(); f.poll();
  assert.match(f.host().dataset.xschedDiag.split('\n')[0], /擴充已重新載入，請重新整理頁面/);
  assert.ok(!f.host().dataset.xschedDiag.includes('private exception'));
});
test('reinjection disposes prior current session without duplicate UI or duplicate polls', () => {
  const f = fixture();
  vm.runInContext(source, f.context); f.flush();
  assert.equal(f.document.querySelectorAll('#xsched-probe-root').length, 1);
  assert.match(f.host().dataset.xschedDiag, /^xsched probe v0\.1\.2/);
  f.host().remove(); f.poll();
  assert.equal(f.document.querySelectorAll('#xsched-probe-root').length, 1);
});

test('real content displays normalized time, shows unknown row explicitly and copies safe fmt', () => {
  const f = fixture('/compose/post/unsent/scheduled','zh-Hant','../fixtures/real/boss-skeleton.html');
  assert.equal(f.host().dataset.xschedCount,'1');
  assert.equal(f.shadow().querySelector('.time').textContent,'2026-11-03 23:19 (Tue)');
  assert.match(f.host().dataset.xschedDiag,/fmt=(?!none)/);
  const row=[...f.document.querySelectorAll('button')].find(el=>el.querySelector('[data-testid=tweetText]'));
  const label=[...row.querySelectorAll('span')].find(el=>!el.closest('[data-testid=tweetText]'));
  label.textContent='Will send on 2027-01-01 23:59 UTC';
  f.location.search='?changed'; f.poll();
  assert.equal(f.host().dataset.xschedCount,'1');
  assert.equal(f.shadow().querySelector('.time').textContent,'時間未解析');
  assert.match(f.host().dataset.xschedDiag,/timeFail=1/);
});

test('unchanged yearless labels repaint when the inferred calendar year changes', () => {
  let now = new Date(2025,11,31,12);
  const f = fixture('/compose/post/unsent/scheduled','zh-Hant','../fixtures/real/cross-year.html', () => now);
  assert.deepEqual([...f.shadow().querySelectorAll('.time')].map(el => el.textContent), ['2025-12-31 23:59 (Wed)','2026-01-01 00:05 (Thu)']);
  const before = f.host().dataset.xschedDiag;
  now = new Date(2026,11,31,12);
  f.location.search = '?calendar-changed'; f.poll();
  assert.equal(f.host().dataset.xschedDiag, before); // count, raw labels and fmt stay the same
  assert.deepEqual([...f.shadow().querySelectorAll('.time')].map(el => el.textContent), ['2026-12-31 23:59 (Thu)','2027-01-01 00:05 (Fri)']);
});

test('fixed actions stay outside scrolling content, minimize shares state across SPA and remount', () => {
  const f=fixture();
  f.context.innerHeight=600; f.context.innerWidth=1280; f.poll();
  const panel=f.shadow().querySelector('section');
  assert.ok(parseFloat(panel.style.maxHeight)<=360);
  assert.equal(f.shadow().querySelector('.panel-body').style.overflow,'auto');
  for (const selector of ['[data-xsched-copy]','[data-xsched-skeleton]']) {
    assert.equal(f.shadow().querySelector(selector).parentElement.className,'panel-actions');
    assert.ok(!f.shadow().querySelector('.panel-body').contains(f.shadow().querySelector(selector)));
  }
  f.click('[data-xsched-minimize]');
  assert.equal(panel.style.display,'none');
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),'false');
  f.location.pathname='/home'; f.poll(); f.host().remove(); f.poll();
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),'false');
  f.click('.shortcut');
  assert.equal(f.shadow().querySelector('[data-xsched-goto]').parentElement.className,'panel-actions');
});
test('unparsed UI sample uses only authenticated calendar mask, never body or raw identities', () => {
  const f=fixture('/compose/post/unsent/scheduled','zh-Hant','../fixtures/real/boss-skeleton.html');
  const row=[...f.document.querySelectorAll('button')].find(el=>el.querySelector('[data-testid=tweetText]'));
  const label=[...row.querySelectorAll('span')].find(el=>!el.closest('[data-testid=tweetText]'));
  label.textContent='將於 2026年11月3日 週二 下午11:99 發送 private 987654321 @decoy_handle https://fake.invalid/';
  row.querySelector('[data-testid=tweetText]').textContent='private body 123456789';
  f.location.search='?unknown';f.poll();
  const sample=f.shadow().querySelector('.sample').textContent;
  assert.match(sample,/將於 2026年11月3日 週二 下午11:99 發送/);
  for (const secret of ['private','987654321','123456789','decoy_handle','https','fake.invalid']) assert.ok(!sample.includes(secret),secret);
  label.textContent='https://fake.invalid/2026年11月3日週二下午11:19';
  f.location.search='?identity';f.poll();
  assert.match(f.shadow().querySelector('.sample').textContent,/無可安全匯出的樣本/);
});


function coordinates(f, selector) {
  const el=selector?f.shadow().querySelector(selector):f.host();
  return {x:parseFloat(el.style.left),y:parseFloat(el.style.top),height:el.style.height};
}
test('button and panel drags, toggles, polls, modal mutations and remount keep independent anchors',()=>{
  const f=fixture();const originalPanel=coordinates(f,'section');
  const storedPanel=f.stored.get('xsched.probe.panelPos');
  const button=coordinates(f);
  f.pointer('pointerdown',button.x+22,button.y+22);
  f.pointer('pointermove',222,122);f.pointer('pointerup',222,122);f.click('.shortcut');
  assert.deepEqual(coordinates(f,'section'),originalPanel);
  assert.equal(f.stored.get('xsched.probe.panelPos'),storedPanel);
  const movedButton=coordinates(f);
  f.pointer('pointerdown',originalPanel.x+20,originalPanel.y+20,{selector:'.panel-header'});
  f.pointer('pointermove',120,100,{selector:'section'});f.pointer('pointerup',120,100,{selector:'section'});
  assert.deepEqual(coordinates(f),movedButton);
  assert.deepEqual(JSON.parse(f.stored.get('xsched.probe.panelPos')),{x:100,y:80});
  const movedPanel=coordinates(f,'section');
  // The synthetic browser compatibility click is suppressed before buttons see it.
  f.click('.panel-header');
  for(let n=0;n<3;n++) {f.click('.shortcut');f.click('.shortcut');f.poll();assert.deepEqual(coordinates(f),movedButton);assert.deepEqual(coordinates(f,'section'),movedPanel);}
  const modal=f.document.createElement('div');modal.setAttribute('role','dialog');f.document.body.append(modal);
  f.mutate([{type:'childList',target:f.document.body,addedNodes:[modal],removedNodes:[]}]);
  assert.deepEqual(coordinates(f,'section'),movedPanel);
  f.host().remove();f.poll();assert.deepEqual(coordinates(f,'section'),movedPanel);assert.deepEqual(coordinates(f),movedButton);
  const reload=fixture(undefined,undefined,undefined,null,undefined,undefined,f.stored);
  assert.deepEqual(coordinates(reload),movedButton);assert.deepEqual(coordinates(reload,'section'),movedPanel);
  reload.click('[data-xsched-reset-position]');assert.equal(f.stored.has('xsched.probe.pos'),false);assert.equal(f.stored.has('xsched.probe.panelPos'),false);
  assert.deepEqual(coordinates(reload),button);assert.deepEqual(coordinates(reload,'section'),originalPanel);
  reload.poll();assert.equal(f.stored.size,0,'reset preview cannot repopulate keys on poll');
  reload.click('.shortcut');reload.click('.shortcut');assert.ok(f.stored.has('xsched.probe.panelPos'),'next explicit open commits the default panel only');
});
test('panel handle excludes buttons, threshold and stale pointers; capture survives rerender and cleans every interruption',()=>{
  for(const reason of ['resize','reset','pagehide','dispose','pointercancel','lostpointercapture','remount']) {
    const f=fixture();const panel=f.shadow().querySelector('section');const origin=coordinates(f,'section');
    const stored=f.stored.get('xsched.probe.panelPos');const captures=new Set();
    panel.setPointerCapture=id=>captures.add(id);
    panel.releasePointerCapture=id=>{captures.delete(id);f.pointer('lostpointercapture',0,0,{selector:'section',pointerId:id});};
    f.pointer('pointerdown',50,50,{selector:'[data-xsched-minimize]'});
    f.pointer('pointermove',100,100,{selector:'section'});f.pointer('pointerup',100,100,{selector:'section'});
    assert.equal(captures.size,0);assert.deepEqual(coordinates(f,'section'),origin);
    f.pointer('pointerdown',50,50,{selector:'.panel-header'});f.pointer('pointermove',52,52,{selector:'section'});
    assert.deepEqual(coordinates(f,'section'),origin);f.pointer('pointerup',52,52,{selector:'section'});assert.equal(captures.size,0);
    f.pointer('pointerdown',50,50,{selector:'.panel-header'});
    f.pointer('pointerdown',80,80,{selector:'.panel-header',pointerId:2});assert.deepEqual([...captures],[1]);
    f.pointer('pointermove',300,300,{selector:'section',pointerId:2});assert.deepEqual(coordinates(f,'section'),origin);
    f.pointer('pointermove',20,20,{selector:'section'});assert.notDeepEqual(coordinates(f,'section'),origin);
    f.setManifest('0.0.2');f.poll();assert.equal(f.shadow().querySelector('section'),panel);assert.ok(captures.has(1),'render replaces header, not captured section');
    if(reason==='resize')f.resize(1100,820);
    else if(reason==='reset')f.click('[data-xsched-reset-position]');
    else if(reason==='pagehide')f.emit('pagehide');
    else if(reason==='dispose')f.context.XSCHED_PROBE_SESSION.dispose();
    else if(reason==='remount'){f.host().remove();f.poll();}
    else f.pointer(reason,20,20,{selector:'section'});
    assert.equal(captures.size,0,reason);
    assert.equal(f.stored.has('xsched.probe.pos'),false);
    assert.equal(f.stored.get('xsched.probe.panelPos'),reason==='reset'?undefined:stored,reason);
    if(f.host()) {
      const point=coordinates(f,'section');f.pointer('pointermove',400,400,{selector:'section'});f.pointer('pointerup',400,400,{selector:'section'});
      assert.deepEqual(coordinates(f,'section'),point,reason);
    }
  }
});
test('offscreen saved panel clamps across resize and disconnected host without overwriting storage',()=>{
  const stored=new Map([['xsched.probe.pos','{"x":1000,"y":700}'],['xsched.probe.panelPos','{"x":5000,"y":5000}']]);
  const f=fixture(undefined,undefined,undefined,null,undefined,undefined,stored);
  assert.deepEqual(coordinates(f,'section'),{x:740,y:312,height:'492px'});
  f.host().remove();f.resize(390,600);
  assert.deepEqual(coordinates(f,'section'),{x:30,y:224,height:'360px'});
  assert.equal(stored.get('xsched.probe.panelPos'),'{"x":5000,"y":5000}');
  f.resize(1100,820);assert.deepEqual(coordinates(f,'section'),{x:740,y:312,height:'492px'});
});


async function waitFill(f) {
 for(let i=0;globalThis.XSCHED_QUICK.isFilling(f.document)&&i<200;i++)await new Promise(resolve=>setTimeout(resolve,10));
 await new Promise(resolve=>setTimeout(resolve,0)); f.flush();
 assert.equal(globalThis.XSCHED_QUICK.isFilling(f.document),false,'bounded fill completed');
}
test('quick controls in real content: trusted fill only, nine-language status and fresh partial detection',async()=>{
  const now=()=>new Date(2027,11,31,21,0);
  const f=fixture('/compose/post','zh-Hant','../fixtures/quick-dialog.html',now);
  const proto=f.document.defaultView.HTMLSelectElement.prototype;
  const descriptor=Object.getOwnPropertyDescriptor(proto,'value');
  Object.defineProperty(proto,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.getAttribute('value') ?? this.querySelector('option')?.getAttribute('value');},set(value){for(const option of this.querySelectorAll('option'))option.removeAttribute('selected');for(const option of this.querySelectorAll('option'))if(option.getAttribute('value')===value)option.setAttribute('selected','');}});
  try {
    f.click('.shortcut');
    assert.match(f.host().dataset.xschedDiag,/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/);
    assert.equal(f.shadow().querySelectorAll('[data-xsched-slot]').length,4);
    const before=[...f.document.querySelectorAll('select')].map(el=>el.value);
    f.click('[data-xsched-slot="lunch"]',false);
    assert.deepEqual([...f.document.querySelectorAll('select')].map(el=>el.value),before);
    let change=0,send=0;
    f.document.addEventListener('change',()=>change++);
    for(const el of f.document.querySelectorAll('button,form'))for(const type of ['click','submit'])el.addEventListener(type,()=>send++);
    f.click('[data-xsched-slot="lunch"]');await waitFill(f);f.flush();
    assert.equal(f.document.querySelector('select[name=year]').value,'2028');
    assert.equal(f.document.querySelector('select[name=minute]').value,'30');
    assert.equal(change,6);assert.equal(send,0);
    assert.equal(f.shadow().querySelector('.quick-status').textContent,'已填入欄位；尚未排程');
    assert.match(f.host().dataset.xschedDiag,/fill=ok y=2028 m=1 d=1 h=12 min=30 period=PM/);
    const copies=[];f.context.navigator.clipboard={writeText(value){copies.push(value);return Promise.resolve();}};
    f.click('[data-xsched-copy]');assert.equal(copies[0],f.host().dataset.xschedDiag,'copy includes safe successful fill summary');
    // DOM goes partial between render and click: preflight must re-read, not use stale selects.
    const minute=f.document.querySelector('select[name=minute]');minute.remove();
    const partial=[...f.document.querySelectorAll('select')].map(el=>el.value);
    f.click('[data-xsched-slot="evening"]');await waitFill(f);
    assert.deepEqual([...f.document.querySelectorAll('select')].map(el=>el.value),partial);assert.equal(change,6);
    f.poll();
    assert.equal(f.shadow().querySelector('.quick-status').textContent,'未偵測到排程欄位');
    assert.equal(f.shadow().querySelector('[data-xsched-slot]').disabled,true);
    assert.match(f.host().dataset.xschedDiag,/schedDialog=1 dateCtl=3 timeCtl=2 selects=5/);
  } finally {Object.defineProperty(proto,'value',descriptor);}
});
test('missing picker keeps quick buttons disabled and leaves copy tools accessible',()=>{
  const f=fixture('/home','en','../fixtures/quick-missing.html');f.click('.shortcut');
  assert.equal(f.shadow().querySelector('.quick-status').textContent,'Schedule fields not detected');
  for(const button of f.shadow().querySelectorAll('[data-xsched-slot]'))assert.equal(button.disabled,true);
  assert.ok(f.shadow().querySelector('[data-xsched-copy]'));assert.ok(f.shadow().querySelector('[data-xsched-skeleton]'));
  assert.match(f.host().dataset.xschedDiag,/schedDialog=1 dateCtl=0 timeCtl=0 selects=0/);
});

test('quick fixture readiness: early toggle is ignored until first diagnostic, frozen Date does not stop timers',()=>{
  const f=fixture('/compose/post','en','../fixtures/quick-dialog.html',null,globalThis.XSCHED_UI,globalThis.XSCHED_READER,new Map(),'x.com',false);
  assert.ok(f.shadow().querySelector('.shortcut'));
  assert.equal(f.host().dataset.xschedDiag,undefined);
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),null);
  // Same test-only 2027 clock as Chrome quickFixture; timeout callbacks remain live.
  vm.runInContext(`globalThis.__QuickRealDate=Date;
    globalThis.Date=class extends __QuickRealDate {
      constructor(...args){super(...(args.length?args:[new __QuickRealDate(2027,11,31,21,0).getTime()]));}
      static now(){return new __QuickRealDate(2027,11,31,21,0).getTime();}
    };`,f.context);
  f.click('.shortcut');f.flush();f.poll();
  assert.match(f.host().dataset.xschedDiag,/^xsched probe v0\.1\.2/);
  assert.equal(f.host().dataset.xschedMode,'other');assert.equal(f.host().dataset.xschedMounted,'1');
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),'false');
  assert.equal(f.shadow().querySelector('section').style.display,'none');
  assert.match(f.host().dataset.xschedDiag,/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/);
  // The test fix waits for the state above, THEN sends exactly one ordinary click.
  f.click('.shortcut');
  assert.equal(f.shadow().querySelector('.shortcut').getAttribute('aria-expanded'),'true');
  assert.equal(f.shadow().querySelector('section').style.display,'flex');
  assert.equal(f.shadow().querySelectorAll('[data-xsched-slot]').length,4);
});

test('real picker wiring prefers document language, preserves counts, and exposes unavailable-year/rollback errors',async()=>{
 const now=()=>new Date(2027,11,31,21,0);
 for(const [file,slot,status,changes] of [['year-missing','morning','目標年份不在 X 的選項中',0],['dialog','evening','填值失敗，已還原；請逐欄檢查',11]]) {
  const f=fixture('/compose/post','zh-Hant',`../fixtures/quick-real-${file}.html`,now);
  f.context.navigator.language='zh-CN';f.click('.shortcut');
  assert.match(f.host().dataset.xschedDiag,/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/);
  const prototype=f.document.defaultView.HTMLSelectElement.prototype, original=Object.getOwnPropertyDescriptor(prototype,'value');
  let change=0,refused=false;
  Object.defineProperty(prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? '';},set(value){for(const option of this.querySelectorAll('option'))option.removeAttribute('selected');for(const option of this.querySelectorAll('option'))if(option.value===value){option.setAttribute('selected','');break;}}});
  try {
   for(const select of f.document.querySelectorAll('select'))select.addEventListener('change',()=>change++);
   f.document.getElementById('fake-select-hour').addEventListener('change',event=>{if(!refused&&event.target.value==='8'){refused=true;event.target.value='';}});
   const values=()=>[...f.document.querySelectorAll('select')].map(node=>node.value),before=values();
   f.click(`[data-xsched-slot="${slot}"]`);await waitFill(f);
   assert.equal(f.shadow().querySelector('.quick-status').textContent,status);assert.deepEqual(values(),before);assert.equal(change,changes);
   f.flush();assert.equal(f.shadow().querySelector('.quick-status').textContent,status,'error survives render');
   assert.match(f.host().dataset.xschedDiag,/fill=(yearMissing|failed) failed=(year|hour)/);
   assert.equal(f.host().dataset.xschedDiag.split('\n').filter(line=>line.startsWith('field=')).length,6);
   const copies=[];f.context.navigator.clipboard={writeText(value){copies.push(value);return Promise.resolve();}};
   f.click('[data-xsched-copy]');assert.equal(copies[0],f.host().dataset.xschedDiag,'copy includes all six safe failure rows');
  }finally{Object.defineProperty(prototype,'value',original);}
 }
});
