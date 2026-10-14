import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/reader.js');
await import('../probe/overview.js');
const O = globalThis.XSCHED_OVERVIEW;
const R = globalThis.XSCHED_READER;
const now = new Date(2028, 0, 1, 8, 0).getTime();
function item(at, body) {
  const date = at instanceof Date ? at : new Date(at);
  return { at: date, key: `${date.toISOString()}\u0000${body}`, preview: Array.from(body).slice(0, 20).join(''), p: body };
}
test('overview sorts by time, keeps 100 code points, and drops unparsed rows', () => {
  const later = new Date(2028, 2, 1, 21);
  const early = new Date(2028, 0, 1, 9);
  const mid = new Date(2028, 1, 6, 12, 30);
  const long = '😀'.repeat(96) + '尾部不可見';
  const snap = O.fromItems([
    item(later, 'charlie'),
    { at: null, preview: 'nope', key: 'x\u0000nope' },
    item(early, long),
    item(mid, 'bravo')
  ], now);
  assert.equal(snap.n, 3);
  assert.equal(snap.s, now);
  assert.deepEqual(snap.i.map(row => row.t), [early.getTime(), mid.getTime(), later.getTime()]);
  assert.equal(Array.from(snap.i[0].p).length, 100);
  assert.equal(snap.i[0].p, '😀'.repeat(96) + '尾部不可');
  assert.ok(!snap.i[0].p.includes('見'));
  assert.equal(O.previewFrom(item(early, long)), snap.i[0].p);
});
test('inspect separates missing, empty, expired and ready; pending is not empty', () => {
  assert.equal(O.inspect(null, now).status, 'missing');
  assert.equal(O.inspect(null, now, true).status, 'pending');
  assert.equal(O.inspect({ s: now, n: 0 }, now).status, 'empty');
  assert.equal(O.inspect({ s: now - O.TTL - 1, n: 0 }, now).status, 'expired');
  const ready = O.fromItems([item(now + 5 * 60000, 'soon')], now);
  const view = O.inspect(ready, now);
  assert.equal(view.status, 'ready');
  assert.equal(view.total, 1);
  assert.equal(view.until, 5 * 60000);
  assert.equal(O.formatUntil(view.until, O.stringsFor('en', 'en')), '5 min');
  const stale = { s: now - O.TTL - 1000, n: 1, i: [{ t: now + 60000, p: 'stale' }] };
  assert.equal(O.inspect(stale, now).status, 'expired');
  assert.equal(O.inspect(stale, now).total, 1);
});
test('nine languages have distinct missing vs empty copy and countdown tokens', () => {
  for (const lang of Object.keys(O.STRINGS)) {
    const labels = O.stringsFor(lang, lang);
    assert.ok(labels.missing.length > 8, lang);
    assert.ok(labels.empty.length > 8, lang);
    assert.notEqual(labels.missing, labels.empty, lang);
    assert.ok(labels.expired.includes('Scheduled') || /過期|过期|期限|만료|caduc|expir|abgelaufen/.test(labels.expired), lang);
    assert.ok(O.formatUntil(90000, labels).length > 0, lang);
  }
  assert.equal(O.stringsFor('zh-TW', 'en').title, O.STRINGS['zh-Hant'].title);
  assert.equal(O.stringsFor('zh', 'en').title, O.STRINGS['zh-Hans'].title);
});
test('overview storage accepts only the fixed key and strict snapshot schema', () => {
  const source = readFileSync(new URL('../probe/position.js', import.meta.url), 'utf8');
  function store(hostname = 'x.com') {
    const data = new Map();
    const window = { location: { hostname }, localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) } };
    const context = vm.createContext({ window });
    vm.runInContext(source, context);
    return { api: context.XSCHED_POSITION, data };
  }
  const f = store();
  const row = { t: now + 60000, p: 'Synthetic overview alpha note' };
  assert.equal(f.api.saveOverview({ s: now, n: 1, i: [row] }), true);
  assert.deepEqual(JSON.parse(f.data.get('xsched.probe.overview')), { s: now, n: 1, i: [row] });
  assert.equal(f.api.saveOverview({ s: now, n: 0 }), true);
  assert.deepEqual(JSON.parse(f.data.get('xsched.probe.overview')), { s: now, n: 0 });
  const before = f.data.get('xsched.probe.overview');
  for (const value of [
    { s: now, n: 0, extra: 1 },
    { s: now, n: 1 },
    { s: now, n: 1, i: [{ t: now, p: 'ok', body: 'private' }] },
    { s: now, n: 1, i: [{ t: '1', p: 'ok' }] },
    { s: now, n: 1, i: [{ t: now, p: 'x'.repeat(101) }] },
    { s: now, n: 1, i: [{ t: now, p: 'ok\u0000' }] },
    { s: -1, n: 0 },
    null, [], { n: 0 }
  ]) assert.equal(f.api.saveOverview(value), false, JSON.stringify(value));
  assert.equal(f.data.get('xsched.probe.overview'), before);
  f.data.set('xsched.probe.overview', JSON.stringify({ s: now, n: 0, body: 'private' }));
  assert.equal(f.api.loadOverview(), null);
  f.data.set('xsched.probe.overview', ' '.repeat(24577));
  assert.equal(f.api.loadOverview(), null);
  let reads = 0;
  assert.equal(f.api.saveOverview({ get s() { return ++reads <= 2 ? now : 0; }, n: 0 }), false);
  const other = store('twitter.com');
  assert.equal(other.api.saveOverview({ s: now, n: 0 }), false);
  assert.equal(other.data.size, 0);
});
test('render writes status/count without using class time/preview or anchors', () => {
  const { document } = parseHTML('<html><body></body></html>');
  const root = document.createElement('div');
  document.body.append(root);
  const snap = O.fromItems([
    item(new Date(2028, 0, 1, 9), 'Synthetic overview alpha note'),
    item(new Date(2028, 1, 6, 12, 30), 'Synthetic overview bravo recap')
  ], now);
  let goes = 0;
  O.render(root, snap, { now, showRows: true, doclang: 'en', navlang: 'en', onGo() { goes += 1; } });
  assert.equal(root.dataset.xschedOverviewStatus, 'ready');
  assert.equal(root.dataset.xschedOverviewCount, '2');
  assert.deepEqual([...root.querySelectorAll('.overview-when')].map(el => el.textContent), ['2028-01-01 09:00 (Sat)', '2028-02-06 12:30 (Sun)']);
  assert.equal(root.querySelectorAll('.time').length, 0);
  assert.equal(root.querySelectorAll('a').length, 0);
  assert.equal(root.querySelector('.overview-preview').textContent, 'Synthetic overview alpha note');
  const event = new document.defaultView.Event('click');
  Object.defineProperty(event, 'isTrusted', { value: false });
  root.querySelector('.overview-row').dispatchEvent(event);
  assert.equal(goes, 0);
  const trusted = new document.defaultView.Event('click');
  Object.defineProperty(trusted, 'isTrusted', { value: true });
  root.querySelector('.overview-row').dispatchEvent(trusted);
  assert.equal(goes, 1);
  O.render(root, null, { now, showRows: true, doclang: 'en', navlang: 'en' });
  assert.equal(root.dataset.xschedOverviewStatus, 'missing');
  assert.match(root.querySelector('.overview-status').textContent, /not synced|not “nothing scheduled”/i);
  O.render(root, { s: now, n: 0 }, { now, showRows: true, doclang: 'en', navlang: 'en' });
  assert.equal(root.dataset.xschedOverviewStatus, 'empty');
  assert.match(root.querySelector('.overview-status').textContent, /empty list confirmed/i);
  assert.notEqual(root.querySelector('.overview-status').textContent.includes('not synced'), true);
});
test('reader formatTime used by overview stays calendar-only', () => {
  assert.equal(R.formatTime(new Date(2028, 0, 1, 9)), '2028-01-01 09:00 (Sat)');
});
