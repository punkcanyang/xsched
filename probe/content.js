// xsched gate 0.2 — read-only panel, DOM SVG shortcut, local diagnostics.
// All visible UI stays in shadow DOM. No page controls are clicked or scrolled.
(() => {
"use strict";
const { PROBE_VERSION, buildDiagnostic, mergeItems, readSnapshot, hostMounted, versionLine } = globalThis.XSCHED_READER;
const { buildSkeleton, SKELETON_VERSION } = globalThis.XSCHED_SKELETON;

const { stringsFor, placement } = globalThis.XSCHED_UI;

const HOST_ID = "xsched-probe-root";
const POLL_MS = 400;
const SETTLE_MS = 60;
const REMOUNT_WINDOW_MS = 3000;
const REMOUNT_LIMIT = 3;

let host = null;
let timer = 0;
let scrolled = 0;
let accumulated = [];
let session = "";
let collapsed = null; // auto until first click; preserve user choice across routes/remounts
let retired = false;
let runtimeSignature = "";
let pollId = 0;
let lastLocation = "";
let scopeElement = null;
let observer = null;
let lastRender = "";
let mounted = 0;
let remounts = 0;
let hostCreations = 0;
let remountWindowStart = 0;
let remountWindowCount = 0;
let copyTimer = 0;
let lastDiag = "";
let lastReport = null;
let lastItems = [];

// Set styles through CSSOM (never a <style> element or style attribute string), so a
// strict page CSP cannot strip them. !important fends off X's own element styles.
function css(el, style) {
  for (const key of Object.keys(style)) {
    el.style.setProperty(key, String(style[key]), "important");
  }
  return el;
}

function textNode(tag, text, style) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (style) css(node, style);
  return node;
}

function runtimeState() {
  try {
    if (!chrome.runtime.id) return { runtimeInvalidated: true };
    return { manifestVersion: chrome.runtime.getManifest().version };
  } catch { return { runtimeInvalidated: true }; }
}

// 0.0.2 has no stop hook and its poll recreates a removed host. Keep that host
// connected but inert in a hidden shadow parking area; it can keep its private
// references without competing for the visible ID. No legacy UI remains visible.
function retireLegacy(old) {
  const parking = document.createElement("div");
  parking.setAttribute("data-xsched-host", "1");
  parking.setAttribute("data-xsched-retired", "1");
  css(parking, { display: "none", "pointer-events": "none" });
  parking.setAttribute("aria-hidden", "true");
  parking.inert = true;
  const shadow = parking.attachShadow({ mode: "open" });
  (document.body || document.documentElement).append(parking);
  old.removeAttribute("id");
  shadow.append(old);
}

// Newer sessions can dispose observers/timers instead of parking themselves.
const previous = globalThis.XSCHED_PROBE_SESSION;
if (previous && typeof previous.dispose === "function") previous.dispose();
for (const old of document.querySelectorAll('#xsched-probe-root')) retireLegacy(old);

function ensureHost() {
  if (retired) return null;
  for (const old of document.querySelectorAll("#xsched-probe-root")) if (old !== host) retireLegacy(old);
  if (host && host.isConnected) return host;
  const now = Date.now();
  if (now - remountWindowStart >= REMOUNT_WINDOW_MS) {
    remountWindowStart = now;
    remountWindowCount = 0;
  }
  // Count actual creations, not mutation notifications. Retry on the location poll
  // after the window expires, so a transient redraw never disables us permanently.
  if (remountWindowCount >= REMOUNT_LIMIT) return null;
  remountWindowCount += 1;
  const existed = hostCreations > 0;
  hostCreations += 1;
  if (existed) remounts += 1;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-xsched-host", "1");
  host.setAttribute("data-xsched-version", PROBE_VERSION);
  css(host, {
    all: "initial",
    position: "fixed",
    right: "16px",
    bottom: "112px",
    "z-index": "2147483647",
    display: "block",
    width: "44px",
    height: "44px",
    "max-width": "360px",
    margin: "0",
    "pointer-events": "none",
  });
  const shadow = host.attachShadow({ mode: "open" });
  const panel = document.createElement("section");
  panel.className = "panel";
  css(panel, {
    position: "absolute",
    right: "0",
    bottom: "56px",
    width: "min(344px, calc(100vw - 32px))",
    "box-sizing": "border-box",
    "pointer-events": "auto",
    font: "13px/1.45 ui-sans-serif, system-ui, sans-serif",
    color: "#e7e9ea",
    background: "rgba(22, 24, 28, 0.96)",
    "border-radius": "16px",
    border: "1px solid #38444d",
    "box-shadow": "0 8px 28px rgba(0, 0, 0, 0.45)",
    padding: "10px 12px 12px",
    "max-height": "calc(100vh - 188px)",
    "max-width": "344px",
    overflow: "auto",
  });
  panel.id = "xsched-panel";
  const shortcut = makeButton("", "xschedToggle");
  shortcut.className = "shortcut";
  css(shortcut, { position: "relative", width: "44px", height: "44px", padding: "8px", display: "grid", "place-items": "center", "pointer-events": "auto", "box-shadow": "0 4px 16px #0008" });
  shortcut.setAttribute("aria-controls", panel.id);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", "28");
  svg.setAttribute("height", "28");
  svg.setAttribute("aria-hidden", "true");
  // Exact Dagaz path / stroke geometry from docs/xsched-logo-B.svg, clipped
  // by the SVG viewport to the same y=6..58 extent without a URL reference.
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const [key, value] of Object.entries({ d: "M12 10 L12 54 L52 10 L52 54 Z", fill: "none", stroke: "#0B1220", "stroke-width": "8", "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "10" })) path.setAttribute(key, value);
  svg.setAttribute("viewBox", "0 6 64 52");
  svg.append(path);
  shortcut.append(svg);
  const badge = textNode("span", "", { position: "absolute", top: "-5px", right: "-5px", background: "#1d9bf0", color: "white", "border-radius": "10px", padding: "1px 5px", font: "11px/1.4 system-ui", "pointer-events": "none" });
  badge.className = "badge";
  shortcut.append(badge);
  shortcut.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!lastReport) return;
    collapsed = !(collapsed === null ? !lastReport.onScheduled : collapsed);
    render(lastReport, lastItems);
  });
  shadow.append(panel, shortcut);
  (document.body || document.documentElement).append(host);
  // A fresh host has no panel content: force the next render to build it.
  lastRender = "";
  return host;
}

