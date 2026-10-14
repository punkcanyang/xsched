import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/reader.js');
await import('../probe/overview.js');
const O = globalThis.XSCHED_OVERVIEW;
const R = globalThis.XSCHED_READER;

function item(at, preview, extra = {}) {
  return { time: extra.time || 'label', preview, at, unparsed: extra.unparsed === true, sample: extra.sample || '', body: extra.body, key: extra.key };
}

test('snapshot sorts by local time, keeps unparsed last, and never copies body or key', () => {
  const late = item(new Date(2028, 0, 1, 0, 0), 'new year midnight');
  const noon = item(new Date(2027, 2, 1, 12, 30), 'lunchtime fixture');
  const morning = item(new Date(2027, 1, 28, 8, 0), 'morning product note');
  const evening = item(new Date(2027, 2, 5, 20, 0), 'evening recap note');
  const unknown = item(null, 'unparsed row', { unparsed: true, sample: 'Will send on ???', body: 'secret full body', key: 'label\u0000secret full body' });
  const copies = O.snapshot([late, unknown, noon, evening, morning]);
  assert.deepEqual(copies.map((row) => row.preview), ['morning product note', 'lunchtime fixture', 'evening recap note', 'new year midnight', 'unparsed row']);
  assert.equal(copies[0].at.getTime(), morning.at.getTime());
  assert.equal(copies[3].at.getFullYear(), 2028);
  assert.equal(copies[4].unparsed, true);
  assert.equal(copies[4].at, null);
  for (const row of copies) {
    assert.equal(Object.hasOwn(row, 'body'), false);
    assert.equal(Object.hasOwn(row, 'key'), false);
    assert.deepEqual(Object.keys(row).sort(), ['at', 'preview', 'sample', 'time', 'unparsed']);
  }
});

test('preview is 20 code points and does not split emoji or CJK', () => {
  assert.equal(O.previewText('😀一二三四五六七八九十壹貳參肆伍陸柒捌玖拾'), '😀一二三四五六七八九十壹貳參肆伍陸柒捌玖');
  assert.equal(Array.from(O.previewText('x'.repeat(50))).length, 20);
  const copy = O.snapshot([item(new Date(2027, 5, 1, 9, 0), '😀一二三四五六七八九十壹貳參肆伍陸柒捌玖拾')])[0];
  assert.equal(copy.preview, '😀一二三四五六七八九十壹貳參肆伍陸柒捌玖');
});

test('formatItemTime keeps date, hour, minute, meridiem and cross-year year', () => {
  const morning = item(new Date(2027, 1, 28, 8, 0), 'am');
  const noon = item(new Date(2027, 2, 1, 12, 0), 'noon');
  const midnight = item(new Date(2028, 0, 1, 0, 0), 'midnight');
  const evening = item(new Date(2027, 11, 31, 23, 59), 'nye');
  assert.equal(O.formatItemTime(morning, 'en', 'en'), '2027-02-28 08:00 (Sun) AM');
  assert.equal(O.formatItemTime(noon, 'en', 'en'), '2027-03-01 12:00 (Mon) PM');
  assert.equal(O.formatItemTime(midnight, 'en', 'en'), '2028-01-01 00:00 (Sat) AM');
  assert.equal(O.formatItemTime(evening, 'en', 'en'), '2027-12-31 23:59 (Fri) PM');
  assert.equal(O.formatItemTime(morning, 'zh-Hant', 'en'), '2027-02-28 08:00 (Sun) 上午');
  assert.equal(O.formatItemTime(noon, 'zh-Hans', 'en'), '2027-03-01 12:00 (Mon) 下午');
  assert.equal(O.formatItemTime(midnight, 'ja', 'en'), '2028-01-01 00:00 (Sat) 午前');
  assert.equal(O.formatItemTime(evening, 'ko', 'en'), '2027-12-31 23:59 (Fri) 오후');
  assert.equal(O.formatItemTime(item(null, 'x', { unparsed: true }), 'en', 'en'), 'Time not parsed');
  assert.equal(O.meridiem(new Date(2027, 0, 1, 11, 59), 'en', 'en'), 'AM');
  assert.equal(O.meridiem(new Date(2027, 0, 1, 12, 0), 'zh-Hant', 'en'), '下午');
});

