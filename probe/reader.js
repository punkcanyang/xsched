// xsched gate 0 — pure read-only reader for X's "Unsent posts → Scheduled" list.
//
// No network, no storage, no page-patching. This file only inspects DOM that is
// already rendered and returns counts + parsed schedule times.
//
// It is a *classic* script (no `export`), shared two ways:
//   - Chrome: manifest loads it as a content script right before content.js, in the
//     same isolated world, so both share the isolated global object.
//   - Node:   test/reader.test.mjs does `await import("../probe/reader.js")` and reads
//     `globalThis.XSCHED_READER`. (We cannot use ES-module `import` between content
//     scripts: Chrome refuses to resolve extension specifiers without
//     web_accessible_resources, which the hard rules forbid. Verified empirically.)
//
// Every DOM assumption here is a *guess* reconstructed from public sources; none of it
// has been verified against a logged-in x.com page. See notes/GATE0.md for the source
// table. When the real page drifts, the diagnostic counters (l1/l2/l3, cell, button,
// phrase, timeFail) are meant to say *which* assumption broke.
//
// Everything lives inside an IIFE: Chrome runs reader.js and content.js as two classic
// scripts in the SAME isolated world, so a top-level `const` here would collide with the
// same-named one in content.js ("Identifier 'PROBE_VERSION' has already been declared").
// Only `globalThis.XSCHED_READER` is exported.
(() => {
"use strict";

const PROBE_VERSION = "0.0.2";

// Tab labels that mean "Scheduled". en / ja are from public sources; zh-Hant, zh-Hans
// and ko are *guesses* (no public source found) and are marked as such in GATE0.md.
const SCHEDULED_LABELS = [
  "scheduled", // en — public source
  "scheduled posts",
  "予約済み", // ja — public source
  "予約投稿",
  "已排程", // zh-Hant — guessed
  "已排定",
  "已定时", // zh-Hans — guessed
  "已排程",
  "예약됨", // ko — guessed
  "예약",
];

const LABEL_SET = new Set(SCHEDULED_LABELS.map((label) => label.toLowerCase()));

const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
// Optional weekday prefix, e.g. "Fri, " or "Friday ". Non-capturing on purpose so the
// component group numbers stay stable across every pattern below.
const WEEKDAY_PREFIX = "(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?,?\\s*)?";

// --- time phrase patterns ---------------------------------------------------------
// Each pattern exposes group 1 = the human-readable time phrase we show verbatim,
// and the following groups are the numeric parts used to build a local Date.
// tier "strict" = the sentence carries a send verb ("Will send on …", "…に送信されます").
// tier "loose"  = a bare date+time with no verb; only used as a fallback.

const STRICT = [
  {
    lang: "en",
    re: new RegExp(
      `will send on\\s+(${WEEKDAY_PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[2])], day: m[3], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "en",
    re: new RegExp(
      `will send on\\s+(${WEEKDAY_PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[3])], day: m[2], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "ja",
    re: /((\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]{1,12}\))?(?:\s*の)?\s*(午前|午後)?\s*(\d{1,2}):(\d{2})\s*に送信されます)/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh-Hant",
    re: /((?:將於|於)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]{1,8}[)）])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2}):(\d{2})\s*(?:傳送|發送|发送|传送))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh-Hans",
    re: /((?:将于|于)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*[(（][^)）]{1,8}[)）])?\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2}):(\d{2})\s*(?:发送|傳送|传送|发出))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "ko",
    re: /((\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2}):(\d{2})\s*(?:에\s*)?(?:전송됩니다|게시됩니다|예약됩니다|예약됨))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
];

