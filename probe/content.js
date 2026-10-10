// xsched quick slots — independent draggable UI, native field fill, local diagnostics.
// All visible UI stays in shadow DOM. No page controls are clicked or scrolled.
(() => {
"use strict";
if (location.hostname !== "x.com" && location.hostname !== "twitter.com") return;
const { PROBE_VERSION, buildDiagnostic, mergeItems, readSnapshot, hostMounted, versionLine, formatTime, maskSample } = globalThis.XSCHED_READER;
const { buildSkeleton, SKELETON_VERSION } = globalThis.XSCHED_SKELETON;

const { stringsFor, createAuthorLink, placement, collectObstacles, clampPosition, panelPlacement, panelSize, clampPanelPosition } = globalThis.XSCHED_UI;
const positionStore = globalThis.XSCHED_POSITION;
const quick = globalThis.XSCHED_QUICK;
let quickSignature = "";
let quickStatus = "";

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
let savedPosition = positionStore.load();
let anchor = null;
let drag = null;
let suppressClick = false;
let savedPanelPosition = positionStore.loadPanel();
let panelAnchor = savedPanelPosition ? clampPanelPosition(savedPanelPosition,innerWidth,innerHeight) : null;
let panelDrag = null;
let suppressPanelClick = false;
let deferPanelSave = false; // reset previews must leave both keys deleted
let panelHeight = 0;
let panelNeedsLayout = true;

function releaseDragCapture(active) {
  try { active.target.releasePointerCapture(active.id); } catch { /* already released or disconnected */ }
}

function cancelPanelDrag() {
  if (!panelDrag) return;
  const active = panelDrag;
  panelDrag = null;
  panelAnchor = active.origin;
  suppressPanelClick = true;
  releaseDragCapture(active);
}
function persistPanel() {
  if (!panelAnchor) return;
  savedPanelPosition = {x:panelAnchor.x,y:panelAnchor.y};
  positionStore.savePanel(savedPanelPosition);
  deferPanelSave = false;
}
function cancelDrag() {
  if (!drag) return;
  const active = drag;
  drag = null;
  anchor = active.origin;
  suppressClick = true;
  // Clear state first: releasing capture may synchronously report its loss.
  releaseDragCapture(active);
}

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
  cancelDrag(); cancelPanelDrag();
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
    "max-height": "60vh",
    "max-width": "344px",
    overflow: "auto",
    "flex-direction": "column",
    gap: "8px",
  });
  panel.id = "xsched-panel";
  const shortcut = makeButton("", "xschedToggle");
  shortcut.className = "shortcut";
  css(shortcut, { position: "relative", width: "44px", height: "44px", "box-sizing":"border-box", padding: "8px", display: "grid", "place-items": "center", "pointer-events": "auto", "box-shadow": "0 4px 16px #0008", "touch-action":"none", "user-select":"none", cursor:"grab" });
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
    if (suppressClick && event.detail !== 0) { suppressClick = false; return; }
    if (!lastReport) return;
    collapsed = !(collapsed === null ? !lastReport.onScheduled : collapsed);
    render(lastReport, lastItems);
    if (!collapsed && deferPanelSave) persistPanel();
  });
  shortcut.addEventListener('pointerdown', event => {
    if (drag || panelDrag || event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    suppressClick = false;
    drag = { id:event.pointerId, target:shortcut, startX:event.clientX, startY:event.clientY, origin:{...anchor}, moved:false };
    try { shortcut.setPointerCapture(event.pointerId); } catch { /* mouse-only DOM fixtures */ }
  });
  shortcut.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX-drag.startX, dy = event.clientY-drag.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!drag.moved && Math.hypot(dx,dy)<6)) return;
    drag.moved = true;
    event.preventDefault();
    anchor = { ...clampPosition({x:drag.origin.x+dx,y:drag.origin.y+dy},innerWidth,innerHeight), clear:true };
    applyAnchor(false);
    positionUI();
  });
  shortcut.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const active = drag;
    const moved = active.moved;
    drag = null;
    if (moved) {
      suppressClick = true;
      savedPosition = {x:anchor.x,y:anchor.y};
      positionStore.save(savedPosition);
      if (deferPanelSave) persistPanel();
      applyAnchor(true);
      positionUI();
    }
    releaseDragCapture(active);
  });
  const cancel = event => {
    if (!drag || event.pointerId !== drag.id) return;
    cancelDrag();
    applyAnchor(false); positionUI();
  };
  shortcut.addEventListener('pointercancel', cancel);
  shortcut.addEventListener('lostpointercapture', cancel);
  panel.addEventListener('pointerdown', event => {
    if (!panelDrag) suppressPanelClick=false;
    const target = event.target;
    if (!target?.closest?.('.panel-header') || target.closest('button, a, input, textarea, select, [role="button"]') || drag || panelDrag
      || event.button !== 0 || event.isPrimary === false || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !panelAnchor) return;
    suppressPanelClick = false;
    panelDrag = {id:event.pointerId,target:panel,startX:event.clientX,startY:event.clientY,origin:{...panelAnchor},moved:false};
    try { panel.setPointerCapture(event.pointerId); } catch { /* DOM fixtures */ }
  });
  panel.addEventListener('pointermove', event => {
    if (!panelDrag || event.pointerId !== panelDrag.id) return;
    const dx=event.clientX-panelDrag.startX,dy=event.clientY-panelDrag.startY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (!panelDrag.moved && Math.hypot(dx,dy)<6)) return;
    panelDrag.moved=true;event.preventDefault();
    panelAnchor=clampPanelPosition({x:panelDrag.origin.x+dx,y:panelDrag.origin.y+dy},innerWidth,innerHeight);
    positionUI();
  });
  panel.addEventListener('pointerup', event => {
    if (!panelDrag || event.pointerId !== panelDrag.id) return;
    const active=panelDrag;panelDrag=null;
    if (active.moved) { suppressPanelClick=true;persistPanel();panelNeedsLayout=true;positionUI(); }
    releaseDragCapture(active);
  });
  const cancelPanel = event => {
    if (!panelDrag || event.pointerId !== panelDrag.id) return;
    cancelPanelDrag();positionUI();
  };
  panel.addEventListener('pointercancel',cancelPanel);
  panel.addEventListener('lostpointercapture',cancelPanel);
  panel.addEventListener('click',event => {
    if (suppressPanelClick && event.detail !== 0) {
      suppressPanelClick=false;event.preventDefault();event.stopImmediatePropagation();
    }
  },true);
  shadow.append(panel, shortcut);
  (document.body || document.documentElement).append(host);
  applyAnchor(false);
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
  shadow.querySelector(".panel-body").append(area);
  css(select, { "margin-top": "0" });
  shadow.querySelector(".panel-actions").append(select);
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

