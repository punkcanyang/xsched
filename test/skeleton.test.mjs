// Unit tests for probe/skeleton.js (the pure, content-free page-structure mapper).
//
// Same classic-script trick as reader.js: the node test dynamically imports the file and
// reads globalThis.XSCHED_SKELETON. linkedom gives us attributes, shadow roots (via
// attachShadow), and settable iframe.contentDocument for the same-origin case.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseHTML } from "linkedom";

await import("../probe/skeleton.js");
const S = globalThis.XSCHED_SKELETON;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEDULED = "/compose/post/unsent/scheduled";

function doc(html) {
  return parseHTML(html).document;
}

function build(document, pathname = SCHEDULED) {
  return S.buildSkeleton(document, { pathname });
}

test("header names the version and only says whether the path is scheduled", () => {
  const out = build(doc("<html><body><div></div></body></html>"));
  assert.match(out.split("\n")[0], /^xsched-skeleton v0\.1\.0 path=scheduled nodes=\d+$/);
  const other = build(doc("<html><body></body></html>"), "/home");
  assert.match(other.split("\n")[0], /^xsched-skeleton v0\.1\.0 path=other nodes=\d+$/);
  assert.ok(!out.includes("/compose"), "must not echo the URL/path");
});

test("enum values survive; prose, ids, hashes, uuids become x", () => {
  assert.equal(S.enumValue("button"), "button");
  assert.equal(S.enumValue("cellInnerDiv"), "cellInnerDiv");
  assert.equal(S.enumValue("true"), "true");
  assert.equal(S.enumValue("-1"), "-1");
  assert.equal(S.enumValue(""), "x");
  assert.equal(S.enumValue("x".repeat(40)), "x");
  assert.equal(S.enumValue("550e8400-e29b-41d4-a716-446655440000"), "x");
  assert.equal(S.enumValue("deadbeefdeadbeef"), "x");
  assert.equal(S.enumValue("1234567890123456"), "x");
  assert.equal(S.enumValue("has spaces"), "x");
});

test("attribute values: allow-listed short enums kept, everything else x", () => {
  const document = doc(
    `<html><body><div role="button" data-testid="cellInnerDiv" aria-selected="true" tabindex="0"` +
      ` aria-label="Will send on Oct 10, 2026 at 9:00 AM secret body" title="private title"` +
      ` href="https://evil.example/a?b=c" id="550e8400-e29b-41d4-a716-446655440000"` +
      ` data-renderkey="deadbeefdeadbeef" class="r-1abcde css-175oi2r keep-me">Hello world</div></body></html>`,
  );
  const out = build(document);
  assert.ok(out.includes("role=button"), out);
  assert.ok(out.includes("data-testid=cellInnerDiv"), out);
  assert.ok(out.includes("aria-selected=true"), out);
  assert.ok(out.includes("aria-label=x"), out);
  assert.ok(out.includes("title=x"), out);
  assert.ok(out.includes("href=x"), out);
  assert.ok(out.includes("id=x"), out);
  assert.ok(out.includes("data-renderkey=x"), out);
  assert.ok(out.includes("class=[h,h,x]"), out);
  assert.ok(out.includes("#text(11)"), out);
  for (const leak of ["evil.example", "a?b=c", "550e8400", "deadbeef", "Hello", "Will send", "secret body", "private title", "keep-me"]) {
    assert.ok(!out.includes(leak), `skeleton leaked "${leak}":\n${out}`);
  }
});

test("class tokens keep only known X namespaces; readable usernames are masked", () => {
  assert.equal(S.classToken("r-1abcde"), "h");
  assert.equal(S.classToken("css-175oi2r"), "h");
  assert.equal(S.classToken("feed-item"), "x");
  // A long non-hash token clips to its 20-char prefix...
  assert.equal(S.classToken("z".repeat(40)), "x");
  // ...but a long pure-hex run is hash-like and collapses to "h".
  assert.equal(S.classToken("a".repeat(40)), "h");
  assert.equal(S.classToken("plain"), "x");
  assert.equal(S.classToken("decoy_handle-profile"), "x");
  assert.equal(S.classToken("使用者名稱"), "x");
  assert.equal(S.classToken("r"), "r");
});

test("consecutive identical siblings collapse to a single ×N line", () => {
  const out = build(doc("<html><body><div></div><div></div><div></div><span></span></body></html>"));
  // body's children are the top level, so they sit at depth 0 (no indent).
  assert.equal((out.match(/^div c=0/gm) || []).length, 1, out);
  assert.ok(out.includes("div c=0 ×3"), out);
  assert.ok(out.includes("span c=0"), out);
});

test("open shadow roots are walked and marked #shadow", () => {
  const document = doc("<html><body></body></html>");
  const el = document.createElement("div");
  const shadow = el.attachShadow({ mode: "open" });
  const span = document.createElement("span");
  span.textContent = "hi";
  shadow.append(span);
  shadow.append(document.createTextNode('shadow secret'));
  el.append(document.createTextNode('light secret'));
  document.body.append(el);
  const out = build(document);
  assert.ok(out.includes("#shadow"), out);
  assert.ok(out.includes("span c=1"), out);
  assert.ok(out.includes("#text(2)"), out);
  assert.ok(out.includes("#text(13)") && out.includes("#text(12)"), out);
  assert.ok(!out.includes('shadow secret') && !out.includes('light secret'), out);
  assert.ok(!out.includes("hi"), out);
});