const LOOSE = [
  {
    lang: "en",
    re: new RegExp(
      `^(${WEEKDAY_PREFIX}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[2])], day: m[3], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "en",
    re: new RegExp(
      `^(${WEEKDAY_PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH}\\s+(\\d{4})\\s*(?:,|at)?\\s*(\\d{1,2}):(\\d{2})\\s*(a\\.?m\\.?|p\\.?m\\.?)?)`,
      "i",
    ),
    parts: (m) => ({ year: m[4], month: MONTH_INDEX[monthKey(m[3])], day: m[2], hour: m[5], minute: m[6], meridiem: m[7], meridiemStyle: "en" }),
  },
  {
    lang: "ja",
    re: /^((\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日(?:\s*\([^)]{1,12}\))?(?:\s*の)?\s*(午前|午後)?\s*(\d{1,2}):(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "zh",
    re: /^((\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(上午|下午|晚上|中午|凌晨|清晨)?\s*(\d{1,2}):(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
  {
    lang: "ko",
    re: /^((\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(오전|오후)?\s*(\d{1,2}):(\d{2}))/,
    parts: (m) => ({ year: m[2], month: m[3], day: m[4], hour: m[6], minute: m[7], meridiem: m[5], meridiemStyle: "cjk" }),
  },
];

// A send verb that marks a "real" schedule phrase (used for the phrase counter).
const SEND_VERB_RE = /will send on|に送信されます|將於|将于|전송됩니다|게시됩니다|예약됩니다/i;
// Any 4-digit year in an element that we could not parse → format drift signal.
const YEAR_RE = /\b20\d{2}\b|\d{4}\s*年|\d{4}\s*년/;

function monthKey(raw) {
  return String(raw || "").toLowerCase().replace(/\./g, "").slice(0, 3);
}

// --- small helpers ----------------------------------------------------------------

function normalize(value) {
  return String(value == null ? "" : value)
    .replace(/[\u00a0\u202f\u2007]/g, " ")
    .replace(/：/g, ":")
    .replace(/[\u200b\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// First `limit` code points, so emoji / CJK are not cut in half.
function previewText(value, limit = 20) {
  return Array.from(String(value == null ? "" : value)).slice(0, limit).join("");
}

// Language tags may only be a short ASCII tag; anything else collapses to "x".
function sanitizeLang(value) {
  const text = String(value == null ? "" : value);
  return /^[A-Za-z0-9-]{1,20}$/.test(text) ? text : "x";
}

// Mask a diagnostic sample so it can never carry tweet text or an account.
// Digits and punctuation/space are kept (they carry no readable content); every
// letter/mark (\p{L}\p{M}) and every other symbol (emoji, \p{S}) becomes "x".
// Code points are preserved one-for-one so length information survives; capped at 60.
function maskSample(value) {
  const text = String(value == null ? "" : value);
  const masked = text.replace(/[^\p{Nd}\p{P}\s]/gu, "x");
  return Array.from(masked).slice(0, 60).join("");
}

// True only when the overlay host is actually in the document *and* laid out.
function hostMounted(el) {
  if (!el || !el.isConnected) return false;
  let width = 0;
  let height = 0;
  if (typeof el.getBoundingClientRect === "function") {
    try {
      const rect = el.getBoundingClientRect();
      width = Number(rect && rect.width) || 0;
      height = Number(rect && rect.height) || 0;
    } catch { /* ignore */ }
  }
  if (!width && !height) {
    width = Number(el.offsetWidth) || 0;
    height = Number(el.offsetHeight) || 0;
  }
  return width > 0 || height > 0;
}

function dedupStrings(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (value && !seen.has(value)) { seen.add(value); out.push(value); }
  }
  return out;
}

function classifyPath(pathname) {
  const path = pathname || "";
  if (/^\/compose\/(?:post|tweet)\/schedule(?:\/|$)/.test(path)) return "picker";
  if (/^\/compose\/(?:post|tweet)\/unsent\/scheduled(?:\/|$)/.test(path)) return "scheduled";
  if (/^\/compose\/(?:post|tweet)\/unsent\/drafts?(?:\/|$)/.test(path)) return "drafts";
  if (/^\/compose\/(?:post|tweet)\/unsent(?:\/|$)/.test(path)) return "unsent";
  return "other";
}

function isScheduledLabel(value) {
  const text = normalize(value);
  if (!text || text.length > 24) return false;
  return LABEL_SET.has(text.toLowerCase());
}

function labelOf(el) {
  const aria = el.getAttribute ? el.getAttribute("aria-label") : "";
  return normalize(aria || el.textContent || "");
}

function toDate(parts) {
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  const minute = Number(parts.minute);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  if (year < 2000 || year > 2100) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (minute < 0 || minute > 59) return null;
  const mer = String(parts.meridiem || "").replace(/[.\s]/g, "").toLowerCase();
  if (mer && (hour < 1 || hour > 12)) return null;
  if (parts.meridiemStyle === "en") {
    if (mer === "am") hour = hour % 12;
    else if (mer === "pm") hour = hour < 12 ? hour + 12 : hour;
  } else {
    // 午前 / 上午 / 오전 → before noon; 午後 / 下午 / 오후 → after noon.
    if (/^(午前|上午|오전|凌晨|清晨)$/.test(mer)) hour = hour % 12;
    else if (/^(午後|下午|晚上|中午|오후)$/.test(mer)) hour = hour < 12 ? hour + 12 : hour;
  }
  if (hour < 0 || hour > 23) return null;
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // Reject silently-rolled dates such as Feb 30.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}

// Parse a candidate string (aria-label or textContent) into a schedule record.
// Returns null when no time phrase is present. `unparsed: true` means a phrase was
// found but we refuse to guess a Date.
function parseSchedule(raw, { allowLoose = true } = {}) {
  const text = normalize(raw);
  if (!text) return null;
  for (const pattern of STRICT) {
    const m = pattern.re.exec(text);
    if (!m) continue;
    const time = normalize(m[1]);
    const offset = m[0].indexOf(m[1]);
    const start = m.index + Math.max(0, offset);
    const body = normalize(text.slice(start + m[1].length));
    const suffix = text.slice(m.index + m[0].length);
    const at = pattern.lang === "en" && /^[\d:]/.test(suffix) ? null : toDate(pattern.parts(m));
    return { lang: pattern.lang, tier: "strict", time, body, at, unparsed: at === null };
  }
  if (!allowLoose) return null;
  for (const pattern of LOOSE) {
    const m = pattern.re.exec(text);
    if (!m) continue;
    const time = normalize(m[1]);
    const body = normalize(text.slice(time.length));
    const at = /^[\d:]/.test(text.slice(m[0].length)) ? null : toDate(pattern.parts(m));
    return { lang: pattern.lang, tier: "loose", time, body, at, unparsed: at === null };
  }
  return null;
}

function toItem(parsed) {
  const preview = previewText(parsed.body);
  return {
    time: parsed.time,
    preview,
    key: `${parsed.time}\u0000${normalize(parsed.body)}`,
    lang: parsed.lang,
    tier: parsed.tier,
    at: parsed.at,
    unparsed: parsed.unparsed,
  };
}

function dedup(items) {
  const map = new Map();
  for (const item of items) if (!map.has(item.key)) map.set(item.key, item);
  return [...map.values()];
}

function outermost(elements) {
  const candidates = new Set(elements);
  return [...candidates].filter((el) => {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (candidates.has(parent)) return false;
    }
    return true;
  });
}

function deepest(elements) {
  const ancestors = new Set();
  for (const el of elements) {
    for (let parent = el.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
  }
  return elements.filter((el) => !ancestors.has(el));
}

// Composer chips and editor bodies are never list rows, even inside the unsent dialog.
const COMPOSER = 'form, [contenteditable="true"], [data-testid="tweetTextarea_0"], [data-testid="scheduledDateField"], [data-testid="scheduledTimeField"], [data-testid="scheduleConfirm"], [data-testid="scheduleOption"], [data-testid="scheduleChip"]';
function readable(el, scope) {
  for (let node = el; node; node = node.parentElement) {
    if (node.id === "xsched-probe-root" || node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.matches(COMPOSER)) return false;
    if (node !== scope && node.getAttribute("role") === "dialog") return false;
    if (node === scope) break;
  }
  return true;
}

function parseElement(el, allowLoose) {
  const named = el.querySelector && el.querySelector('[role="button"][aria-label], [role="listitem"][aria-label]');
  const aria = (el.getAttribute && el.getAttribute("aria-label")) || (named && named.getAttribute("aria-label")) || "";
  const fromAria = aria ? parseSchedule(aria, { allowLoose }) : null;
  const fromText = parseSchedule(el.textContent, { allowLoose });
  let parsed = fromAria || fromText;
  if (!parsed) return null;
  {
    const tweet = el.querySelector && el.querySelector('[data-testid="tweetText"]');
    const body = normalize(tweet ? tweet.textContent : "");
    if (body) parsed = { ...parsed, body };
  }
  if (!parsed.body && parsed.tier === "loose") {
    const ariaBody = normalize(fromAria ? el.textContent : aria);
    const other = parseSchedule(ariaBody, { allowLoose });
    const body = other ? other.body : ariaBody;
    if (body) parsed = { ...parsed, body };
  }
  // A standalone time-only button is a composer chip, not sufficient list evidence.
  if (!parsed.body && !el.closest('[data-testid="cellInnerDiv"], [role="listitem"]')) return null;
  return toItem(parsed);
}

function textFallback(scope) {
  const all = [...scope.querySelectorAll("*")].filter((el) => readable(el, scope) && !el.querySelector(COMPOSER) && parseSchedule(el.textContent, { allowLoose: false }));
  const leaves = deepest(all);
  const items = [];
  for (const el of leaves) {
    let hit = parseSchedule(el.textContent, { allowLoose: true });
    const parent = el.parentElement;
    if (hit && !hit.body && parent && scope.contains(parent) && parent !== scope && readable(parent, scope) && !parent.querySelector(COMPOSER)) {
      const parentHit = parseSchedule(parent.textContent, { allowLoose: true });
      if (parentHit && parentHit.body) hit = parentHit;
    }
    if (hit && hit.body) items.push(toItem(hit));
  }
  return dedup(items);
}

function countDeep(scope, re) {
  const all = [...scope.querySelectorAll("*")].filter((el) => readable(el, scope) && re.test(normalize(el.textContent)));
  return deepest(all).length;
}

function findScheduledTab(doc) {
  const tabs = [...doc.querySelectorAll('[role="tab"]')];
  const scheduled = tabs.filter((el) => readable(el, el.closest('[role="dialog"]') || doc.body) && isScheduledLabel(labelOf(el)));
  return scheduled.find(tabIsSelected) || scheduled[0] || null;
}

function tabIsSelected(tab) {
  if (!tab) return false;
  return tab.getAttribute("aria-selected") === "true" || tab.getAttribute("aria-current") === "page";
}

function findScope(doc, tab) {
  if (tab) {
    const controls = tab.getAttribute ? tab.getAttribute("aria-controls") : "";
    if (controls) {
      const panel = doc.getElementById ? doc.getElementById(controls) : null;
      if (panel) return { el: panel, name: "panel" };
    }
  }
  const dialog = (tab && tab.closest('[role="dialog"]')) || doc.querySelector('[role="dialog"]');
  if (dialog) return { el: dialog, name: "dialog" };
  const column = doc.querySelector('[data-testid="primaryColumn"]');
  if (column) return { el: column, name: "column" };
  const region = doc.querySelector('[role="region"]');
  if (region) return { el: region, name: "region" };
  return doc.body ? { el: doc.body, name: "body" } : null;
}

function computedOverflow(doc, el) {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== "function") return "";
  try {
    const style = view.getComputedStyle(el);
    return `overflow:${style.overflow || ""};overflow-y:${style.overflowY || ""}`;
  } catch {
    return "";
  }
}

// Heuristic only. `virtualized` = the list positions rows with inline translateY().
// `needsScroll` = something in the scope can scroll, so the overlay must warn that the
// count grows only as the user scrolls (we never scroll for them).
function detectLayout(scope, doc) {
  const inlineStyled = [scope, ...scope.querySelectorAll("[style]")].slice(0, 200);
  let virtualized = 0;
  let overflow = 0;
  for (const el of inlineStyled) {
    const style = el.getAttribute ? el.getAttribute("style") || "" : "";
    if (/translateY\s*\(/i.test(style)) virtualized = 1;
    const combined = `${style} ${computedOverflow(doc, el)}`;
    if (/overflow(?:-y)?\s*:\s*(?:auto|scroll)/i.test(combined)) {
      const scrollHeight = Number(el.scrollHeight || 0);
      const clientHeight = Number(el.clientHeight || 0);
      if (scrollHeight > clientHeight + 24) overflow = 1;
    }
  }
  if (!overflow) {
    const scrollHeight = Number(scope.scrollHeight || 0);
    const clientHeight = Number(scope.clientHeight || 0);
    if (scrollHeight > clientHeight + 24) overflow = 1;
  }
  return { virtualized, needsScroll: virtualized || overflow ? 1 : 0 };
}

function blank(onScheduled) {
  return {
    onScheduled,
    tab: 0,
    scope: "none",
    cell: 0,
    button: 0,
    listitem: 0,
    link: 0,
    tweetText: 0,
    phrase: 0,
    l1: 0,
    l2: 0,
    l3: 0,
    layer: "none",
    mounted: 0,
    samples: [],
    timeOk: 0,
    timeFail: 0,
    unparsed: 0,
    loose: 0,
    needsScroll: 0,
    virtualized: 0,
    empty: onScheduled ? 1 : 0,
    items: [],
  };
}

function readSnapshot(doc, { pathname = "" } = {}) {
  const kind = classifyPath(pathname);
  const tab = findScheduledTab(doc);
  const selected = tabIsSelected(tab);
  let onScheduled = 0;
  if (kind !== "picker" && kind !== "drafts") {
    if ((kind === "scheduled" && (!tab || selected)) || (kind === "unsent" && selected)) onScheduled = 1;
  }
  if (!onScheduled) return blank(0);

  const found = findScope(doc, tab);
  if (!found) return { ...blank(1), tab: tab ? 1 : 0 };
  const scope = found.el;
  const candidates = (selector) => [...scope.querySelectorAll(selector)].filter((el) => readable(el, scope) && !el.querySelector(COMPOSER));

  const cells = outermost(candidates('[data-testid="cellInnerDiv"]'));
  const buttons = outermost(candidates('[role="button"]'));
  const listitems = outermost(candidates('[role="listitem"]'));
  const links = outermost(candidates('[role="link"]'));

  const fromCells = dedup(cells.map((el) => parseElement(el, true)).filter(Boolean));
  const fromA11y = dedup(outermost([...listitems, ...links, ...buttons]).map((el) => parseElement(el, true)).filter(Boolean));
  const fromText = fromCells.length === 0 && fromA11y.length === 0 ? textFallback(scope) : [];

  let items = [];
  let layer = "none";
  if (fromCells.length) {
    items = dedup([...fromCells, ...fromA11y]);
    layer = fromCells.some((item) => item.tier === "strict") ? "cell" : "loose";
  } else if (fromA11y.length) {
    items = fromA11y;
    layer = fromA11y.some((item) => item.tier === "strict") ? "a11y" : "loose";
  } else if (fromText.length) {
    items = fromText;
    layer = "text";
  }

  const pool = outermost([...cells, ...listitems, ...links, ...buttons]);
  let timeFail = 0;
  for (const el of pool) {
    const text = normalize(`${(el.getAttribute && el.getAttribute("aria-label")) || ""} ${el.textContent || ""}`);
    if (!YEAR_RE.test(text)) continue;
    if (!parseSchedule(text, { allowLoose: true })) timeFail += 1;
  }

  // For failures, keep the *smallest* node whose text looks like a time phrase but
  // refused to parse. Only its own text is sampled, and buildDiagnostic masks it.
  const failNodes = [...scope.querySelectorAll("*")].filter((el) => {
    if (!readable(el, scope) || el.querySelector(COMPOSER)) return false;
    const text = el.textContent;
    if (!YEAR_RE.test(normalize(text || ""))) return false;
    const parsed = parseSchedule(text, { allowLoose: true });
    return !parsed || parsed.unparsed === true;
  });
  const samples = dedupStrings(deepest(failNodes).map((el) => normalize(el.textContent || ""))).slice(0, 3);

  const layout = detectLayout(scope, doc);
  return {
    onScheduled: 1,
    scopeElement: scope,
    tab: tab ? 1 : 0,
    scope: found.name,
    cell: cells.length,
    button: buttons.length,
    listitem: listitems.length,
    link: links.length,
    tweetText: scope.querySelectorAll('[data-testid="tweetText"]').length,
    phrase: countDeep(scope, SEND_VERB_RE),
    l1: fromCells.length,
    l2: fromA11y.length,
    l3: fromText.length,
    layer,
    // Real mount state is computed by the content glue; the reader cannot know it.
    mounted: 0,
    samples,
    timeOk: items.filter((item) => item.at !== null).length,
    timeFail,
    unparsed: items.filter((item) => item.unparsed).length,
    loose: items.filter((item) => item.tier === "loose").length,
    needsScroll: layout.needsScroll,
    virtualized: layout.virtualized,
    empty: items.length === 0 && timeFail === 0 ? 1 : 0,
    items,
  };
}

// Accumulate across snapshots (the list is virtualized, so earlier rows disappear).
// `replace` is used on non-virtual pages where one snapshot already holds the whole list.
function mergeItems(previous, next, { replace = false } = {}) {
  if (replace) return dedup(next);
  return dedup([...(previous || []), ...(next || [])]);
}

const DIAG_ORDER = [
  "onScheduled", "tab", "scope", "cell", "button", "listitem", "link", "tweetText",
  "phrase", "l1", "l2", "l3", "layer", "mounted", "items", "remounts", "timeOk",
  "timeFail", "unparsed", "loose", "needsScroll", "virtualized", "empty", "scrolled",
];

// Masked, percent-encoded time samples (max 3). The pipe separator is safe because
// maskSample already replaced every non-digit/punct/space symbol, including the pipe.
function sampleField(samples) {
  if (!Array.isArray(samples)) return "none";
  const out = [];
  for (const sample of samples) {
    if (typeof sample !== "string" || !sample) continue;
    out.push(encodeURIComponent(maskSample(sample)));
    if (out.length >= 3) break;
  }
  return out.length ? out.join("|") : "none";
}

// Diagnostic string: counters / booleans / language tags / masked samples / version only.
// Never a tweet body, account, URL, or unmasked schedule-time string.
function buildDiagnostic(report) {
  const scopeCode = { none: 0, panel: 1, dialog: 2, column: 3, region: 4, body: 5 };
  const layerCode = { none: 0, cell: 1, a11y: 2, text: 3, loose: 4 };
  const parts = DIAG_ORDER.map((key) => {
    if (key === "scope" || key === "layer") {
      const codes = key === "scope" ? scopeCode : layerCode;
      const value = report[key];
      return `${key}=${typeof value === "string" && Object.hasOwn(codes, value) ? codes[value] : 0}`;
    }
    const value = report[key];
    return `${key}=${typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0}`;
  });
  return `xsched-gate0 v${PROBE_VERSION} ${parts.join(" ")} lang=${sanitizeLang(report.lang)} doclang=${sanitizeLang(report.doclang)} samples=${sampleField(report.samples)}`;
}

// Shared API. `globalThis` so a classic content script loaded right after this file (same
// isolated world) can use it, and so the node unit test can `await import("./reader.js")`
// and read `globalThis.XSCHED_READER`.
globalThis.XSCHED_READER = {
  PROBE_VERSION,
  SCHEDULED_LABELS,
  normalize,
  previewText,
  classifyPath,
  isScheduledLabel,
  parseSchedule,
  findScheduledTab,
  readSnapshot,
  mergeItems,
  buildDiagnostic,
  maskSample,
  sanitizeLang,
  hostMounted,
};
})();