// This is the only writer of button coordinates. Remount reuses the same anchor.
// Automatic avoidance runs on initialization/reset/resize; a manual position wins.
function applyAnchor(recompute) {
  if (!anchor || recompute) {
    if (savedPosition) anchor = { ...clampPosition(savedPosition,innerWidth,innerHeight), clear:true };
    else {
      const obstacles = collectObstacles(document, element => getComputedStyle(element),innerWidth,innerHeight);
      const chosen = placement(innerWidth,innerHeight,obstacles);
      anchor = { ...clampPosition({x:innerWidth-chosen.right-44,y:innerHeight-chosen.bottom-44},innerWidth,innerHeight), clear:chosen.clear };
    }
  }
  // Resize can occur while X has removed the host. Update the retained anchor
  // before remount so it still fits the new viewport, without changing storage.
  if (!host?.isConnected) return;
  css(host, { left:`${anchor.x}px`, top:`${anchor.y}px`, right:'auto', bottom:'auto', visibility:anchor.clear?'visible':'hidden' });
}

// Decide the panel anchor once. Toggling, polling and button dragging only apply it.
function positionUI() {
  if (!host?.isConnected) return;
  const panel = host.shadowRoot.querySelector("section");
  const shortcut = host.shadowRoot.querySelector(".shortcut");
  const wantsOpen = !(collapsed === null ? !lastReport?.onScheduled : collapsed);
  const size=panelSize(innerWidth,innerHeight);
  css(panel,{position:'fixed',right:'auto',bottom:'auto',width:`${size.width}px`,display:wantsOpen?'flex':'none'});
  if (!wantsOpen) { shortcut.setAttribute('aria-expanded','false');return; }
  const chromeHeight=(panel.querySelector('.panel-header')?.getBoundingClientRect().height || 0)
    +(panel.querySelector('.panel-actions')?.getBoundingClientRect().height || 0)+40;
  const minimum=chromeHeight+32;
  if (!panelAnchor) {
    const obstacles=collectObstacles(document,element=>getComputedStyle(element),innerWidth,innerHeight);
    // Full 60vh keeps size reproducible after reload with only numeric x/y persisted.
    const chosen=panelPlacement(innerWidth,innerHeight,anchor,obstacles,size.height,size.height);
    if (!chosen.clear || size.height<minimum) {
      css(panel,{display:'none'});shortcut.setAttribute('aria-expanded','false');return;
    }
    panelAnchor={x:chosen.left,y:chosen.top};
    panelNeedsLayout=true;
    if (!deferPanelSave) persistPanel();
  }
  if (panelNeedsLayout) {
    panelAnchor=clampPanelPosition(savedPanelPosition || panelAnchor,innerWidth,innerHeight);
    panelHeight=size.height;
    // On resize/reload only, shorten at fixed x/y to avoid newly intersecting widgets.
    // Never reposition the panel in response to button drag, polling or mutations.
    const obstacles=collectObstacles(document,element=>getComputedStyle(element),innerWidth,innerHeight);
    for (const rect of obstacles) {
      if (panelAnchor.x<rect.right+8 && panelAnchor.x+size.width>rect.left-8 && rect.bottom>panelAnchor.y) {
        panelHeight=Math.min(panelHeight,Math.max(0,rect.top-8-panelAnchor.y));
      }
    }
    // Saved/manual coordinates win over collision avoidance. Keep the handle and
    // fixed actions visible even when shortening cannot clear a widget at this point.
    panelHeight=Math.max(Math.min(size.height,minimum),panelHeight);
    panelNeedsLayout=false;
  }
  css(panel,{left:`${panelAnchor.x}px`,top:`${panelAnchor.y}px`,height:`${panelHeight}px`,'max-height':`${size.height}px`});
  const visible=panelHeight>=minimum;
  shortcut.setAttribute('aria-expanded',String(visible));
  if (!visible) css(panel,{display:'none'});
}