function writeDataset(node, report, count, diag) {
  node.dataset.xschedOn = report.onScheduled ? "1" : "0";
  node.dataset.xschedMode = report.onScheduled ? "scheduled" : "other";
  node.dataset.xschedCount = String(count);
  node.dataset.xschedMounted = mounted ? "1" : "0";
  node.dataset.xschedRemounts = String(remounts);
  node.dataset.xschedScrolled = scrolled ? "1" : "0";
  node.dataset.xschedDiag = diag;
}

function scheduleRemount() {
  schedule();
}

function writeClipboard(text, button, label, fallback) {
  const done = () => {
    if (!button || !button.isConnected) return;
    button.textContent = "已複製";
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1500);
  };
  try {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === "function") {
      Promise.resolve(clipboard.writeText(text)).then(done, fallback);
      return;
    }
  } catch { /* synchronous denial also offers manual copy */ }
  fallback();
}

function showFallbackText(text) {
  const shadow = host && host.shadowRoot;
  if (!shadow) return;
  for (const old of shadow.querySelectorAll('.fallback, [data-xsched-select]')) old.remove();
  const area = document.createElement("textarea");
  area.className = "fallback";
  area.readOnly = true;
  area.value = text;
  css(area, {
    display: "block",
    width: "100%",
    height: "140px",
    "margin-top": "8px",
    font: "11px/1.35 ui-monospace, SFMono-Regular, monospace",
    color: "#e7e9ea",
    background: "#0f1419",
    border: "1px solid #38444d",
    "border-radius": "8px",
    "box-sizing": "border-box",
    "white-space": "pre",
  });
  const select = textNode("button", "全選", buttonStyle(true));
  select.setAttribute("data-xsched-select", "1");
  select.type = "button";
  select.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    try { area.focus(); area.select(); } catch { /* ignore */ }
  });
  shadow.querySelector("section").append(area, select);
  positionUI();
}

