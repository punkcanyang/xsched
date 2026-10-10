import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { readFileSync } from 'node:fs';
import { scanFixture } from '../scripts/real-skeleton-fixture.mjs';
await import('../probe/reader.js');
await import('../probe/skeleton.js');
const R = globalThis.XSCHED_READER;
const S = globalThis.XSCHED_SKELETON;
const scheduled = '/compose/post/unsent/scheduled';
const now = new Date(2026,11,31,12);
const html = readFileSync(new URL('../fixtures/real/boss-skeleton.html',import.meta.url),'utf8');
const getDoc = () => parseHTML(html).document;
const snap = (doc) => R.readSnapshot(doc,{pathname:scheduled,now});
test('confirmed Chinese grammar handles every AM/PM hour and preserves date over weekday', () => {
  for (const [prefix,weekday,suffix] of [['將於','週二','發送'],['将于','周二','发送']]) {
    for (const mer of ['上午','下午']) for (let hour=1; hour<=12; hour++) {
      const label = `${prefix} 2026年11月3日 ${weekday} ${mer}${hour}:19 ${suffix}`;
      const parsed = R.parseSchedule(label);
      assert.ok(parsed?.at,label);
      assert.equal(parsed.at.getHours(), hour % 12 + (mer==='下午' ? 12 : 0),label);
      assert.equal(parsed.at.getMinutes(),19,label);
      assert.equal(parsed.tier,'strict');
      assert.equal(R.timeSample(label),label);
    }
  }
  assert.equal(R.formatTime(R.parseSchedule('將於 2026年11月3日 週五 下午11:19 發送').at),'2026-11-03 23:19 (Tue)');
});
test('Chinese weekdays and whitespace variants work in strict, loose and yearless labels', () => {
  for (const day of ['週二','周二','星期二','週 二']) for (const gap of ['',' ','\u00a0']) {
    const label=`將於${gap}2026年${gap}11月${gap}3日${gap}${day}${gap}下午${gap}11:19${gap}發送`;
    assert.equal(R.formatTime(R.parseSchedule(label)?.at),'2026-11-03 23:19 (Tue)',label);
    assert.equal(R.formatTime(R.parseTimeLabel(label)?.at),'2026-11-03 23:19 (Tue)',label);
    const bare=`2026年11月3日 ${day} 下午11:19`;
    assert.equal(R.formatTime(R.parseSchedule(bare)?.at),'2026-11-03 23:19 (Tue)',bare);
  }
  assert.equal(R.formatTime(R.parseSchedule('將於 1月1日 星期五 上午12:07 發送',{now})?.at),'2027-01-01 00:07 (Fri)');
  assert.equal(R.formatTime(R.parseSchedule('將於 2026年11月3日 星期二 下午 11 ： 19 發送')?.at),'2026-11-03 23:19 (Tue)');
});
test('weekday grammar never exports calendar-shaped identities or tweet text', () => {
  const doc=getDoc();
  const row=[...doc.querySelectorAll('button')].find(el=>el.querySelector('[data-testid=tweetText]'));
  const label=[...row.querySelectorAll('span')].find(el=>!el.closest('[data-testid=tweetText]'));
  for (const secret of ['https://fake.invalid/2026年11月3日週二下午11:19發送','@2026年11月3日週二下午11:19','2026年11月3日週二下午11:19@fake.invalid']) {
    label.textContent=secret;
    assert.equal(R.timeSample(secret),'');
    const result=snap(doc);
    assert.equal(result.items.length,1); assert.equal(result.timeFail,1);
    assert.equal(result.fmt,''); assert.deepEqual(result.samples,[]);
    assert.ok(!S.buildSkeleton(doc,{pathname:scheduled}).includes('calendar='));
  }
});
test('legacy cell, role and text fallbacks cannot parse a weekday date from tweetText', () => {
  for (const attr of ['data-testid="cellInnerDiv"', 'role="listitem"', 'role="button"', '']) {
    for (const bodyAttrs of ['', 'role="listitem" aria-label="將於 2026年11月3日 週二 下午11:19 發送"']) {
      const {document} = parseHTML(`<html><body><section role="dialog"><div ${attr}><span>未知格式</span><div data-testid="tweetText" ${bodyAttrs}>將於 2026年11月3日 週二 下午11:19 發送</div></div></section></body></html>`);
      const report = snap(document);
      assert.equal(report.items.length, 0, attr);
      assert.equal(report.timeOk, 0, attr);
      assert.equal(report.fmt, '', attr);
      assert.deepEqual(report.samples, [], attr);
    }
  }
});
test('legacy separate time label still reads correctly when the post contains another schedule', () => {
  for (const attr of ['data-testid="cellInnerDiv"', 'role="listitem"', 'role="button"', '']) {
    const {document} = parseHTML(`<html><body><section role="dialog"><div ${attr}><span>將於 2026年11月3日 週二 上午12:19 發送</span><div data-testid="tweetText">將於 2026年12月1日 週二 下午11:19 發送</div></div></section></body></html>`);
    const report = snap(document);
    assert.equal(report.items.length, 1, attr);
    assert.equal(R.formatTime(report.items[0].at), '2026-11-03 00:19 (Tue)', attr);
    assert.ok(report.items[0].key.endsWith('\u0000將於 2026年12月1日 週二 下午11:19 發送'), attr);
    assert.equal(report.timeFail, 0, attr);
  }
});
const labels = [
  ['en','Jan 1 at 12:05 AM', 0,5], ['en','Jan 1 at 12:05 PM',12,5], ['en','1 Jan at 23:59',23,59],
  ['zh-Hant','1月1日 上午12:05',0,5], ['zh-Hant','1月1日 下午12:05',12,5], ['zh-Hant','1月1日 23:59',23,59],
  ['zh-Hans','1月1日 上午12:05',0,5], ['zh-Hans','1月1日 下午12:05',12,5], ['zh-Hans','1月1日 23:59',23,59],
  ['ja','1月1日の午前12:05に送信されます',0,5], ['ja','1月1日の午後12:05に送信されます',12,5], ['ja','1月1日 23:59',23,59],
  ['ko','1월 1일 오전 12:05',0,5], ['ko','1월 1일 오후 12:05',12,5], ['ko','1월 1일 23:59',23,59],
];
// These are concrete synthetic examples, not claimed as the owner's erased text.
for (const [lang,label,hour,minute] of labels) test(`yearless synthetic ${lang}: ${label}`, () => {
  const result = R.parseTimeLabel(label,{now,lang});
  assert.ok(result?.at,label);
  assert.deepEqual([result.at.getFullYear(),result.at.getMonth(),result.at.getDate(),result.at.getHours(),result.at.getMinutes()],[2027,0,1,hour,minute]);
  assert.equal(result.inferredYear,true);
});
test('explicit years, 24-hour clocks, punctuated AM/PM and full-width colon are deterministic', () => {
  const examples = [
    ['Jan 1, 2028 at 12:05 A.M.','en',0], ['1 Jan 2028 at 12:05 P.M.','en',12],
    ['2028年1月1日 上午12:05','zh-Hant',0], ['2028年1月1日 下午12:05','zh-Hans',12],
    ['2028年1月1日 23：59','zh-Hant',23], ['2028年1月1日の午後12:05に送信されます','ja',12],
    ['2028년 1월 1일 오전 12:05','ko',0], ['2028년 1월 1일 23:59','ko',23],
  ];
  for (const [label,lang,hour] of examples) {
    const result=R.parseTimeLabel(label,{now,lang});
    assert.ok(result?.at,label);
    assert.equal(result.at.getFullYear(),2028,label);
    assert.equal(result.at.getHours(),hour,label);
    assert.equal(result.inferredYear,false,label);
  }
});
test('Chinese hour words handle midnight/noon without silently accepting a bare colon', () => {
  for (const [label,hour,minute] of [['1月1日 上午12點',0,0],['1月1日 下午12點',12,0],['1月1日 下午12點05分',12,5],['1月1日 上午12时05分',0,5]]) {
    const at=R.parseTimeLabel(label,{now}).at;
    assert.equal(at.getHours(),hour,label); assert.equal(at.getMinutes(),minute,label);
  }
  assert.equal(R.parseTimeLabel('1月1日 上午12:',{now}),null);
});
test('invalid dates, meridiem ranges, seconds and overflowing minutes never become guessed time', () => {
  for (const label of ['Jan 1 at 0:05 AM','Jan 1 at 13:05 PM','Jan 1 at 24:00','Jan 1 at 23:60','Feb 30 at 09:00','1月1日 上午13:05','1月1日 下午0:05','1月1日 23:60','1月1日 9:00:30','1월 1일 오전 13:05']) assert.equal(R.parseTimeLabel(label,{now})?.at,null,label);
});
test('same-day past hour does not roll a year; explicit prior years remain explicit', () => {
  assert.equal(R.parseTimeLabel('Dec 31 at 09:00',{now}).at.getFullYear(),2026);
  assert.equal(R.parseTimeLabel('Dec 31, 2025 at 09:00',{now}).at.getFullYear(),2025);
  const reference = new Date(2027,11,31,23,59);
  assert.equal(R.parseTimeLabel('Jan 1 at 00:05',{now,reference}).at.getFullYear(),2028);
});
test('owner structure resolves nearest modal and ignores hidden or visible background articles/time', () => {
  const doc=getDoc();
  const background=doc.querySelector('div[aria-hidden=true]');
  background.removeAttribute('aria-hidden'); // scope must exclude even a transition-visible background
  background.querySelector('[data-testid=tweetText]').textContent='Will send on Jan 1, 2027 at 9:00 AM';
  const tab=doc.createElement('div');tab.setAttribute('role','tab');tab.setAttribute('aria-selected','true');tab.textContent='Scheduled';background.append(tab);
  const result=snap(doc);
  assert.equal(result.items.length,1);
  assert.equal(result.cell,0);
  assert.equal(result.scopeElement.getAttribute('aria-modal'),'true');
  assert.equal(result.timeFail,0);
  assert.equal(result.items[0].preview,'甲乙');
});
test('body/column fallback cannot read article text through its enclosing cell/aggregate', () => {
  const {document}=parseHTML('<html><body><div data-testid="primaryColumn"><div data-testid="cellInnerDiv"><article role="article"><time datetime="2027-01-01T09:00:00">Jan 1</time><div data-testid="tweetText">Will send on Jan 1, 2027 at 9:00 AM quoted background post</div></article></div></div></body></html>');
  const result=snap(document);
  assert.equal(result.items.length,0); assert.equal(result.l1,0); assert.equal(result.l2,0); assert.equal(result.l3,0);
});
test('unknown owner row time stays counted and visibly unparsed, with masked sample and no body', () => {
  const doc=getDoc();
  const row=[...doc.querySelectorAll('button')].find(el=>el.querySelector('[data-testid=tweetText]'));
  const label=[...row.querySelectorAll('span')].find(el=>!el.closest('[data-testid=tweetText]'));
  label.textContent='Will send on 2027-01-01 23:59 UTC';
  row.querySelector('[data-testid=tweetText]').textContent='private 987654321 @May https://May.example';
  const result=snap(doc);
  assert.equal(result.items.length,1);
  assert.equal(result.timeFail,1);
  assert.equal(result.items[0].unparsed,true);
  assert.equal(R.formatTime(result.items[0].at),'時間未解析');
  assert.equal(result.samples.length,1);
  const diag=decodeURIComponent(R.buildDiagnostic(result));
  assert.ok(diag.includes('samples=Will send on 2027-01-01 23:59'));
  for(const leak of ['private','987654321','@May','https','example']) assert.ok(!diag.includes(leak),leak);
});
test('privacy mask preserves calendar words only as whole tokens and erases identities containing calendar words', () => {
  assert.match(R.maskSample('Mayday 9:00 @May2026 May@January.example https://May.example/2026'),/^xxxxxx 9:00 x+ x+ x+$/);
  for(const text of ['@May2026','May@January.example','https://May.example/2026','www.May.example/2026']) assert.match(R.maskSample(text),/^x+$/);
  assert.equal(R.maskSample('privatebody Oct 10 at 9:00'),'xxxxxxxxxxx Oct 10 at 9:00');
  assert.equal(Array.from(R.maskSample('January '.repeat(30))).length,60);
  assert.equal(R.maskSample('星期四 上午12:05'),'星期四 上午12:05');
  assert.equal(R.timeSample('private 987654321 on 2026-01-01 9:00'),'');
  assert.equal(R.timeSample('Will send on private purchase 987654321 at 23:59'),'');
});
test('skeleton exports only isolated short time span; calendar-looking body and arbitrary prose remain lengths', () => {
  const doc=getDoc();
  const body=doc.querySelector('[data-testid=tweetText] span');
  body.textContent='Will send on Dec 31, 2026 at 9:00 AM @May 987654321';
  const free=doc.createElement('p');free.textContent='Will send on Jan 1, 2027 at 9:00 AM';doc.body.append(free);
  const out=decodeURIComponent(S.buildSkeleton(doc,{pathname:scheduled}));
  assert.ok(out.includes('calendar=將於 2026年11月3日 週二 下午11:19 發送'));
  assert.ok(!out.includes('Dec') && !out.includes('Jan') && !out.includes('987654321') && !out.includes('@May'));
});
test('reconstructed owner fixture contains no address, account, real id or copied prose', () => {
  assert.equal(scanFixture(html),true);
  const doc=getDoc();
  assert.equal(doc.querySelectorAll('[id],[href],[src],[aria-label]').length,0);
  assert.equal(doc.querySelectorAll('[role=dialog]').length,2);
  assert.equal(doc.querySelectorAll('[aria-modal=true] button').length,5);
});