function render(report, items) {
  const node = ensureHost();
  if (!node) { mounted = 0; return; }
  const mountedNow = hostMounted(node) ? 1 : 0;
  const count = items.length;
  const effectiveCollapsed = collapsed === null ? !report.onScheduled : collapsed;
  mounted = mountedNow;

  const runtime = runtimeState();
  const detected = quick.detectControls(document);
  const diag = buildDiagnostic({
    ...report,
    ...runtime,
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
  }).replace("\n", "\n" + quick.diagnostic(detected.counts) + "\n");

  const strings = stringsFor(document.documentElement.lang, navigator.language);
  const signature = JSON.stringify([diag, effectiveCollapsed, count, report.onScheduled, strings.shortcut, detected.ready, quickStatus, items.map((item) => [item.time, item.preview, formatTime(item.at)])]);
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
  css(panel, { display:effectiveCollapsed ? "none" : "flex" });
  const shortcut = node.shadowRoot.querySelector(".shortcut");
  shortcut.setAttribute("aria-expanded", String(!effectiveCollapsed));
  shortcut.setAttribute("aria-label", strings.shortcut);
  shortcut.title = strings.shortcut;
  const badge = shortcut.querySelector(".badge");
  badge.textContent = String(count);
  css(badge, { display:report.onScheduled ? "block" : "none" });

  const header = css(document.createElement("div"), { "flex-shrink":"0", "touch-action":"none", "user-select":"none", cursor:"grab" });
  header.className = "panel-header";
  const heading = css(document.createElement("div"), { display:"flex", gap:"8px", "align-items":"start" });
  const kicker = textNode("div", versionLine(runtime.manifestVersion, runtime.runtimeInvalidated), { flex:"1", "min-width":"0", color:"#8b98a5", "font-size":"11px", "word-break":"break-word" });
  kicker.className = "version";
  const minimize = makeButton(strings.collapse, "xschedMinimize");
  minimize.title = strings.collapse;
  minimize.setAttribute("aria-label", strings.collapse);
  css(minimize, { "font-size":"12px", padding:"3px 8px", "flex-shrink":"0" });
  minimize.addEventListener("click", event => {
    event.preventDefault(); event.stopPropagation();
    cancelPanelDrag();
    collapsed = true;
    render(lastReport, lastItems);
  });
  heading.append(kicker, minimize);
  const countLine = textNode("div", report.onScheduled ? `讀到 ${count} 則` : "xsched 探針：非 Scheduled 頁", { "font-size":"18px", "font-weight":"760", margin:"4px 0 0" });
  countLine.className = "count";
  header.append(heading, countLine);
  const body = css(document.createElement("div"), { "min-height":"0", overflow:"auto", "overscroll-behavior":"contain", flex:"1 1 auto" });
  body.className = "panel-body";
  const controls = css(document.createElement("div"), { display:"flex", gap:"6px", "align-items":"center", "flex-wrap":"wrap", "flex-shrink":"0", "border-top":"1px solid #38444d", "padding-top":"8px" });
  controls.className = "panel-actions";
  panel.append(header, body, controls);

  if (!effectiveCollapsed) {
    const labels = globalThis.XSCHED_UI.quickStringsFor(document.documentElement.lang,navigator.language);
    const slots = css(document.createElement('div'),{display:'flex',gap:'6px','flex-wrap':'wrap',margin:'0 0 8px'});
    slots.className = 'quick-slots';
    const status = textNode('p',quickStatus === 'filled' ? labels.filled : quickStatus === 'missing' || !detected.ready ? labels.missing : labels.ready,{color:'#ffd400',margin:'0 0 8px'});
    status.className = 'quick-status';
    status.setAttribute('role','status');
    body.append(textNode('strong',labels.heading),status,slots);
    quick.SLOT_IDS.forEach((id,index) => {
      const label = labels.slots[index];
      const button = makeButton(label);
      button.dataset.xschedSlot = id;
      button.disabled = !detected.ready;
      button.title = detected.ready ? label + ' — ' + labels.ready : labels.missing;
      button.setAttribute('aria-label',button.title);
      if (button.disabled) css(button,{opacity:'.55',cursor:'default'});
      button.addEventListener('click',event => {
        event.preventDefault();event.stopPropagation();
        if (!event.isTrusted) return;
        // Re-detect and preflight at the instant of the user's click, never reuse old controls.
        quickStatus = quick.fillSlot(document,id) ? 'filled' : 'missing';
        status.textContent = quickStatus === 'filled' ? labels.filled : labels.missing;
        schedule();
      });
      slots.append(button);
    });
    if (report.onScheduled) {
      const hint = textNode("p", "虛擬列表：請自己往下捲到底，數字才完整（本工具不會自動捲動）。", { color:"#ffd400", "font-size":"12px", margin:"0 0 8px" });
      hint.className = "hint";
      body.append(hint);
      if (count === 0) body.append(textNode("p", report.timeFail > 0 ? "看到疑似排程列，但時間格式解析不出來（格式可能改版）。" : "這一頁目前沒有解析到排程時間。", { color:"#ffd400", "font-size":"12px", margin:"0 0 8px" }));
      for (const item of items) {
        const row = css(document.createElement("div"), { padding:"6px 0", "border-top":"1px solid #2f3336" });
        const time = textNode("div", formatTime(item.at), { color:"#1d9bf0", "font-weight":"680", "word-break":"break-word" });
        time.className = "time";
        row.append(time);
        if (item.unparsed) {
          // Only reader-authenticated isolated time samples; never item.time/body.
          const sample = textNode("div", `時間樣本：${item.sample ? maskSample(item.sample) : "無可安全匯出的樣本"}`, { color:"#ffd400", "font-size":"12px", "word-break":"break-word" });
          sample.className = "sample";
          row.append(sample);
        }
        const preview = textNode("div", item.preview || "（沒有文字）", { "word-break":"break-word" });
        preview.className = "preview";
        row.append(preview);
        body.append(row);
      }
    } else {
      const go = makeButton(strings.goto, "xschedGoto");
      go.title = strings.goto;
      go.setAttribute("aria-label", strings.goto);
      go.dataset.xschedTarget = "https://x.com/compose/post/unsent/scheduled";
      go.addEventListener("click", event => {
        event.preventDefault(); event.stopPropagation();
        if (event.isTrusted) location.assign("https://x.com/compose/post/unsent/scheduled");
      });
      controls.append(go);
      body.append(textNode("p", "非 Scheduled 頁面：此頁不讀取列表，僅保留診斷與頁面結構工具。", { color:"#8b98a5", "font-size":"12px", margin:"0 0 8px" }));
    }
    const copy = makeButton("複製診斷", "xschedCopy");
    copy.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      writeClipboard(lastDiag, copy, "複製診斷", () => showFallbackText(lastDiag));
    });
    const skeleton = makeButton("複製頁面結構", "xschedSkeleton");
    skeleton.addEventListener("click", event => {
      event.preventDefault(); event.stopPropagation();
      let text;
      try { text = buildSkeleton(document, { pathname:location.pathname || "" }); }
      catch { text = `xsched-skeleton v${SKELETON_VERSION} path=other nodes=0`; }
      writeClipboard(text, skeleton, "複製頁面結構", () => showFallbackText(text));
    });
    controls.append(copy, skeleton);
    const reset = makeButton(strings.reset, 'xschedResetPosition');
    reset.title = strings.reset;
    reset.setAttribute('aria-label', strings.reset);
    reset.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      cancelDrag(); cancelPanelDrag();
      positionStore.reset(); savedPosition=null;savedPanelPosition=null;panelAnchor=null;
      deferPanelSave=true;panelNeedsLayout=true;
      applyAnchor(true); positionUI();
    });
    controls.append(reset);
    // Use the existing 12px bottom padding, outside flex layout. An extra action
    // row changes the measured minimum and can cover the independent shortcut.
    const author = css(createAuthorLink(document), { position:'absolute', right:'12px', bottom:'1px', margin:'0', font:'10px/1 ui-sans-serif, system-ui, sans-serif', color:'#8b98a5', 'text-decoration':'underline' });
    author.className = 'panel-author';
    panel.append(author);
    body.append(textNode("code", diag, { display:"block", "margin-top":"8px", color:"#8b98a5", font:"11px/1.4 ui-monospace, monospace", "white-space":"pre-wrap", "word-break":"break-all" }));
  }

  writeDataset(node, report, count, diag);
  positionUI();
}

