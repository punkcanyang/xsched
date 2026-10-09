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
  assert.ok(out.includes('calendar=將於2026年10月10日 上午9:00傳送'));
  assert.ok(!out.includes('Dec') && !out.includes('Jan') && !out.includes('987654321') && !out.includes('@May'));
});
test('reconstructed owner fixture contains no address, account, real id or copied prose', () => {
  assert.equal(scanFixture(html),true);
  const doc=getDoc();
  assert.equal(doc.querySelectorAll('[id],[href],[src],[aria-label]').length,0);
  assert.equal(doc.querySelectorAll('[role=dialog]').length,2);
  assert.equal(doc.querySelectorAll('[aria-modal=true] button').length,5);
});