test('date extraction cannot launder calendar-shaped URL, email or handle identities', () => {
  for (const label of [
    'https://evil.example/將於2026年10月10日上午9:00傳送',
    '//evil.example/2026年7月20日の午後4:24に送信されます',
    'ftp://evil.example/2026년7월20일오후4:24전송됩니다',
    '將於2026年10月10日上午9:00傳送@January.example',
    '@將於2026年10月10日上午9:00傳送',
    '"May 10, 2026 at 9:00 AM"@January.example',
  ]) {
    assert.equal(R.timeSample(label), '', label);
    assert.match(R.maskSample(label), /^x+$/, label);
    const doc = getDoc();
    const row = [...doc.querySelectorAll('button')].find(el => el.querySelector('[data-testid=tweetText]'));
    const time = [...row.querySelectorAll('span')].find(el => !el.closest('[data-testid=tweetText]'));
    time.textContent = label;
    const report = snap(doc);
    assert.equal(report.items.length, 1);
    assert.equal(report.timeFail, 1);
    assert.equal(report.fmt, '');
    assert.deepEqual(report.samples, []);
    assert.ok(!S.buildSkeleton(doc, { pathname: scheduled }).includes('calendar='));
    const diagnostic = decodeURIComponent(R.buildDiagnostic(report));
    for (const leak of ['2026', '7月', '9:00', 'January', 'evil.example']) assert.ok(!diagnostic.includes(leak), diagnostic);
  }
});