function tick() {
  const pathname = location.pathname || "";
  const report = readSnapshot(document, { pathname });
  const detected = quick.detectControls(document);
  const detectedSignature = JSON.stringify([detected.counts,detected.ready]);
  if (detectedSignature !== quickSignature) quickStatus = "";
  quickSignature = detectedSignature;
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
  const detected = quick.detectControls(document);
  if (JSON.stringify([detected.counts,detected.ready]) !== quickSignature) schedule();
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

function onResize() {
  cancelDrag(); cancelPanelDrag();
  if (panelAnchor) panelAnchor=clampPanelPosition(savedPanelPosition || panelAnchor,innerWidth,innerHeight);
  panelNeedsLayout=true;
  applyAnchor(true); positionUI(); schedule();
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
  window.addEventListener("resize", onResize);
  pollId = window.setInterval(pollLocation, POLL_MS);
  lastLocation = `${location.pathname || ""}${location.search || ""}`;
  ensureHost();
  schedule();
}

function stop() {
  if (drag) { cancelDrag(); applyAnchor(false); }
  if (panelDrag) { cancelPanelDrag(); positionUI(); }
  observer?.disconnect();
  observer = null;
  window.clearInterval(pollId);
  pollId = 0;
  window.clearTimeout(timer);
  window.clearTimeout(copyTimer);
  timer = 0;
  document.removeEventListener("scroll", onScroll, true);
  window.removeEventListener("popstate", schedule);
  window.removeEventListener("resize", onResize);
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