test("same-origin iframe walks the inner document and marks #iframe-doc", () => {
  const document = doc(`<html><body><iframe src="/inner.html"></iframe></body></html>`);
  const frame = document.querySelector("iframe");
  Object.defineProperty(frame, "contentDocument", { value: doc("<html><body><p>inner secret</p></body></html>"), configurable: true });
  const out = build(document);
  assert.ok(out.includes("#iframe-doc"), out);
  assert.ok(out.includes("p c=1"), out);
  assert.ok(out.includes("#text(12)"), out);
  assert.ok(!out.includes("inner secret"), out);
});

test("cross-origin iframe records only the hostname, never path or query", () => {
  const document = doc(`<html><body><iframe src="https://evil.example/secret?token=abc123"></iframe></body></html>`);
  const out = build(document);
  assert.ok(out.includes("#iframe origin=evil.example"), out);
  for (const leak of ["secret", "token", "abc123", "evil.example/secret", "?"]) {
    assert.ok(!out.includes(leak), `skeleton leaked "${leak}":\n${out}`);
  }
});

test("iframe hostname excludes credentials/port and parses IPv6", () => {
  assert.equal(S.hostnameOf("https://privateuser:secret@evil.example:8080/private?q=token"), "evil.example");
  assert.equal(S.hostnameOf("https://[::1]:8080/path"), "[::1]");
  assert.equal(S.hostnameOf("javascript:secret"), "x");
});

test("arbitrary short account tokens never survive enum-valued attributes", () => {
  const out = build(doc('<html><body><div role="decoy_handle" data-testid="decoy_handle" aria-selected="decoy_handle" class="decoy_handle-profile"></div></body></html>'));
  assert.ok(!out.includes("decoy_handle"), out);
  assert.ok(out.includes("role=x"), out);
  assert.ok(out.includes("data-testid=x"), out);
  assert.equal(S.enumValue("button", "aria-hidden"), "x");
});

test("all attribute names survive, including attributes beyond the former cap", () => {
  const document = doc('<html><body><div></div></body></html>');
  for (let i = 0; i < 20; i += 1) document.querySelector('div').setAttribute('data-flag-' + i, 'private');
  const out = build(document);
  for (let i = 0; i < 20; i += 1) assert.ok(out.includes('data-flag-' + i + '=x'), out);
});

test("folding preserves text lengths, attribute values and separate iframe structures", () => {
  const document = doc('<html><body><p>a</p><p>longer</p><div role="button"></div><div role="dialog"></div><iframe></iframe><iframe></iframe></body></html>');
  const frames = document.querySelectorAll('iframe');
  Object.defineProperty(frames[0], 'contentDocument', { value: doc('<html><body><div></div></body></html>') });
  Object.defineProperty(frames[1], 'contentDocument', { value: doc('<html><body><span></span></body></html>') });
  const out = build(document);
  assert.ok(out.includes('#text(1)') && out.includes('#text(6)'), out);
  assert.ok(out.includes('role=button') && out.includes('role=dialog'), out);
  assert.equal((out.match(/#iframe-doc/g) || []).length, 2, out);
});

test("bounded signatures handle very deep and wide DOMs without walking beyond limits", () => {
  const document = doc('<html><body></body></html>');
  let parent = document.body;
  for (let i = 0; i < 12000; i += 1) { const el = document.createElement('div'); parent.append(el); parent = el; }
  assert.match(build(document), /TRUNCATED nodes=61 depth=60$/);
  document.body.replaceChildren();
  for (let i = 0; i < 6100; i += 1) document.body.append(document.createElement('div'));
  assert.match(build(document), /TRUNCATED nodes=6000 depth=0$/);
});

test("deep trees truncate and report TRUNCATED nodes/depth", () => {
  let html = "<html><body>";
  for (let i = 0; i < 80; i += 1) html += "<div>";
  for (let i = 0; i < 80; i += 1) html += "</div>";
  html += "</body></html>";
  const out = build(doc(html));
  assert.match(out, /TRUNCATED nodes=\d+ depth=60$/);
});

test("our own overlay host is excluded from the skeleton", () => {
  const document = doc(`<html><body><div id="xsched-probe-root">overlay secret</div><div id="real"></div></body></html>`);
  const out = build(document);
  assert.ok(!out.includes("overlay secret"), out);
  assert.ok(!/xsched-probe-root/.test(out), out);
  assert.ok(out.includes('id=x'), out);
});

test("fixtures yield content-free skeletons (no fixture text)", () => {
  for (const name of ["en.html", "zh-Hant.html", "zh-Hans.html", "ja.html", "ko.html", "selectors-broken.html"]) {
    const out = S.buildSkeleton(doc(readFileSync(join(ROOT, "fixtures", name), "utf8")), { pathname: SCHEDULED });
    for (const leak of ["Local fixture", "本機", "假草稿", "ローカル", "로컬", "Arrives", "placeholder", "http", "x.com"]) {
      assert.ok(!out.includes(leak), `${name}: skeleton leaked "${leak}":\n${out}`);
    }
  }
});
