// Unit tests for probe/reader.js (the pure read-only module).
//
// reader.js is a *classic* script shared with the content script via globalThis, and the
// node test loads the very same file with a dynamic import. jsdom is replaced by linkedom
// (lighter, no network). NOTE: linkedom does not run <script>, so fixtures that build their
// DOM with JS (virtual.html) are only exercised here through their static markup; the
// scroll behaviour itself is covered by scripts/e2e.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHTML } from "linkedom";

await import("../probe/reader.js");
const R = globalThis.XSCHED_READER;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEDULED = "/compose/post/unsent/scheduled";

function doc(html) {
  return parseHTML(html).document;
}
function fixture(name) {
  return doc(readFileSync(join(ROOT, "fixtures", name), "utf8"));
}
function snap(document, pathname = SCHEDULED) {
  return R.readSnapshot(document, { pathname });
}

// ── five languages, strict ─────────────────────────────────────────────────────
test("parseSchedule: five languages resolve to a local Date", () => {
  const cases = [
    ["Will send on Fri, Oct 10, 2026 at 9:00 AM Morning note", "en", "Fri, Oct 10, 2026 at 9:00 AM", "Morning note"],
    ["2026年7月20日(月)の午後4:24に送信されます 本文", "ja", "2026年7月20日(月)の午後4:24に送信されます", "本文"],
    ["將於2026年10月10日 上午9:00傳送 本機假草稿", "zh-Hant", "將於2026年10月10日 上午9:00傳送", "本機假草稿"],
    ["将于2026年10月10日 上午9:00发送 本地假草稿", "zh-Hans", "将于2026年10月10日 上午9:00发送", "本地假草稿"],
    ["2026년 10월 10일 오전 9:00에 전송됩니다 본문", "ko", "2026년 10월 10일 오전 9:00에 전송됩니다", "본문"],
  ];
  for (const [text, lang, time, body] of cases) {
    const parsed = R.parseSchedule(text);
    assert.ok(parsed, `no match: ${text}`);
    assert.equal(parsed.lang, lang, text);
    assert.equal(parsed.tier, "strict", text);
    assert.equal(parsed.time, time, text);
    assert.equal(parsed.body, body, text);
    assert.ok(parsed.at instanceof Date && !Number.isNaN(parsed.at.getTime()), text);
  }
});

test("parseSchedule: 12:00 AM / 12:30 PM roll correctly", () => {
  const midnight = R.parseSchedule("Will send on Oct 10, 2026 at 12:00 AM x");
  assert.equal(midnight.at.getHours(), 0);
  const noonish = R.parseSchedule("Will send on Oct 10, 2026 at 12:30 PM x");
  assert.equal(noonish.at.getHours(), 12);
  assert.equal(noonish.at.getMinutes(), 30);
});

test("parseSchedule: English date-format tolerance", () => {
  const variants = [
    "Will send on Fri, Oct 10, 2026 at 9:00 AM local",
    "Will send on October 10, 2026 at 9:00 AM local",
    "Will send on 10 Oct 2026 at 09:00 local",
    "Will send on Tue, 10 Nov 2026 at 08:05 PM local",
  ];
  for (const text of variants) {
    const parsed = R.parseSchedule(text);
    assert.ok(parsed && parsed.at, `unparsed: ${text}`);
  }
  const d = R.parseSchedule("Will send on Tue, 10 Nov 2026 at 08:05 PM local").at;
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getDate(), 10);
  assert.equal(d.getHours(), 20);
  assert.equal(d.getMinutes(), 5);
});

test("parseSchedule: impossible dates are found but NOT guessed (unparsed)", () => {
  const drift = R.parseSchedule("Will send on Feb 30, 2026 at 9:00 AM x");
  assert.ok(drift, "phrase should still be found");
  assert.equal(drift.at, null);
  assert.equal(drift.unparsed, true);
});

test("parseSchedule: no phrase at all returns null", () => {
  assert.equal(R.parseSchedule("Just landed, will post tomorrow."), null);
  assert.equal(R.parseSchedule(""), null);
  assert.equal(R.parseSchedule(null), null);
});

// ── small helpers ──────────────────────────────────────────────────────────────
test("previewText keeps 20 code points and never splits an emoji/CJK", () => {
  assert.equal(R.previewText("😀一二三四五六七八九十壹貳參肆伍陸柒捌玖拾"), "😀一二三四五六七八九十壹貳參肆伍陸柒捌玖");
  assert.equal(R.previewText("abc"), "abc");
  assert.equal(R.previewText(""), "");
  assert.equal(Array.from(R.previewText("x".repeat(50))).length, 20);
});

test("normalize flattens nbsp / full-width colon / zero-width chars", () => {
  assert.equal(R.normalize("a\u00a0b\u202fc\u200b\u200e：d"), "a b c:d");
});

test("isScheduledLabel accepts the localized tab labels, rejects others", () => {
  for (const label of ["Scheduled", "予約済み", "已排程", "已定时", "예약됨"]) {
    assert.equal(R.isScheduledLabel(label), true, label);
  }
  assert.equal(R.isScheduledLabel("Drafts"), false);
  assert.equal(R.isScheduledLabel("草稿"), false);
  assert.equal(R.isScheduledLabel("Scheduled " + "x".repeat(40)), false, "too long is not a tab label");
});

test("classifyPath recognizes scheduled / drafts / unsent / picker", () => {
  assert.equal(R.classifyPath("/compose/post/unsent/scheduled"), "scheduled");
  assert.equal(R.classifyPath("/compose/tweet/unsent/scheduled"), "scheduled");
  assert.equal(R.classifyPath("/compose/post/unsent/drafts"), "drafts");
  assert.equal(R.classifyPath("/compose/post/unsent"), "unsent");
  assert.equal(R.classifyPath("/compose/post/schedule"), "picker");
  assert.equal(R.classifyPath("/home"), "other");
});

