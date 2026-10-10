// xsched gate 0.2 — page-skeleton builder (pure, read-only).
//
// Turns the live DOM into a compact, content-free structural map so the owner can paste
// it back and we can repair the readers. It never keeps body text, attribute prose,
// URLs, account handles, or hashes. Text becomes a length, except an isolated short
// time span may add the reader's calendar-only masked sample. Prose values become
// "x"; known UI enums (role, data-testid, aria-*, dir, type, tabindex…) survive.
//
// Classic script, shared two ways (same trick as reader.js):
//   - Chrome: loaded as a content script in the isolated world before content.js.
//   - Node:   test/skeleton.test.mjs does `await import("../probe/skeleton.js")`.
// Only `globalThis.XSCHED_SKELETON` is exported.
(() => {
"use strict";

const SKELETON_VERSION = "0.1.0";
const MAX_NODES = 6000;
const MAX_DEPTH = 60;

// Attribute values safe to keep when they are short enumerated tokens.
const VALUE_KEEP = new Set([
  "role", "data-testid", "aria-selected", "aria-hidden", "aria-expanded", "aria-checked",
  "aria-current", "aria-modal", "aria-live", "dir", "type", "tabindex", "data-focusable",
]);
// Only fixed UI enums are values. An arbitrary short token can be an account name.
const ENUMS = {
  role: "alert alertdialog application article banner button cell checkbox columnheader combobox complementary contentinfo definition dialog document feed figure form generic grid gridcell group heading img link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio navigation none note option presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status switch tab table tablist tabpanel term textbox timer toolbar tooltip tree treegrid treeitem",
  "data-testid": "cellInnerDiv tweetText primaryColumn tweetTextarea_0 scheduledDateField scheduledTimeField scheduleConfirm scheduleOption scheduleChip",
  "aria-selected": "true false", "aria-hidden": "true false", "aria-expanded": "true false",
  "aria-checked": "true false mixed", "aria-current": "true false page step location date time",
  "aria-modal": "true false", "aria-live": "off polite assertive", dir: "ltr rtl auto",
  type: "button submit reset checkbox radio text password email number search tel url hidden file image range date datetime-local month week time color",
  tabindex: "-1 0", "data-focusable": "true false",
};
const KNOWN_ENUMS = new Set(Object.values(ENUMS).join(" ").split(" "));

const HOST_ID = "xsched-probe-root";

function codePoints(value) {
  return Array.from(String(value == null ? "" : value)).length;
}

function looksLikeUuid(text) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}

function looksLikeHash(text) {
  if (/^[0-9a-f]{16,}$/i.test(text)) return true;
  if (/^[A-Za-z0-9+/=_-]{20,}$/.test(text)) return true;
  return false;
}

function digitMajority(text) {
  let digits = 0;
  let others = 0;
  for (const ch of text) {
    if (/[0-9]/.test(ch)) digits += 1;
    else others += 1;
  }
  return digits > others;
}

// Keep only short, plain, non-identifying enumerated values; otherwise "x".
function enumValue(value, name) {
  const text = String(value == null ? "" : value);
  if (!text) return "x";
  if (codePoints(text) > 32) return "x";
  if (!/^[A-Za-z0-9_:-]+$/.test(text)) return "x";
  if (looksLikeUuid(text) || looksLikeHash(text)) return "x";
  if (text.length >= 4 && digitMajority(text)) return "x";
  const allowed = name ? new Set((ENUMS[name] || "").split(" ")) : KNOWN_ENUMS;
  return allowed.has(text) ? text : "x";
}

function classToken(token) {
  if (/^r-[0-9a-z]{4,}$/i.test(token)) return "h";
  if (/^css-[0-9a-z]+$/i.test(token)) return "h";
  const segments = token.split(/[_-]/).filter(Boolean);
  if (segments.some((part) => /^[0-9a-f]{5,}$/i.test(part))) return "h";
  if (segments.some((part) => part.length >= 6 && /[0-9]/.test(part) && /[a-z]/i.test(part))) return "h";
  const prefix = token.split(/[_-]/)[0] || token;
  // X's known class namespaces are r/css. Other prefixes may be usernames;
  // never echo arbitrary readable words merely because they are short.
  return prefix === "r" || prefix === "css" ? prefix : "x";
}

// class=[a,css,h] — up to three tokens, each reduced to a prefix or "h" for a hash.
function classValue(raw) {
  const tokens = String(raw == null ? "" : raw).split(/\s+/).filter(Boolean).slice(0, 3);
  if (!tokens.length) return "";
  return `[${tokens.map(classToken).join(",")}]`;
}

function attrToken(el, name) {
  if (name === "class") {
    const rendered = classValue(el.getAttribute("class"));
    return rendered ? `class=${rendered}` : "class=x";
  }
  const raw = el.getAttribute(name);
  if (raw === null || raw === "") return name;
  if (!VALUE_KEEP.has(name)) return `${name}=x`;
  return `${name}=${enumValue(raw, name)}`;
}

function tagOf(node) {
  return String(node.tagName || node.nodeName || "").toLowerCase();
}

function isHost(node) {
  return node.id === HOST_ID || (node.nodeType === 1 && node.hasAttribute && node.getAttribute("data-xsched-host") === "1");
}

function hostnameOf(value) {
  try {
    const address = URL.parse(String(value == null ? "" : value), "https://x.com");
    return address && /^(https?:)$/.test(address.protocol) ? address.hostname : "x";
  } catch { return "x"; }
}

function pathKind(pathname) {
  return /^\/compose\/(?:post|tweet)\/unsent\/scheduled(?:\/|$)/.test(pathname || "") ? "scheduled" : "other";
}

// Build the skeleton string. Root defaults to document.body (fallback documentElement).
function buildSkeleton(target, options = {}) {
  const doc = options.document || (target && target.ownerDocument) || target;
  const body = options.root || (doc && (doc.body || doc.documentElement)) || null;
  const header = "xsched-skeleton v" + SKELETON_VERSION + " path=" + pathKind(options.pathname) + " nodes=";
  if (!body) return header + "0";
  let visited = 0;
  let maxDepthSeen = 0;
  let truncated = false;
  let exhausted = false;
  const signatures = new Map();
  // Bound traversal before signatures; keep sanitized values and text lengths in
  // keys, so folding cannot silently lose a different enum or text length.
  function entry(line, depth, children = []) {
    const signature = JSON.stringify([line, children.map((child) => child.key)]);
    if (!signatures.has(signature)) signatures.set(signature, signatures.size);
    return { line, depth, children, key: signatures.get(signature) };
  }
  function reserve(depth) {
    if (exhausted) return false;
    if (visited >= MAX_NODES) { truncated = true; exhausted = true; return false; }
    if (depth > MAX_DEPTH) { truncated = true; return false; }
    visited += 1;
    maxDepthSeen = Math.max(maxDepthSeen, depth);
    return true;
  }
  function collectChildren(parent, depth) {
    const children = [];
    // Avoid allocating an unbounded whole-list array before checking the budget.
    for (let child = parent.firstChild; child && !exhausted; child = child.nextSibling) {
      const item = collect(child, depth);
      if (item) children.push(item);
    }
    return children;
  }
  function collect(node, depth) {
    if (!node || isHost(node)) return null;
    if (node.nodeType === 3) {
      const text = node.nodeValue || "";
      if (!/\S/.test(text) || !reserve(depth)) return null;
      const reader = globalThis.XSCHED_READER;
      const parent = node.parentElement;
      const sample = reader && parent && !parent.closest('select, option') && reader.isIsolatedTimeElement(parent) ? reader.timeSample(text) : "";
      return entry("#text(" + codePoints(text) + ")" + (sample ? " calendar=" + encodeURIComponent(sample) : ""), depth);
    }
    if (node.nodeType !== 1 || !reserve(depth)) return null;
    const tag = tagOf(node);
    // Record every attribute name; values still pass the conservative allowlist.
    const attrs = [...node.attributes].map((attr) => attrToken(node, attr.name)).sort();
    const line = tag + " c=" + node.childNodes.length + (attrs.length ? " " + attrs.join(" ") : "");
    const children = [];
    if (tag === "iframe") {
      let inner = null;
      try { inner = node.contentDocument || (node.contentWindow && node.contentWindow.document); } catch { /* cross origin */ }
      if (reserve(depth + 1)) {
        const innerRoot = inner && (inner.body || inner.documentElement);
        children.push(entry(innerRoot ? "#iframe-doc" : "#iframe origin=" + hostnameOf(node.getAttribute("src")),
          depth + 1, innerRoot ? collectChildren(innerRoot, depth + 2) : []));
      }
    } else if (tag !== "script" && tag !== "style") {
      if (node.shadowRoot && reserve(depth + 1)) {
        children.push(entry("#shadow", depth + 1, collectChildren(node.shadowRoot, depth + 2)));
      }
      children.push(...collectChildren(node, depth + 1));
    }
    return entry(line, depth, children);
  }
  const tree = collectChildren(body, 0);
  const lines = [];
  function emit(children) {
    for (let index = 0; index < children.length;) {
      const item = children[index];
      let group = 1;
      while (index + group < children.length && children[index + group].key === item.key) group += 1;
      lines.push("  ".repeat(item.depth) + item.line + (group > 1 ? " ×" + group : ""));
      emit(item.children);
      index += group;
    }
  }
  emit(tree);
  const trailer = truncated ? "\nTRUNCATED nodes=" + visited + " depth=" + maxDepthSeen : "";
  return header + lines.length + "\n" + lines.join("\n") + trailer;
}

globalThis.XSCHED_SKELETON = {
  SKELETON_VERSION,
  buildSkeleton,
  classToken,
  enumValue,
  hostnameOf,
  pathKind,
};
})();