function buttonStyle(ghost) {
  return ghost
    ? { appearance: "none", background: "#2f3336", color: "#e7e9ea", border: "0", "border-radius": "999px", padding: "4px 10px", font: "inherit", "font-weight": "760", cursor: "pointer", "margin-top": "8px" }
    : { appearance: "none", background: "#eff3f4", color: "#0f1419", border: "0", "border-radius": "999px", padding: "6px 12px", font: "inherit", "font-weight": "760", cursor: "pointer" };
}

function makeButton(label, datasetKey) {
  const button = textNode("button", label, buttonStyle(false));
  button.type = "button";
  if (datasetKey) button.dataset[datasetKey] = "1";
  return button;
}

function fixedObstacles() {
  const rectangles = [];
  const seen = new Set();
  // Supplied Post/FAB controls and arbitrary Messages/Grok controls are covered
  // by generic interactive elements plus their fixed/sticky ancestor containers.
  for (const control of document.querySelectorAll('button, a, [role="button"], [role="dialog"], aside')) {
    if (control === host || control.closest('[data-xsched-host="1"]')) continue;
    let fixed = null;
    for (let node = control; node && node !== document.body; node = node.parentElement) {
      if (node === host || node.getAttribute("data-xsched-host") === "1") break;
      const style = getComputedStyle(node);
      if (style.position === "fixed" || style.position === "sticky") { fixed = node; break; }
    }
    if (!fixed || seen.has(fixed)) continue;
    seen.add(fixed);
    const style = getComputedStyle(fixed);
    const rect = fixed.getBoundingClientRect();
    if (style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0) rectangles.push(rect);
  }
  return rectangles;
}

function positionUI() {
  if (!host?.isConnected) return;
  const panel = host.shadowRoot.querySelector("section");
  const obstacles = fixedObstacles();
  const isOpen = panel.style.getPropertyValue("display") !== "none";
  // Try the full panel first. If a drawer fills that space, keep the button
  // accessible and limit panel height to the available space above it.
  let position = placement(innerWidth, innerHeight, obstacles, isOpen ? panel.getBoundingClientRect().height : 0);
  if (!position.clear && isOpen) {
    position = placement(innerWidth, innerHeight, obstacles);
    css(panel, { "max-height": `${Math.max(60, innerHeight - position.bottom - 72)}px` });
  }
  css(host, { right: `${position.right}px`, bottom: `${position.bottom}px` });
}

