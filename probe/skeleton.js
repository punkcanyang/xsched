// xsched gate 0.1 — page-skeleton builder (pure, read-only).
//
// Turns the live DOM into a compact, content-free structural map so the owner can paste
// it back and we can repair the readers. It NEVER keeps text, attribute prose, URLs,
// account handles, or hashes: text becomes a length, prose values become "x", and
// short enumerated values (role, data-testid, aria-*, dir, type, tabindex…) survive.
//
// Classic script, shared two ways (same trick as reader.js):
//   - Chrome: loaded as a content script in the isolated world before content.js.
//   - Node:   test/skeleton.test.mjs does `await import("../probe/skeleton.js")`.
// Only `globalThis.XSCHED_SKELETON` is exported.
(() => {
"use strict";

const SKELETON_VERSION = "0.0.2";
const MAX_NODES = 6000;
const MAX_DEPTH = 60;
const MAX_LINE_ATTRS = 12;

// Attribute values safe to keep when they are short enumerated tokens.
const VALUE_KEEP = new Set([
  "role", "data-testid", "aria-selected", "aria-hidden", "aria-expanded", "aria-checked",
  "aria-current", "aria-modal", "aria-live", "dir", "type", "tabindex", "data-focusable",
]);

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
function enumValue(value) {
  const text = String(value == null ? "" : value);
  if (!text) return "x";
  if (codePoints(text) > 32) return "x";
  if (!/^[A-Za-z0-9_:-]+$/.test(text)) return "x";
  if (looksLikeUuid(text) || looksLikeHash(text)) return "x";
  if (text.length >= 4 && digitMajority(text)) return "x";
  return text;
}

function classToken(token) {
  if (/^r-[0-9a-z]{4,}$/i.test(token)) return "h";
  if (/^css-[0-9a-z]+$/i.test(token)) return "h";
  const segments = token.split(/[_-]/).filter(Boolean);
  if (segments.some((part) => /^[0-9a-f]{5,}$/i.test(part))) return "h";
  if (segments.some((part) => part.length >= 6 && /[0-9]/.test(part) && /[a-z]/i.test(part))) return "h";
  const prefix = token.split(/[_-]/)[0] || token;
  return Array.from(prefix).slice(0, 20).join("");
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
  return `${name}=${enumValue(raw)}`;
}

function attrSignature(el) {
  return [...el.attributes].map((attr) => attr.name).sort().join(",");
}

function tagOf(node) {
  return String(node.tagName || node.nodeName || "").toLowerCase();
}

function isHost(node) {
  return node.id === HOST_ID || (node.nodeType === 1 && node.hasAttribute && node.getAttribute("data-xsched-host") === "1");
}

function hostnameOf(value) {
  const match = /^(?:[a-z][a-z0-9+.-]*:)?\/\/([^/?#]+)/i.exec(String(value == null ? "" : value));
  if (!match) return "x";
  return match[1].split(":")[0] || "x";
}

function childNodesOf(node) {
  return [...(node.childNodes || [])];
}

function elementChildren(node) {
  return childNodesOf(node).filter((child) => child.nodeType === 1 && !isHost(child));
}

// Bottom-up subtree signature so consecutive identical siblings can collapse to "×N".
function signature(node, memo) {
  if (memo.has(node)) return memo.get(node);
  let value;
  if (node.nodeType === 3) {
    value = `#${codePoints(node.nodeValue).toString(36)}`;
  } else if (node.nodeType !== 1) {
    value = "";
  } else if (node.shadowRoot) {
    value = `${tagOf(node)}<${attrSignature(node)}>#shadow[${elementChildren(node.shadowRoot).map((child) => signature(child, memo)).join(",")}]`;
  } else if (tagOf(node) === "script" || tagOf(node) === "style") {
    value = `${tagOf(node)}<${attrSignature(node)}>`;
  } else {
    const kids = childNodesOf(node).filter((child) => child.nodeType === 1 || (child.nodeType === 3 && /\S/.test(child.nodeValue || "")));
    value = `${tagOf(node)}<${attrSignature(node)}>${kids.map((child) => signature(child, memo)).join(",")}`;
  }
  memo.set(node, value);
  return value;
}

function pathKind(pathname) {
  return /^\/compose\/(?:post|tweet)\/unsent\/scheduled(?:\/|$)/.test(pathname || "") ? "scheduled" : "other";
}

// Build the skeleton string. Root defaults to document.body (fallback documentElement).
function buildSkeleton(target, options = {}) {
  const doc = options.document || (target && target.ownerDocument) || target;
  const body = options.root
    || (doc && doc.body)
    || (doc && doc.documentElement)
    || (target && target.documentElement)
    || null;
  const header = `xsched-skeleton v${SKELETON_VERSION} path=${pathKind(options.pathname)} nodes=`;
  if (!body) return `${header}0`;

  const lines = [];
  const memo = new Map();
  let nodes = 0;
  let maxDepthSeen = 0;
  let truncated = false;
  let stop = false;

  const push = (depth, text) => {
    lines.push(`${"  ".repeat(depth)}${text}`);
    nodes += 1;
    if (depth > maxDepthSeen) maxDepthSeen = depth;
  };

  function walk(node, depth) {
    if (stop) return;
    if (nodes >= MAX_NODES || depth > MAX_DEPTH) { truncated = true; stop = true; return; }
    if (!node) return;

    if (node.nodeType === 3) {
      const text = node.nodeValue || "";
      if (!/\S/.test(text)) return;
      push(depth, `#text(${codePoints(text)})`);
      return;
    }
    if (node.nodeType !== 1) return;
    if (isHost(node)) return;

    const tag = tagOf(node);
    const attrs = [...node.attributes].map((attr) => attr.name).slice(0, MAX_LINE_ATTRS).map((name) => attrToken(node, name));
    const line = `${tag} c=${childNodesOf(node).length}${attrs.length ? " " + attrs.join(" ") : ""}`;

    if (tag === "script" || tag === "style") {
      push(depth, line);
      return;
    }

    if (tag === "iframe") {
      push(depth, line);
      let sameOrigin = false;
      let inner = null;
      try {
        inner = node.contentDocument || (node.contentWindow && node.contentWindow.document) || null;
      } catch { inner = null; }
      if (inner) {
        push(depth + 1, "#iframe-doc");
        const innerRoot = inner.body || inner.documentElement;
        if (innerRoot) {
          for (const child of elementChildren(innerRoot)) walk(child, depth + 2);
        }
      } else {
        push(depth + 1, `#iframe origin=${hostnameOf(node.getAttribute("src"))}`);
      }
      return;
    }

    push(depth, line);

    const shadow = node.shadowRoot;
    if (shadow) {
      push(depth + 1, "#shadow");
      const kids = elementChildren(shadow);
      emitChildren(kids, depth + 2);
    }
    emitChildren(childNodesOf(node), depth + 1);
  }

  // Emit children, collapsing consecutive identical siblings into one "×N" line.
  function emitChildren(children, depth) {
    for (let index = 0; index < children.length;) {
      if (stop) return;
      const child = children[index];
      if (isHost(child)) { index += 1; continue; }
      if (child.nodeType === 3 && !/\S/.test(child.nodeValue || "")) { index += 1; continue; }
      const sig = signature(child, memo);
      let group = 1;
      while (index + group < children.length && signature(children[index + group], memo) === sig) group += 1;
      const before = lines.length;
      walk(child, depth);
      if (group > 1 && lines.length > before) {
        lines[lines.length - 1] = `${lines[lines.length - 1]} ×${group}`;
      }
      index += group;
    }
  }

  emitChildren(childNodesOf(body), 0);

  const trailer = truncated ? `\nTRUNCATED nodes=${nodes} depth=${maxDepthSeen}` : "";
  return `${header}${nodes}\n${lines.join("\n")}${trailer}`;
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
