// Run the real glue against local DOM. Geometry/hit testing remains Chrome e2e's job.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/reader.js');
await import('../probe/skeleton.js');
await import('../probe/ui.js');
const source = readFileSync(new URL('../probe/content.js', import.meta.url), 'utf8');
function fixture(pathname = '/compose/post/unsent/scheduled', lang = 'en', file = '../fixtures/en.html', clock = null) {
  const { document } = parseHTML(readFileSync(new URL(file, import.meta.url), 'utf8'));
  document.documentElement.lang = lang;
  const timers = new Map();
  const polls = new Map();
  let id = 0;
  let manifest = '0.0.3';
  let invalidated = false;
  const navigated = [];
  const location = { pathname, search: '', assign(target) { navigated.push(target); } };
  const window = {
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(key) { timers.delete(key); },
    setInterval(fn) { polls.set(++id, fn); return id; }, clearInterval(key) { polls.delete(key); },
    addEventListener() {}, removeEventListener() {},
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
    XSCHED_READER: clock ? { ...globalThis.XSCHED_READER, readSnapshot(doc, options) { return globalThis.XSCHED_READER.readSnapshot(doc, { ...options, now: clock() }); } } : globalThis.XSCHED_READER,
    XSCHED_SKELETON: globalThis.XSCHED_SKELETON, XSCHED_UI: globalThis.XSCHED_UI,
    document, window, navigator: { language: 'en-US' }, location, innerWidth: 1100, innerHeight: 820,
    chrome: { runtime: { id: 'local-test', getManifest() { if (invalidated) throw new Error('private exception'); return { version: manifest }; } } },
    getComputedStyle() { return { position: 'static' }; },
    MutationObserver: class { observe() {} disconnect() {} },
  });
  function flush() { for (let n = 0; timers.size && n < 10; n++) { const pending = [...timers.values()]; timers.clear(); pending.forEach((fn) => fn()); } }
  function poll() { [...polls.values()].forEach((fn) => fn()); flush(); }
  vm.runInContext(source, context); flush();
  const host = () => document.getElementById('xsched-probe-root');
  const shadow = () => host().shadowRoot;
  const click = (selector, trusted = true) => {
    const event = new document.defaultView.Event('click');
    // linkedom has no browser input pipeline; explicitly model the trust flag.
    Object.defineProperty(event, 'isTrusted', { value: trusted });
    shadow().querySelector(selector).dispatchEvent(event);
  };
  return { document, host, shadow, click, location, navigated, poll, flush, context,
    setManifest(value) { manifest = value; }, invalidate() { invalidated = true; } };
}
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
  assert.equal(f.shadow().querySelector('section').style.display, 'block');
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
  assert.equal(f.host().dataset.xschedDiag.split('\n')[0], 'xsched probe v0.0.3 (manifest 0.0.3)');
  f.setManifest('0.0.2'); f.poll();
  assert.match(f.shadow().querySelector('.version').textContent, /⚠ 版本不符/);
  assert.match(f.host().dataset.xschedDiag.split('\n')[0], /script 0.0.3 \/ manifest 0.0.2/);
  f.invalidate(); f.poll();
  assert.match(f.host().dataset.xschedDiag.split('\n')[0], /擴充已重新載入，請重新整理頁面/);
  assert.ok(!f.host().dataset.xschedDiag.includes('private exception'));
});
test('reinjection disposes prior current session without duplicate UI or duplicate polls', () => {
  const f = fixture();
  vm.runInContext(source, f.context); f.flush();
  assert.equal(f.document.querySelectorAll('#xsched-probe-root').length, 1);
  assert.match(f.host().dataset.xschedDiag, /^xsched probe v0\.0\.3/);
  f.host().remove(); f.poll();
  assert.equal(f.document.querySelectorAll('#xsched-probe-root').length, 1);
});

test('real content displays normalized time, shows unknown row explicitly and copies safe fmt', () => {
  const f = fixture('/compose/post/unsent/scheduled','zh-Hant','../fixtures/real/boss-skeleton.html');
  assert.equal(f.host().dataset.xschedCount,'1');
  assert.equal(f.shadow().querySelector('.time').textContent,'2026-10-10 09:00 (Sat)');
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