function render(report, items) {
  const node = ensureHost();
  if (!node) { mounted = 0; return; }
  const mountedNow = hostMounted(node) ? 1 : 0;
  const count = items.length;
  const effectiveCollapsed = collapsed === null ? !report.onScheduled : collapsed;
  mounted = mountedNow;

  const diag = buildDiagnostic({
    ...report,
    ...runtimeState(),
    mounted: mountedNow,
    items: count,
    remounts,
    timeOk: items.filter((item) => item.at !== null).length,
    unparsed: items.filter((item) => item.unparsed).length,
    empty: report.onScheduled && count === 0 && report.timeFail === 0 ? 1 : 0,
    scrolled,
    lang: typeof navigator !== "undefined" && navigator ? navigator.language : "",
    doclang: document.documentElement ? document.documentElement.lang : "",
    samples: report.samples || [],
  });

  const strings = stringsFor(document.documentElement.lang, navigator.language);
  const signature = JSON.stringify([diag, effectiveCollapsed, count, report.onScheduled, strings.shortcut, items.map((item) => [item.time, item.preview])]);
  if (signature === lastRender && node.shadowRoot && node.shadowRoot.querySelector("section").firstChild) {
    writeDataset(node, report, count, diag);
    positionUI();
    return;
  }
  lastRender = signature;
  lastDiag = diag;
  lastReport = report;
  lastItems = items;

  const panel = node.shadowRoot.querySelector("section");
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  css(panel, { display: effectiveCollapsed ? "none" : "block" });
  const shortcut = node.shadowRoot.querySelector(".shortcut");
  shortcut.setAttribute("aria-expanded", String(!effectiveCollapsed));
  shortcut.setAttribute("aria-label", strings.shortcut);
  shortcut.title = strings.shortcut;
  const badge = shortcut.querySelector(".badge");
  badge.textContent = String(count);
  css(badge, { display: report.onScheduled ? "block" : "none" });
  const kicker = textNode("div", versionLine(runtimeState().manifestVersion, runtimeState().runtimeInvalidated), { color: "#8b98a5", "font-size": "11px", "word-break": "break-word" });
  kicker.className = "version";
  panel.append(kicker);

  const countLine = textNode("div", report.onScheduled ? `讀到 ${count} 則` : "xsched 探針：非 Scheduled 頁", { "font-size": "18px", "font-weight": "760", margin: "4px 0 8px" });
  countLine.className = "count";
  panel.append(countLine);

  if (!effectiveCollapsed) {
    if (report.onScheduled) {
      const hint = textNode("p", "虛擬列表：請自己往下捲到底，數字才完整（本工具不會自動捲動）。", { color: "#ffd400", "font-size": "12px", margin: "0 0 8px" });
      hint.className = "hint";
      panel.append(hint);
      if (count === 0) {
        panel.append(textNode("p", report.timeFail > 0 ? "看到疑似排程列，但時間格式解析不出來（格式可能改版）。" : "這一頁目前沒有解析到排程時間。", { color: "#ffd400", "font-size": "12px", margin: "0 0 8px" }));
      }
      for (const item of items) {
        const row = document.createElement("div");
        css(row, { padding: "6px 0", "border-top": "1px solid #2f3336" });
        const time = textNode("div", item.time, { color: "#1d9bf0", "font-weight": "680", "word-break": "break-word" });
        time.className = "time";
        const preview = textNode("div", item.preview || "（沒有文字）", { "word-break": "break-word" });
        preview.className = "preview";
        row.append(time, preview);
        panel.append(row);
      }
    } else {
      const go = makeButton(strings.goto, "xschedGoto");
      go.title = strings.goto;
      go.setAttribute("aria-label", strings.goto);
      go.dataset.xschedTarget = "https://x.com/compose/post/unsent/scheduled";
      go.addEventListener("click", () => location.assign("https://x.com/compose/post/unsent/scheduled"));
      panel.append(go);
      panel.append(textNode("p", "非 Scheduled 頁面：此頁不讀取列表，僅保留診斷與頁面結構工具。", { color: "#8b98a5", "font-size": "12px", margin: "0 0 8px" }));
    }

    const controls = document.createElement("div");
    css(controls, { display: "flex", gap: "8px", "align-items": "center", "flex-wrap": "wrap" });
    const copy = makeButton("複製診斷", "xschedCopy");
    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      writeClipboard(lastDiag, copy, "複製診斷", () => showFallbackText(lastDiag));
    });
    const skeleton = makeButton("複製頁面結構", "xschedSkeleton");
    skeleton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      let text;
      try {
        text = buildSkeleton(document, { pathname: location.pathname || "" });
      } catch {
        text = `xsched-skeleton v${SKELETON_VERSION} path=other nodes=0`;
      }
      writeClipboard(text, skeleton, "複製頁面結構", () => showFallbackText(text));
    });
    controls.append(copy, skeleton);
    panel.append(controls);

    panel.append(textNode("code", diag, { display: "block", "margin-top": "8px", color: "#8b98a5", font: "11px/1.4 ui-monospace, monospace", "white-space": "pre-wrap", "word-break": "break-all" }));
  }

  writeDataset(node, report, count, diag);
  positionUI();
}