test('legacy cell and text fallback never export calendar-looking tweetText as fmt or samples', () => {
  for (const wrap of ['', '<div data-testid="cellInnerDiv">']) {
    const {document} = parseHTML('<html><body><section role="dialog">' + wrap + '<div data-testid="tweetText"><span>Will send on Oct 10, 2026 at 9:00 AM private 987654321</span></div>' + (wrap ? '</div>' : '') + '</section></body></html>');
    const report = snap(document);
    assert.equal(report.fmt, '');
    assert.deepEqual(report.samples, []);
    const diag = R.buildDiagnostic(report);
    for (const leak of ['Oct', '2026', '9:00', '987654321', 'private']) assert.ok(!diag.includes(leak), diag);
    assert.ok(!S.buildSkeleton(document, { pathname: scheduled }).includes('calendar='));
  }
});

test('fmt is directly readable on its own line, bounded and without content/control characters', () => {
  const report = snap(getDoc());
  assert.match(R.buildDiagnostic(report), /\nfmt=將於 2026年11月3日 週二 下午11:19 發送$/);
  const diag = R.buildDiagnostic({fmt: 'Oct 10, 2026 at 9:00 AM\nprivate @May2026 https://May.example/2026'});
  assert.equal(diag.split('\n').length, 3);
  const fmt = diag.split('\n')[2];
  assert.ok(Array.from(fmt.slice(4)).length <= 60);
  for (const leak of ['private', '@May2026', 'https', 'example']) assert.ok(!fmt.includes(leak), fmt);
});
