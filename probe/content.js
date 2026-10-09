// xsched gate 0.1 — read-only probe glue.
//
// Watches the SPA route (MutationObserver + a location poll, never patching history),
// reads the Scheduled list through reader.js, and ALWAYS shows a small overlay in the
// bottom-right corner (a compact capsule off the Scheduled page). The overlay only
// *reads*: it never clicks a page element, never scrolls, never sends anything anywhere.
// Diagnostics carry counters, language tags, and masked time samples — no content.
//
// Classic script: reader.js + skeleton.js are injected first and expose their globals.

const { PROBE_VERSION, buildDiagnostic, mergeItems, readSnapshot, hostMounted } = globalThis.XSCHED_READER;
const { buildSkeleton, SKELETON_VERSION } = globalThis.XSCHED_SKELETON;

const HOST_ID = "xsched-probe-root";
const POLL_MS = 400;
const SETTLE_MS = 60;
const REMOUNT_WINDOW_MS = 3000;
const REMOUNT_LIMIT = 40;

let host = null;
let timer = 0;
let scrolled = 0;
let accumulated = [];
let session = "";
let collapsed = null; // null = auto (expanded on Scheduled, capsule elsewhere)
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
let remountGaveUp = false;
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

function ensureHost() {
  if (host && host.isConnected) return host;
  const existed = hostCreations > 0;
  hostCreations += 1;
  if (existed) remounts += 1;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-xsched-host", "1");
  css(host, {
    all: "initial",
    position: "fixed",
    right: "16px",
    bottom: "16px",
    "z-index": "2147483647",
    display: "block",
    width: "auto",
    "max-width": "360px",
    margin: "0",
    "pointer-events": "auto",
  });
  const shadow = host.attachShadow({ mode: "open" });
  const panel = document.createElement("section");
  panel.className = "panel";
  css(panel, {
    font: "13px/1.45 ui-sans-serif, system-ui, sans-serif",
    color: "#e7e9ea",
    background: "rgba(22, 24, 28, 0.96)",
    "border-radius": "16px",
    border: "1px solid #38444d",
    "box-shadow": "0 8px 28px rgba(0, 0, 0, 0.45)",
    padding: "10px 12px 12px",
    "max-height": "72vh",
    "max-width": "344px",
    overflow: "auto",
  });
  shadow.append(panel);
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
  const now = Date.now();
  if (now - remountWindowStart > REMOUNT_WINDOW_MS) {
    remountWindowStart = now;
    remountWindowCount = 0;
    remountGaveUp = false;
  }
  remountWindowCount += 1;
  if (remountWindowCount > REMOUNT_LIMIT) {
    // X and the probe are fighting over the DOM: stop remounting rather than loop.
    remountGaveUp = true;
    return;
  }
  schedule();
}

function writeClipboard(text, button, label, fallback) {
  const done = () => {
    if (!button || !button.isConnected) return;
    button.textContent = "已複製";
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(() => { if (button.isConnected) button.textContent = label; }, 1500);
  };
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    clipboard.writeText(text).then(done, () => fallback());
    return;
  }
  fallback();
}

function showFallbackText(text) {
  const shadow = host && host.shadowRoot;
  if (!shadow) return;
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
  select.type = "button";
  select.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    try { area.focus(); area.select(); } catch { /* ignore */ }
  });
  shadow.append(area, select);
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

function render(report, items) {
  const node = ensureHost();
  const mountedNow = hostMounted(node) ? 1 : 0;
  const count = items.length;
  const effectiveCollapsed = collapsed === null ? !report.onScheduled : collapsed;
  mounted = mountedNow;

  const diag = buildDiagnostic({
    ...report,
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

  const signature = JSON.stringify([diag, effectiveCollapsed, count, report.onScheduled]);
  if (signature === lastRender && node.shadowRoot && node.shadowRoot.querySelector("section").firstChild) {
    writeDataset(node, report, count, diag);
    return;
  }
  lastRender = signature;
  lastDiag = diag;
  lastReport = report;
  lastItems = items;

  const panel = node.shadowRoot.querySelector("section");
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  const head = document.createElement("div");
  css(head, { display: "flex", "align-items": "baseline", gap: "8px" });
  const kicker = textNode("span", `xsched 探針 v${PROBE_VERSION}`, { color: "#71767b", "font-size": "11px", "letter-spacing": "0.04em", flex: "1" });
  const toggle = makeButton(effectiveCollapsed ? "展開" : "收合", "xschedToggle");
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    collapsed = !effectiveCollapsed;
    render(lastReport || report, lastItems);
  });
  head.append(kicker, toggle);
  panel.append(head);

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
  if (remountGaveUp && host && !host.isConnected) return;
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
  const now = `${location.pathname || ""}${location.search || ""}`;
  if (now !== lastLocation) {
    lastLocation = now;
    schedule();
  }
}

function start() {
  document.addEventListener("scroll", onScroll, true);
  observer = new MutationObserver((records) => {
    let hostRemoved = false;
    for (const record of records) {
      if (record.target === host || (host && host.contains && host.contains(record.target))) continue;
      for (const node of record.removedNodes) {
        if (node && node.nodeType === 1 && node.id === HOST_ID) hostRemoved = true;
      }
    }
    if (hostRemoved || !host || !host.isConnected) scheduleRemount();
    else schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-selected", "aria-current", "aria-controls", "aria-label", "hidden", "aria-hidden", "data-testid"],
  });
  window.addEventListener("popstate", schedule);
  pollId = window.setInterval(pollLocation, POLL_MS);
  lastLocation = `${location.pathname || ""}${location.search || ""}`;
  ensureHost();
  schedule();
}

function stop() {
  observer?.disconnect();
  observer = null;
  window.clearInterval(pollId);
  window.clearTimeout(timer);
  window.clearTimeout(copyTimer);
  timer = 0;
  document.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("popstate", schedule);
  accumulated = [];
  scopeElement = null;
  // Keep the host mounted across bfcache/SPA teardown; start() re-attaches the observer.
}

window.addEventListener("pagehide", stop);
window.addEventListener("pageshow", (event) => { if (event.persisted) start(); });
if (typeof document !== "undefined" && document.documentElement) start();