test('nine languages include heading, last-sync, empty prompt, unknown and meridiem', () => {
  assert.deepEqual(Object.keys(O.STRINGS).sort(), ['de', 'en', 'es', 'fr', 'ja', 'ko', 'pt', 'zh-Hans', 'zh-Hant']);
  for (const lang of Object.keys(O.STRINGS)) {
    const labels = O.stringsFor(lang, 'en');
    for (const key of ['heading', 'synced', 'empty', 'none', 'unknown', 'am', 'pm']) assert.ok(labels[key].length, `${lang}.${key}`);
  }
  assert.equal(O.stringsFor('zh-TW', 'en'), O.STRINGS['zh-Hant']);
  assert.equal(O.stringsFor('unknown', 'fr-FR'), O.STRINGS.fr);
  assert.equal(O.stringsFor('unknown', 'unknown'), O.STRINGS.en);
  assert.match(O.STRINGS['zh-Hant'].empty, /去 Scheduled 頁同步一次/);
});

test('empty input stays empty and invalid dates are unparsed without invented times', () => {
  assert.deepEqual(O.snapshot([]), []);
  const copies = O.snapshot([item(new Date(NaN), 'fake'), item(undefined, 'also fake')]);
  assert.equal(copies.length, 2);
  assert.equal(copies.every((row) => row.at === null), true);
  assert.equal(O.formatItemTime(copies[0], 'en', 'en'), 'Time not parsed');
});

test('overview fixture reads five synthetic posts; snapshot sorts them independently of DOM order', () => {
  const html = readFileSync(new URL('../fixtures/overview.html', import.meta.url), 'utf8');
  const { document } = parseHTML(html);
  const report = R.readSnapshot(document, { pathname: '/compose/post/unsent/scheduled' });
  assert.equal(report.onScheduled, 1);
  assert.equal(report.items.length, 5);
  assert.equal(report.timeFail, 0);
  const live = report.items.map((row) => R.formatTime(row.at));
  assert.deepEqual(live, [
    '2027-03-05 20:00 (Fri)',
    '2027-02-28 08:00 (Sun)',
    '2028-01-01 00:00 (Sat)',
    '2027-03-01 12:30 (Mon)',
    '2027-12-31 23:59 (Fri)',
  ]);
  const cached = O.snapshot(report.items);
  assert.deepEqual(cached.map((row) => O.formatItemTime(row, 'en', 'en')), [
    '2027-02-28 08:00 (Sun) AM',
    '2027-03-01 12:30 (Mon) PM',
    '2027-03-05 20:00 (Fri) PM',
    '2027-12-31 23:59 (Fri) PM',
    '2028-01-01 00:00 (Sat) AM',
  ]);
  for (const row of cached) assert.ok(Array.from(row.preview).length <= 20);
  const joined = JSON.stringify(cached);
  assert.equal(joined.includes('tweetText'), false);
  assert.equal(joined.includes('secret'), false);
});

test('overview module stays inside existing verify bans: no scroll, click, storage or network', async () => {
  const { scanSource } = await import('../scripts/verify.mjs');
  const source = readFileSync(new URL('../probe/overview.js', import.meta.url), 'utf8');
  assert.deepEqual(scanSource(source, 'probe/overview.js'), []);
  for (const attack of ['row.scrollIntoView()', 'icon.click()', 'localStorage.setItem("k","v")', 'fetch("https://evil.example/")', 'dispatchEvent(event)']) {
    assert.ok(scanSource(source + '\n' + attack, 'probe/overview.js').length, attack);
  }
});
