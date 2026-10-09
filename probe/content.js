// xsched gate 0 — read-only probe glue.
//
// Watches the SPA route (MutationObserver + a location poll, no history patching),
// reads the Scheduled list through reader.js, and shows a small overlay in the
// bottom-right corner. The overlay only *reads*: it never clicks, never scrolls the
// page, never sends anything anywhere. Diagnostics contain counters only.
//
// Classic script: reader.js is injected first and exposes `globalThis.XSCHED_READER`.

const { PROBE_VERSION, buildDiagnostic, classifyPath, mergeItems, readSnapshot } = globalThis.XSCHED_READER;

const HOST_ID = "xsched-probe-root";
const POLL_MS = 400;
const SETTLE_MS = 60;

const CSS = `
:host { all: initial; }
.panel {
  font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;
  color: #e7e9ea;
  background: rgba(22, 24, 28, 0.96);
  border: 1px solid #38444d;
  border-radius: 16px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  padding: 12px 14px 14px;
  max-height: 72vh;
  max-width: 340px;
  overflow: auto;
}
.head { display: flex; align-items: baseline; gap: 8px; }
.kicker { color: #71767b; font-size: 11px; letter-spacing: 0.04em; flex: 1; }
.count { font-size: 18px; font-weight: 760; margin: 4px 0 8px; }
.item { padding: 6px 0; border-top: 1px solid #2f3336; }
.time { color: #1d9bf0; font-weight: 680; word-break: break-word; }
.preview { color: #e7e9ea; word-break: break-word; }
.hint { color: #ffd400; font-size: 12px; margin: 0 0 8px; }
.muted { color: #8b98a5; font-size: 12px; margin: 0 0 8px; }
.row { display: flex; gap: 8px; align-items: center; }
button {
  appearance: none; background: #eff3f4; color: #0f1419; border: 0;
  border-radius: 999px; padding: 6px 12px; font: inherit; font-weight: 760; cursor: pointer;
}
button.ghost { background: #2f3336; color: #e7e9ea; padding: 4px 10px; }
code {
  display: block; margin-top: 8px; color: #8b98a5;
  font: 11px/1.4 ui-monospace, monospace; white-space: pre-wrap; word-break: break-all;
}
`;

let host = null;
let timer = 0;
let scrolled = 0;
let accumulated = [];
let session = "";
let collapsed = false;
let pollId = 0;
let lastLocation = "";

function ensureHost() {
  if (host && host.isConnected) return host;
  host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "fixed";
  host.style.right = "16px";
  host.style.bottom = "16px";
  host.style.zIndex = "2147483646";
  host.style.width = "320px";
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const panel = document.createElement("section");
  panel.className = "panel";
  shadow.append(style, panel);
  document.documentElement.append(host);
  return host;
}

function hide() {
  if (!host) return;
  host.remove();
  host = null;
}

function copyDiagnostic(text, button) {
  const done = () => {
    button.textContent = "已複製";
    window.setTimeout(() => { button.textContent = "複製診斷"; }, 1500);
  };
  const fallback = () => {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "readonly");
    const shadow = host && host.shadowRoot;
    if (!shadow) return;
    shadow.append(area);
    area.select();
    try { document.execCommand("copy"); } catch { /* ignore */ }
    area.remove();
    done();
  };
  const clipboard = navigator.clipboard;
  if (clipboard && typeof clipboard.writeText === "function") {
    clipboard.writeText(text).then(done, fallback);
    return;
  }
  fallback();
}

function line(text, className) {
  const node = document.createElement("div");
  node.className = className;
  node.textContent = text;
  return node;
}

function render(report, items) {
  const node = ensureHost();
  const shadow = node.shadowRoot;
  const panel = shadow.querySelector("section");
  while (panel.firstChild) panel.removeChild(panel.firstChild);

  const diag = buildDiagnostic({
    ...report,
    mounted: report.mounted,
    timeOk: items.filter((item) => item.at !== null).length,
    unparsed: items.filter((item) => item.unparsed).length,
    empty: report.onScheduled && items.length === 0 && report.timeFail === 0 ? 1 : 0,
    scrolled,
  });
  node.dataset.xschedOn = "1";
  node.dataset.xschedCount = String(items.length);
  node.dataset.xschedScrolled = scrolled ? "1" : "0";
  node.dataset.xschedDiag = diag;

  const head = document.createElement("div");
  head.className = "head";
  const kicker = line(`xsched 探針 v${PROBE_VERSION}`, "kicker");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "ghost";
  toggle.textContent = collapsed ? "展開" : "收合";
  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    collapsed = !collapsed;
    render(report, items);
  });
  head.append(kicker, toggle);
  panel.append(head);

  const count = document.createElement("div");
  count.className = "count";
  count.textContent = `讀到 ${items.length} 則`;
  panel.append(count);

  if (collapsed) return;

  if (report.needsScroll) {
    panel.append(line("虛擬列表：請自己往下捲到底，數字才完整（本工具不會自動捲動）。", "hint"));
  }
  if (items.length === 0) {
    panel.append(line(report.timeFail > 0 ? "看到疑似排程列，但時間格式解析不出來（格式可能改版）。" : "這一頁目前沒有解析到排程時間。", "hint"));
  }

  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item";
    row.append(line(item.time, "time"), line(item.preview || "（沒有文字）", "preview"));
    panel.append(row);
  }

  const controls = document.createElement("div");
  controls.className = "row";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "複製診斷";
  copy.dataset.xschedCopy = "1";
  copy.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyDiagnostic(node.dataset.xschedDiag || "", copy);
  });
  controls.append(copy);
  panel.append(controls);

  panel.append(line(diag, "muted"));
}

function tick() {
  const pathname = location.pathname || "";
  const snap = readSnapshot(document, { pathname });
  const next = `${pathname}|${snap.onScheduled}`;
  if (next !== session) {
    session = next;
    accumulated = [];
    scrolled = 0;
  }
  if (!snap.onScheduled) {
    hide();
    return;
  }
  const replace = snap.needsScroll === 0 && snap.virtualized === 0;
  accumulated = mergeItems(accumulated, snap.items, { replace });
  render(snap, accumulated);
}

function schedule() {
  window.clearTimeout(timer);
  timer = window.setTimeout(tick, SETTLE_MS);
}

function onScroll(event) {
  const target = event.target;
  if (host && target && typeof target === "object" && (target === host || host.contains(target) || target === host.shadowRoot)) return;
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
  new MutationObserver(() => schedule()).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  window.addEventListener("popstate", schedule);
  pollId = window.setInterval(pollLocation, POLL_MS);
  lastLocation = `${location.pathname || ""}${location.search || ""}`;
  schedule();
}

// A tiny test hook: lets the unit test exercise the route helper without a browser.
function isScheduledPath(pathname) {
  const kind = classifyPath(pathname);
  return kind === "scheduled";
}

if (typeof document !== "undefined" && document.documentElement) start();