// ── reading snapshots across fixtures ──────────────────────────────────────────
test("readSnapshot: each localized fixture yields 2 rows via the cell layer", () => {
  for (const name of ["en.html", "zh-Hant.html", "zh-Hans.html", "ja.html", "ko.html"]) {
    const report = snap(fixture(name));
    assert.equal(report.onScheduled, 1, name);
    assert.equal(report.items.length, 2, name);
    assert.equal(report.layer, "cell", name);
    assert.equal(report.l1, 2, name);
    assert.equal(report.timeFail, 0, name);
    assert.equal(report.empty, 0, name);
    assert.ok(report.items.every((item) => item.key && item.preview), name);
  }
});

test("readSnapshot: roles-only revision falls through to the a11y layer", () => {
  const report = snap(fixture("roles.html"));
  assert.equal(report.layer, "a11y");
  assert.equal(report.l1, 0);
  assert.equal(report.l2, 2);
  assert.equal(report.items.length, 2);
  assert.equal(report.items[0].time, "Fri, Oct 16, 2026 at 7:30 AM");
});

test("readSnapshot: text scan is the last resort when no roles carry the phrase", () => {
  const document = doc(
    `<div role="dialog"><div role="tab" aria-selected="true">Scheduled</div>` +
      `<p id="only">Will send on Oct 20, 2026 at 1:15 PM Text-only fallback row</p></div>`,
  );
  const report = snap(document);
  assert.equal(report.layer, "text");
  assert.equal(report.l1, 0);
  assert.equal(report.l2, 0);
  assert.equal(report.l3, 1);
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].preview, "Text-only fallback r");
});

test("readSnapshot: empty scheduled list reports empty=1 and 0 rows", () => {
  const report = snap(fixture("empty.html"));
  assert.equal(report.onScheduled, 1);
  assert.equal(report.items.length, 0);
  assert.equal(report.empty, 1);
  assert.equal(report.timeFail, 0);
});

test("readSnapshot: virtualized fixture flags virtualized + needsScroll (never auto-scrolls)", () => {
  const report = snap(fixture("virtual.html"));
  assert.equal(report.onScheduled, 1);
  assert.equal(report.virtualized, 1);
  assert.equal(report.needsScroll, 1);
});

test("readSnapshot: home timeline is never read as Scheduled (0 hits)", () => {
  const report = snap(fixture("home.html"), "/home");
  assert.equal(report.onScheduled, 0);
  assert.equal(report.items.length, 0);
  assert.equal(report.layer, "none");
});

test("readSnapshot: scheduled list is also detected on a non-scheduled path when the tab is selected", () => {
  const report = snap(fixture("en.html"), "/compose/post/unsent");
  assert.equal(report.onScheduled, 1);
  assert.equal(report.items.length, 2);
});

test("readSnapshot: the schedule picker path is never read", () => {
  const report = snap(fixture("en.html"), "/compose/post/schedule");
  assert.equal(report.onScheduled, 0);
});

// ── accumulation across snapshots ──────────────────────────────────────────────
test("mergeItems accumulates across a virtualized window swap and dedups", () => {
  const document = fixture("en.html");
  const first = snap(document);

  const cells = document.querySelectorAll('[data-testid="cellInnerDiv"]');
  // Simulate a virtualized swap: row 1 unmounts, a brand-new row mounts in its place.
  const replacement = document.createElement("div");
  replacement.setAttribute("data-testid", "cellInnerDiv");
  replacement.textContent = "Will send on Wed, Dec 2, 2026 at 6:45 PM Local fixture swapped row";
  cells[1].replaceWith(replacement);

  const second = snap(document);
  const merged = R.mergeItems(first.items, second.items);
  assert.equal(merged.length, 3, "two disjoint rows + the surviving row = 3");

  const again = R.mergeItems(merged, second.items);
  assert.equal(again.length, 3, "re-merging the same snapshot must not grow");

  const replaceMode = R.mergeItems(first.items, second.items, { replace: true });
  assert.equal(replaceMode.length, 2, "replace mode drops prior rows (non-virtual lists)");
});

// ── diagnostics must never leak content ────────────────────────────────────────
test("buildDiagnostic carries counters only, no tweet body / time / account / url", () => {
  const report = snap(fixture("en.html"));
  const diag = R.buildDiagnostic({ ...report, scrolled: 1 });
  assert.match(diag, /^xsched-gate0 v0\.0\.2 /);
  assert.match(diag, /onScheduled=1 /);
  assert.match(diag, /layer=1 /);

  const forbidden = [
    "Local fixture", "Will send", "@local_fixture", "9:00", "8:05", "Oct", "Nov",
    "http", "x.com", "2026",
  ];
  for (const fragment of forbidden) {
    assert.ok(!diag.includes(fragment), `diagnostic leaked "${fragment}": ${diag}`);
  }
});

test("buildDiagnostic never leaks any localized fixture text", () => {
  const fragments = [
    "本機", "假草稿", "本地", "ローカル", "下書き", "로컬", "픽스처",
    "將於", "将于", "送信されます", "전송됩니다", "上午", "下午", "오전", "오후",
  ];
  for (const name of ["en.html", "zh-Hant.html", "zh-Hans.html", "ja.html", "ko.html"]) {
    const report = snap(fixture(name));
    const diag = R.buildDiagnostic(report);
    for (const fragment of fragments) {
      assert.ok(!diag.includes(fragment), `diagnostic leaked "${fragment}" for ${name}: ${diag}`);
    }
  }
});