function tick() {
  const pathname = location.pathname || "";
  const report = readSnapshot(document, { pathname });
  const next = `${pathname}${location.search || ""}|${report.onScheduled}`;
  if (next !== session || scopeElement !== report.scopeElement || (report.empty && report.items.length === 0)) {
    session = next;
    scopeElement = report.scopeElement || null;
    accumulated = [];
    scrolled = 0;
  }
  if (report.onScheduled) {
    const replace = report.needsScroll === 0 && report.virtualized === 0;
    accumulated = mergeItems(accumulated, report.items, { replace });
  } else {
    accumulated = [];
  }
  render(report, accumulated);
}

function schedule() {
  if (retired) return;
  if (host && !host.isConnected && remountWindowCount >= REMOUNT_LIMIT && Date.now() - remountWindowStart < REMOUNT_WINDOW_MS) return;
  // A bounded throttle: continuous mutations cannot postpone reading forever.
  if (timer) return;
  timer = window.setTimeout(() => { timer = 0; tick(); }, SETTLE_MS);
}

function onScroll(event) {
  const target = event.target;
  if (host && target && typeof target === "object" && (target === host || host.contains(target) || target === host.shadowRoot)) return;
  if (!scopeElement || (target !== document && target !== document.documentElement && target !== document.body && !scopeElement.contains(target) && !target.contains?.(scopeElement))) return;
  scrolled = 1;
  schedule();
}

function pollLocation() {
  const state = JSON.stringify(runtimeState());
  if (state !== runtimeSignature) { runtimeSignature = state; schedule(); }
  if (document.querySelectorAll("#xsched-probe-root").length > 1) schedule();
  positionUI();
  const now = `${location.pathname || ""}${location.search || ""}`;
  if (now !== lastLocation) {
    lastLocation = now;
    schedule();
  }
  if (!host || !host.isConnected) scheduleRemount();
  else if (hostMounted(host) !== Boolean(mounted)) schedule();
}

function start() {
  if (observer) return;
  document.addEventListener("scroll", onScroll, true);
  observer = new MutationObserver((records) => {
    let hostRemoved = false;
    let changed = false;
    for (const record of records) {
      if (record.target === host || (host && host.contains && host.contains(record.target))) continue;
      // Appending our own host is not a page change. Shadow mutations never reach
      // this observer; host attribute writes are excluded above.
      if (record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every((node) => node === host)) {
        if ([...record.removedNodes].includes(host)) hostRemoved = true;
        continue;
      }
      changed = true;
      for (const node of record.removedNodes) {
        if (node && node.nodeType === 1 && node.id === HOST_ID) hostRemoved = true;
      }
    }
    if (hostRemoved || !host || !host.isConnected) scheduleRemount();
    else if (changed) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-selected", "aria-current", "aria-controls", "aria-label", "hidden", "aria-hidden", "data-testid"],
  });
  window.addEventListener("popstate", schedule);
  window.addEventListener("resize", schedule);
  pollId = window.setInterval(pollLocation, POLL_MS);
  lastLocation = `${location.pathname || ""}${location.search || ""}`;
  ensureHost();
  schedule();
}

function stop() {
  observer?.disconnect();
  observer = null;
  window.clearInterval(pollId);
  pollId = 0;
  window.clearTimeout(timer);
  window.clearTimeout(copyTimer);
  timer = 0;
  document.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("popstate", schedule);
  window.removeEventListener("resize", schedule);
  accumulated = [];
  scopeElement = null;
  // Keep the host mounted across bfcache/SPA teardown; start() re-attaches the observer.
}

function onPageShow(event) { if (event.persisted && !retired) start(); }
globalThis.XSCHED_PROBE_SESSION = { dispose() {
  retired = true;
  stop();
  window.removeEventListener("pagehide", stop);
  window.removeEventListener("pageshow", onPageShow);
  host?.remove();
} };
window.addEventListener("pagehide", stop);
window.addEventListener("pageshow", onPageShow);
if (typeof document !== "undefined" && document.documentElement) start();

})();
