#!/usr/bin/env node
// xsched gate 0 — the guard: prove the probe never phones home and never asks for power.
//
// It (1) scans every file under probe/ for banned network / DOM-injection / eval APIs and
// (2) checks probe/manifest.json for a minimal, honest permission surface. This script may
// only ever get *stricter*; loosening a rule here is a hard-rule violation.
//
// `npm run verify` → exit 0 when clean, exit 1 (with reasons) otherwise.
// A self-test proves the scanner actually catches a violation on a synthetic probe.

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = join(ROOT, "probe");

// Things the probe must never contain. (Whole probe/ tree, any file type.)
const BANNED = [
  { name: "fetch(", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /XMLHttpRequest/ },
  { name: "WebSocket", re: /\bWebSocket\b/ },
  { name: "sendBeacon", re: /sendBeacon/ },
  { name: "EventSource", re: /\bEventSource\b/ },
  { name: "innerHTML", re: /innerHTML/ },
  { name: "outerHTML=", re: /outerHTML\s*=/ },
  { name: "insertAdjacentHTML", re: /insertAdjacentHTML/ },
  { name: "document.write", re: /document\s*\.\s*write/ },
  { name: "eval(", re: /\beval\s*\(/ },
  { name: "new Function", re: /new\s+Function/ },
  { name: "importScripts", re: /importScripts/ },
  { name: "chrome.debugger", re: /chrome\s*\.\s*debugger/ },
  { name: "webRequest", re: /webRequest/ },
];

// content_scripts may only touch X itself over https.
const ALLOWED_MATCHES = new Set([
  "https://x.com/*",
  "https://twitter.com/*",
  "https://www.x.com/*",
  "https://www.twitter.com/*",
]);

function listFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(full);
  }
  return out;
}

export function scanSource(text, label) {
  const errors = [];
  for (const rule of BANNED) {
    if (rule.re.test(text)) errors.push(`${label}: contains banned API "${rule.name}"`);
  }
  return errors;
}

export function checkManifest(manifest, label = "probe/manifest.json") {
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push(`${label}: manifest_version must be 3`);

  if (Array.isArray(manifest.permissions) && manifest.permissions.length > 0) {
    errors.push(`${label}: permissions must be empty/absent, found ${JSON.stringify(manifest.permissions)}`);
  }
  if (manifest.permissions !== undefined && !Array.isArray(manifest.permissions)) {
    errors.push(`${label}: permissions must be an array when present`);
  }
  for (const key of ["host_permissions", "optional_host_permissions", "optional_permissions", "web_accessible_resources", "externally_connectable", "sandbox", "declarative_net_request"]) {
    if (manifest[key] !== undefined) errors.push(`${label}: "${key}" is not allowed`);
  }
  if (manifest.content_security_policy !== undefined) {
    errors.push(`${label}: content_security_policy override is not allowed`);
  }

  const entries = manifest.content_scripts;
  if (!Array.isArray(entries) || entries.length === 0) {
    errors.push(`${label}: content_scripts must be a non-empty array`);
  } else {
    for (const entry of entries) {
      if (entry.world && entry.world !== "ISOLATED") {
        errors.push(`${label}: content_scripts world must be ISOLATED (found ${entry.world})`);
      }
      const matches = entry.matches || [];
      if (matches.length === 0) errors.push(`${label}: content_scripts.matches must not be empty`);
      for (const pattern of matches) {
        if (!ALLOWED_MATCHES.has(pattern)) {
          errors.push(`${label}: content_scripts.matches "${pattern}" is not x.com/twitter.com`);
        }
      }
    }
  }
  return errors;
}

// Check a whole probe directory (default: the real one).
export function checkProbeDir(dir) {
  const errors = [];
  const files = listFiles(dir);
  let scanned = 0;
  for (const file of files) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    scanned += 1;
    errors.push(...scanSource(text, rel));
    if (file.endsWith("manifest.json") || /[\\/]manifest\.json$/.test(file)) {
      let manifest;
      try {
        manifest = JSON.parse(text);
      } catch (err) {
        errors.push(`${rel}: not valid JSON (${err.message})`);
        continue;
      }
      errors.push(...checkManifest(manifest, rel));
    }
  }
  return { errors, scanned };
}

function selfTest() {
  // Prove the scanner fails closed: a synthetic probe with a network call AND a bad
  // manifest must produce errors, while a clean synthetic probe must not.
  const dir = mkdtempSync(join(tmpdir(), "xsched-verify-selftest-"));
  try {
    const bad = join(dir, "bad");
    mkdirSync(bad);
    writeFileSync(join(bad, "evil.js"), "const r = fetch('https://evil.example/x');\n");
    writeFileSync(join(bad, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      permissions: ["tabs"],
      host_permissions: ["<all_urls>"],
      content_scripts: [{ matches: ["<all_urls>"], js: ["evil.js"] }],
    }));
    const badResult = checkProbeDir(bad);
    if (badResult.errors.length === 0) {
      throw new Error("self-test: scanner did NOT flag a probe that calls fetch() with host_permissions");
    }
    const joined = badResult.errors.join("\n");
    if (!joined.includes("fetch(")) throw new Error("self-test: did not flag fetch(");
    if (!joined.includes("host_permissions")) throw new Error("self-test: did not flag host_permissions");
    if (!joined.includes("permissions")) throw new Error("self-test: did not flag permissions");

    const good = join(dir, "good");
    mkdirSync(good);
    writeFileSync(join(good, "ok.js"), "const el = document.createElement('div'); el.textContent = 'ok';\n");
    writeFileSync(join(good, "manifest.json"), JSON.stringify({
      manifest_version: 3,
      content_scripts: [{ matches: ["https://x.com/*"], js: ["ok.js"] }],
    }));
    const goodResult = checkProbeDir(good);
    if (goodResult.errors.length !== 0) {
      throw new Error(`self-test: scanner flagged a clean probe: ${goodResult.errors.join("; ")}`);
    }
    return true;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const problems = [];
  try {
    selfTest();
  } catch (err) {
    problems.push(`SELF-TEST FAILED: ${err.message}`);
  }

  const { errors, scanned } = checkProbeDir(PROBE);
  problems.push(...errors);

  if (problems.length) {
    console.error("verify: FAILED");
    for (const problem of problems) console.error("  ✖ " + problem);
    process.exit(1);
  }
  console.log(`verify: OK — ${scanned} files under probe/ scanned; no banned APIs, minimal permissions.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
