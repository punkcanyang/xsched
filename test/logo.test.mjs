import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { checkIconMap, checkLogoDir, checkLogoSvg, checkManifest, checkPng } from "../scripts/verify.mjs";

const manifest = JSON.parse(readFileSync(new URL("../probe/manifest.json", import.meta.url), "utf8"));
const icon16 = readFileSync(new URL("../probe/icons/icon16.png", import.meta.url));

test("all four real icons and geometric SVGs pass; manifest adds no action or permissions", () => {
  assert.deepEqual(Object.keys(manifest.icons).sort(), ["128", "16", "32", "48"]);
  assert.deepEqual(checkManifest(manifest), []);
  for (const key of ["action", "permissions", "host_permissions", "optional_permissions", "web_accessible_resources"]) assert.equal(Object.hasOwn(manifest, key), false, key);
  assert.deepEqual(checkLogoDir(), { errors: [], scanned: 4 });
});

test("icon map requires allowed size keys and safe local PNG paths", () => {
  for (const icons of [null, [], "icons/icon16.png", {}, { 64: "icons/icon16.png" }, { 16: null }]) assert.ok(checkIconMap(icons).length);
  for (const path of ["../icon16.png", "icons/../icon16.png", "/icons/icon16.png", "//evil.example/icon16.png", "https://evil.example/icon16.png", "file:///tmp/icon.png", "data:image/png;base64,xxx", "icons\\icon16.png", "icons/%2e%2e/icon16.png", "icons/nested/icon16.png", "icons/icon16.png?x", "icons/icon16.svg"]) {
    assert.match(checkIconMap({ 16: path }).join("\n"), /icon path/, path);
  }
});

test("PNG validation rejects mismatched dimensions, forged headers, corruption, and missing files", () => {
  assert.deepEqual(checkPng(icon16, 16), []);
  assert.match(checkPng(icon16, 32).join("\n"), /dimensions 16x16 must be 32x32/);
  assert.ok(checkPng(Buffer.from("not a PNG"), 16).length);
  assert.ok(checkPng(icon16.subarray(0, 33), 16).length, "a valid signature/IHDR alone must fail");
  const corrupted = Buffer.from(icon16);
  corrupted[40] ^= 1;
  assert.match(checkPng(corrupted, 16).join("\n"), /CRC/);
  assert.ok(checkPng(Buffer.concat([icon16, Buffer.from("trailing content")]), 16).length);
  assert.match(checkIconMap({ 16: "icons/missing.png" }).join("\n"), /missing/);
  const dir = mkdtempSync(join(tmpdir(), "xsched-icon-link-"));
  try {
    mkdirSync(join(dir, "icons"));
    writeFileSync(join(dir, "outside.png"), icon16);
    symlinkSync(join(dir, "outside.png"), join(dir, "icons", "icon16.png"));
    assert.match(checkIconMap({ 16: "icons/icon16.png" }, "icons", dir).join("\n"), /unsafe/);
    rmSync(join(dir, "icons"), { recursive: true });
    mkdirSync(join(dir, "outside"));
    writeFileSync(join(dir, "outside", "icon16.png"), icon16);
    symlinkSync(join(dir, "outside"), join(dir, "icons"));
    assert.match(checkIconMap({ 16: "icons/icon16.png" }, "icons", dir).join("\n"), /unsafe/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("optional action allows only a validated default_icon object; other restrictions stay enforced", () => {
  const allowed = { ...manifest, action: { default_icon: manifest.icons } };
  assert.deepEqual(checkManifest(allowed), []);
  for (const action of [null, [], {}, "icons/icon16.png", { default_icon: "icons/icon16.png" }, { default_icon: { 32: "icons/icon16.png" } }, { default_icon: manifest.icons, default_popup: "popup.html" }, { default_icon: manifest.icons, default_title: "extra" }]) {
    assert.ok(checkManifest({ ...manifest, action }).length, JSON.stringify(action));
  }
  for (const extra of [{ permissions: [] }, { optional_permissions: [] }, { host_permissions: [] }, { web_accessible_resources: [] }, { background: {} }]) assert.ok(checkManifest({ ...allowed, ...extra }).length);
});

test("unsafe SVG scripts, events, HTML, references, CSS escapes, and entities fail", () => {
  const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  for (const source of [
    svg("<script>alert(1)</script>"), svg('<path onload="alert(1)"/>'), svg('<rect oNclick="alert(1)"/>'), svg("<foreignObject/>"),
    svg('<path href="https://evil.example/a.svg"/>'), svg('<path href="//evil.example/a.svg"/>'),
    svg('<path href="&#104;ttps://evil.example/a.svg"/>'), svg('<path xlink:href="data:image/svg+xml,xxx"/>'),
    svg('<path fill="url(https://evil.example/a.svg)"/>'), svg('<path style="fill:url(https://evil.example/a.svg)"/>'),
    svg('<path fill="u\\72l(\\68ttps\\3a//evil.example/a.svg)"/>'), svg("<style>@import 'https://evil.example/a.css';</style>"),
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "https://evil.example/">]>' + svg(""),
    '<?xml-stylesheet href="https://evil.example/a.css"?>' + svg(""),
  ]) assert.ok(checkLogoSvg(source).length, source);
  assert.deepEqual(checkLogoSvg(svg('<defs><clipPath id="local"><rect width="1" height="1"/></clipPath></defs><g clip-path="url(#local)"><path d="M0 0"/></g>')), []);
});

test("verify CLI actually exits 1 for bad paths, external URLs, and mismatched icon dimensions", () => {
  const dir = mkdtempSync(join(tmpdir(), "xsched-icon-cli-"));
  try {
    mkdirSync(join(dir, "icons"));
    writeFileSync(join(dir, "icons", "icon16.png"), icon16);
    writeFileSync(join(dir, "ok.js"), "const safe = 1;");
    const clean = { manifest_version: 3, content_scripts: [{ matches: ["https://x.com/*"], js: ["ok.js"] }] };
    for (const [icons, expected] of [[{ 16: "icons/../icon16.png" }, /icon path/], [{ 16: "https://evil.example/icon16.png" }, /icon path/], [{ 32: "icons/icon16.png" }, /dimensions/]]) {
      writeFileSync(join(dir, "manifest.json"), JSON.stringify({ ...clean, icons }));
      const result = spawnSync(process.execPath, ["scripts/verify.mjs", dir], { timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
      assert.equal(result.status, 1);
      assert.match(result.stderr.toString(), expected);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
