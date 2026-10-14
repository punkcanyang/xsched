// Reproduce the 0.1.5 "panel is not under control" report.
// Same harness as scripts/e2e.mjs: puppeteer-core, Chrome for Testing via
// CHROME_PATH, probe/ loaded as an extension, local HTTPS fixtures presented
// as https://x.com. Drags use page.mouse down/move/up only.
//
// Three rounds of: drag the panel title, drag the Dagaz button (including
// onto the panel), toggle the panel, open and close the schedule window,
// SPA navigation, and a full reload. The boss case is a non-Scheduled page
// with the compose modal (role=dialog, not the schedule picker) open and
// the status "schedule fields not detected".

import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const PROBE = join(ROOT, "probe");
const FIXTURES = join(ROOT, "fixtures");

function executable(path) {
  try { accessSync(path, constants.X_OK); return statSync(path).isFile(); } catch { return false; }
}
function resolveChromePath() {
  if (process.env.CHROME_PATH) {
    if (!executable(process.env.CHROME_PATH)) throw new Error(`CHROME_PATH is not an executable file: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const caches = [join(tmpdir(), "cft"), process.env.PUPPETEER_CACHE_DIR || join(homedir(), ".cache", "puppeteer")];
  for (const cache of caches) {
    const unpacked = join(cache, "chrome-linux64", "chrome");
    if (executable(unpacked)) return unpacked;
    let builds = [];
    try {
      builds = readdirSync(join(cache, "chrome"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^linux-\d/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    } catch { continue; }
    for (const build of builds) {
      const path = join(cache, "chrome", build, "chrome-linux64", "chrome");
      if (executable(path)) return path;
    }
  }
  throw new Error("Chrome for Testing not installed. Set CHROME_PATH.");
}
let CHROME_PATH;
try { CHROME_PATH = resolveChromePath(); } catch (error) {
  console.error("repro-panel: FAILED — " + error.message);
  process.exit(1);
}
if (!process.env.DISPLAY && !process.env.XSCHED_E2E_REEXEC) {
  const result = spawnSync("xvfb-run", ["-a", process.execPath, SELF], {
    stdio: "inherit",
    timeout: 180000,
    env: { ...process.env, XSCHED_E2E_REEXEC: "1" },
  });
  process.exit(result.status == null ? 1 : result.status);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const findings = [];
function note(kind, detail) {
  findings.push({ kind, detail });
  console.log(`  ${kind}: ${detail}`);
}

function serveFixture(req, res) {
  let url;
  try { url = new URL(req.url || "/", "https://x.com"); } catch { res.writeHead(400).end("bad url"); return; }
  if (url.pathname === "/favicon.ico") { res.writeHead(204).end(); return; }
  const name = url.searchParams.get("fixture") || "quick-composer";
  if (!/^[a-zA-Z0-9-]+$/.test(name)) { res.writeHead(400).end("bad fixture"); return; }
  let body;
  try { body = readFileSync(join(FIXTURES, `${name}.html`), "utf8"); } catch { res.writeHead(404).end("no fixture"); return; }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}
function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.off("error", reject); resolve(server.address().port); });
  });
}

const snapExpr = `(() => {
  const host = document.getElementById('xsched-probe-root');
  const shadow = host && host.shadowRoot;
  const panel = shadow && shadow.querySelector('section');
  const shortcut = shadow && shadow.querySelector('.shortcut');
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const compose = document.getElementById('fixture-compose-modal');
  const shell = document.getElementById('fixture-compose-shell');
  const picker = document.querySelector('[role="dialog"][aria-modal="true"]:not(#fixture-compose-modal)');
  const id = window.__capId;
  return {
    path: location.pathname + location.search,
    mode: host ? host.dataset.xschedMode || '' : '',
    expanded: shortcut ? shortcut.getAttribute('aria-expanded') : null,
    panel: box(panel),
    button: box(shortcut),
    display: panel ? panel.style.display : null,
    status: shadow && shadow.querySelector('.quick-status') ? shadow.querySelector('.quick-status').textContent : '',
    panelOpen: localStorage.getItem('xsched.probe.panelOpen'),
    panelPos: localStorage.getItem('xsched.probe.panelPos'),
    pos: localStorage.getItem('xsched.probe.pos'),
    capture: panel && id != null ? panel.hasPointerCapture(id) : null,
    events: (window.__ptrLog || []).slice(),
    compose: box(compose),
    shell: box(shell),
    picker: box(picker),
    overlapsCompose: !!(panel && compose) && overlaps(panel, compose),
    overlapsShell: !!(panel && shell) && overlaps(panel, shell),
  };
  function overlaps(a, b) {
    const A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
    return A.left < B.right && A.right > B.left && A.top < B.bottom && A.bottom > B.top;
  }
})()`;

async function main() {
  const certDir = mkdtempSync(join(tmpdir(), "xsched-cert-"));
  const cert = join(certDir, "cert.pem");
  const key = join(certDir, "key.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-keyout", key, "-out", cert, "-days", "2", "-nodes", "-subj", "/CN=x.com", "-addext", "subjectAltName=DNS:x.com,DNS:www.x.com,DNS:twitter.com"], { stdio: "ignore", timeout: 10000 });
  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, serveFixture);
  const port = await listen(server);
  const profile = mkdtempSync(join(tmpdir(), "xsched-profile-"));
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      enableExtensions: true,
      protocolTimeout: 60000,
      userDataDir: profile,
      args: [
        "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        "--ignore-certificate-errors", "--allow-insecure-localhost",
        "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
        `--host-resolver-rules=MAP x.com:443 127.0.0.1:${port}, MAP www.x.com:443 127.0.0.1:${port}, MAP twitter.com:443 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE localhost`,
        "--no-proxy-server", "--disable-background-networking",
        "--window-size=1280,820",
        `--disable-extensions-except=${PROBE}`, `--load-extension=${PROBE}`,
      ],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 820 });
    page.on("pageerror", (err) => note("pageerror", err.message));
    await page.evaluateOnNewDocument(() => {
      const install = () => {
        if (!location.search.includes("compose-modal=1") || document.getElementById("fixture-compose-modal")) return;
        const form = document.getElementById("fake-composer");
        if (!form) return;
        const shell = document.createElement("div");
        shell.id = "fixture-compose-shell";
        shell.style.cssText = "position:fixed;left:24px;top:24px;width:720px;height:640px;background:#15202b;z-index:20;border:1px solid #536471;box-sizing:border-box";
        const modal = document.createElement("div");
        modal.id = "fixture-compose-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-label", "Compose");
        modal.style.cssText = "width:100%;height:100%;overflow:auto;box-sizing:border-box;padding:12px";
        form.before(shell);
        shell.append(modal);
        modal.append(form);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
      else install();
    });

    const url = "https://x.com/compose/post?fixture=quick-composer&compose-modal=1";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await waitFor(page, "panel mounted", async () => {
      const snap = await shot(page);
      return snap.panel && snap.expanded === "true" && snap.mode === "other" ? snap : null;
    });

    for (let round = 1; round <= 3; round++) {
      console.log(`\n== round ${round} ==`);
      await installTrace(page);
      const before = await shot(page);
      note("round-start", summarize(round, "before", before));
      if (!/not detected|未偵測到排程欄位|未检测到排程字段/.test(before.status)) note("status", `expected missing schedule fields, got ${JSON.stringify(before.status)}`);
      note("overlap", `before drag shell=${before.overlapsShell} compose=${before.overlapsCompose}`);

      const target = round === 2 ? { x: 860, y: 48 } : { x: 48 + round * 36, y: 40 + round * 24 };
      const dragged = await dragPanelTo(page, target.x, target.y);
      note("panel-drag", summarize(round, "after-up", dragged.after) + ` mid=${JSON.stringify(dragged.mid.panel)} follow=${JSON.stringify(dragged.followed.panel)} events=${JSON.stringify(dragged.events)}`);
      await sleep(700);
      const settled = await shot(page);
      note("panel-settled", summarize(round, "after-poll", settled));
      judgeDrag(round, before, dragged, settled, target);

      await installTrace(page);
      if (await pointCovered(page, "shortcut")) {
        note("button-onto-panel", "shortcut covered by the panel; dragging the panel clear first");
        await dragPanelTo(page, 860, 48);
      }
      const onto = await dragButtonOntoPanel(page);
      note("button-onto-panel", `from=${JSON.stringify(onto.before.button)} to=${JSON.stringify(onto.after.button)} panel=${JSON.stringify(onto.before.panel)}=>${JSON.stringify(onto.after.panel)} events=${JSON.stringify(onto.events)}`);
      if (onto.before.panel && onto.after.panel && (Math.abs(onto.before.panel.x - onto.after.panel.x) > 2 || Math.abs(onto.before.panel.y - onto.after.panel.y) > 2)) {
        note("BUG", `round ${round}: dragging Dagaz moved the panel ${JSON.stringify(onto.before.panel)} -> ${JSON.stringify(onto.after.panel)}`);
      }
      if (await pointCovered(page, "shortcut")) await clickMinimize(page);
      await dragButtonTo(page, 1100, 700);
      if ((await shot(page)).expanded !== "true") await clickShortcut(page);

      for (let i = 0; i < 3; i++) {
        const opened = (await shot(page)).expanded === "true";
        if (await pointCovered(page, "shortcut")) await clickMinimize(page);
        await clickShortcut(page);
        await sleep(250);
        const next = await shot(page);
        note("toggle", `round ${round} #${i + 1} ${opened} -> ${next.expanded} panelOpen=${next.panelOpen} visible=${Boolean(next.panel && next.panel.h > 0 && next.display !== "none")}`);
        if (next.expanded === String(opened)) note("BUG", `round ${round}: panel toggle #${i + 1} did not change aria-expanded`);
      }
      if ((await shot(page)).expanded !== "true") await clickShortcut(page);
      await sleep(200);

      if (await pointCovered(page, "schedule")) {
        const aside = await dragPanelTo(page, 900, 120);
        note("panel-aside", summarize(round, "aside", aside.after));
        judgeDrag(round, await shot(page), aside, aside.after, { x: 900, y: 120 });
      }
      try {
        await openSchedule(page);
        const scheduled = await shot(page);
        note("schedule-open", summarize(round, "picker", scheduled));
        await closeSchedule(page);
        await sleep(400);
        const closed = await shot(page);
        note("schedule-closed", summarize(round, "picker-closed", closed));
        if (closed.picker) note("BUG", `round ${round}: schedule window still present after close`);
      } catch (error) {
        note("schedule-open", `round ${round} could not open the schedule window: ${error.message}`);
      }

      const kept = await shot(page);
      await page.evaluate(() => history.pushState({}, "", "/home?fixture=quick-composer&compose-modal=1"));
      await sleep(500);
      const spa = await shot(page);
      note("spa", `round ${round} ${spa.path} mode=${spa.mode} panel=${JSON.stringify(spa.panel)} open=${spa.panelOpen}`);
      await page.evaluate(() => history.pushState({}, "", "/compose/post?fixture=quick-composer&compose-modal=1"));
      await sleep(500);
      const back = await shot(page);
      if (kept.panel && back.panel && (Math.abs(kept.panel.x - back.panel.x) > 2 || Math.abs(kept.panel.y - back.panel.y) > 2)) {
        note("BUG", `round ${round}: SPA navigation moved the panel ${JSON.stringify(kept.panel)} -> ${JSON.stringify(back.panel)}`);
      }

      const beforeReload = await shot(page);
      await page.reload({ waitUntil: "domcontentloaded" });
      const reloaded = await waitFor(page, "reload", async () => {
        const snap = await shot(page);
        return snap.panel && snap.mode === "other" ? snap : null;
      });
      note("reload", `round ${round} before=${JSON.stringify(beforeReload.panel)} after=${JSON.stringify(reloaded.panel)} panelOpen=${reloaded.panelOpen} pos=${reloaded.panelPos} expanded=${reloaded.expanded}`);
      if (beforeReload.panelPos && reloaded.panelPos !== beforeReload.panelPos) note("BUG", `round ${round}: reload rewrote panelPos ${beforeReload.panelPos} -> ${reloaded.panelPos}`);
      if (beforeReload.panel && reloaded.panel && (Math.abs(beforeReload.panel.x - reloaded.panel.x) > 2 || Math.abs(beforeReload.panel.y - reloaded.panel.y) > 2)) {
        note("BUG", `round ${round}: reload moved the visible panel ${JSON.stringify(beforeReload.panel)} -> ${JSON.stringify(reloaded.panel)} while compose modal overlaps=${reloaded.overlapsCompose}`);
      }
      if (beforeReload.panelOpen && reloaded.panelOpen !== beforeReload.panelOpen) note("BUG", `round ${round}: reload changed panelOpen ${beforeReload.panelOpen} -> ${reloaded.panelOpen}`);
    }

    const bugs = findings.filter((item) => item.kind === "BUG");
    console.log(`\nrepro-panel: ${bugs.length} uncontrolled finding(s)`);
    if (bugs.length) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    rmSync(profile, { recursive: true, force: true });
    rmSync(certDir, { recursive: true, force: true });
  }
}

function summarize(round, label, snap) {
  return `r${round} ${label} panel=${JSON.stringify(snap.panel)} open=${snap.expanded} panelOpen=${snap.panelOpen} pos=${snap.panelPos} capture=${snap.capture} shell=${snap.overlapsShell} compose=${snap.overlapsCompose} status=${JSON.stringify(snap.status)}`;
}
function judgeDrag(round, before, dragged, settled, target) {
  const dropped = dragged.after.panel;
  const events = dragged.events || [];
  const types = events.map((event) => event.t);
  const up = types.indexOf("pointerup");
  const earlyLoss = events.some((event, index) => (event.t === "pointercancel" || event.t === "lostpointercapture") && (up === -1 || index < up));
  if (earlyLoss) note("BUG", `round ${round}: pointer capture ended before pointerup (${types.join(",")}); panel ${JSON.stringify(before.panel)} -> ${JSON.stringify(dropped)}`);
  if (!dropped) { note("BUG", `round ${round}: panel missing after drag`); return; }
  if (before.panel && Math.abs(dropped.x - before.panel.x) < 4 && Math.abs(dropped.y - before.panel.y) < 4 && (Math.abs(before.panel.x - target.x) > 24 || Math.abs(before.panel.y - target.y) > 24)) {
    note("BUG", `round ${round}: panel stayed stuck at ${JSON.stringify(dropped)} instead of moving toward ${target.x},${target.y}`);
  }
  if (Math.abs(dropped.x - target.x) > 24 || Math.abs(dropped.y - target.y) > 24) {
    note("BUG", `round ${round}: release left the panel at ${JSON.stringify(dropped)} pos=${dragged.after.panelPos}, not the drop ${target.x},${target.y} (avoidance or capture pulled it back; shell=${dragged.after.overlapsShell})`);
  }
  if (settled.panel && (Math.abs(settled.panel.x - dropped.x) > 2 || Math.abs(settled.panel.y - dropped.y) > 2)) {
    note("BUG", `round ${round}: after release the poll moved the panel ${JSON.stringify(dropped)} -> ${JSON.stringify(settled.panel)}`);
  }
  if (dragged.followed?.panel && (Math.abs(dragged.followed.panel.x - dropped.x) > 2 || Math.abs(dragged.followed.panel.y - dropped.y) > 2)) {
    note("BUG", `round ${round}: after mouseup the panel still followed the cursor ${JSON.stringify(dropped)} -> ${JSON.stringify(dragged.followed.panel)}`);
  }
  if (dragged.mid.capture === false) note("BUG", `round ${round}: section lost pointer capture while the button was still down`);
}
async function shot(page) { return page.evaluate(snapExpr); }
async function installTrace(page) {
  await page.evaluate(() => {
    window.__ptrLog = [];
    window.__capId = null;
    const panel = document.getElementById("xsched-probe-root")?.shadowRoot?.querySelector("section");
    if (!panel || panel.dataset.reproTrace === "1") return;
    panel.dataset.reproTrace = "1";
    for (const type of ["pointerdown", "pointerup", "pointercancel", "lostpointercapture", "gotpointercapture"]) {
      panel.addEventListener(type, (event) => {
        window.__capId = event.pointerId;
        window.__ptrLog.push({ t: type, id: event.pointerId, cap: panel.hasPointerCapture(event.pointerId), x: event.clientX, y: event.clientY });
      }, true);
    }
  });
}
async function headerPoint(page) {
  return page.evaluate(() => {
    const header = document.getElementById("xsched-probe-root").shadowRoot.querySelector(".panel-header").getBoundingClientRect();
    const panel = document.getElementById("xsched-probe-root").shadowRoot.querySelector("section").getBoundingClientRect();
    return { x: header.left + 24, y: header.top + 14, left: panel.left, top: panel.top };
  });
}
async function dragPanelTo(page, x, y) {
  await installTrace(page);
  const start = await headerPoint(page);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + (x - start.left), start.y + (y - start.top), { steps: 16 });
  const mid = await shot(page);
  await page.mouse.up();
  await sleep(150);
  const after = await shot(page);
  await page.mouse.move(Math.min(1200, after.panel.x + 220), Math.min(760, after.panel.y + 30), { steps: 6 });
  await sleep(120);
  const followed = await shot(page);
  return { mid, after, followed, events: after.events };
}
async function pointCovered(page, kind) {
  return page.evaluate((kind) => {
    const root = document.getElementById("xsched-probe-root");
    const shadow = root?.shadowRoot;
    let x, y;
    if (kind === "shortcut") {
      const r = shadow?.querySelector(".shortcut")?.getBoundingClientRect();
      if (!r) return true;
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    } else {
      const r = document.querySelector('[data-testid="scheduleOption"]')?.getBoundingClientRect();
      if (!r || r.width < 2) return true;
      x = r.left + r.width / 2; y = r.top + r.height / 2;
    }
    const hit = document.elementFromPoint(x, y);
    const inner = hit === root ? shadow.elementFromPoint(x, y) : null;
    if (kind === "shortcut") return inner?.closest?.(".shortcut") == null;
    return Boolean(inner?.closest?.("section"));
  }, kind);
}
async function clickMinimize(page) {
  const point = await page.evaluate(() => {
    const r = document.getElementById("xsched-probe-root").shadowRoot.querySelector("[data-xsched-minimize]")?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  });
  if (!point) return;
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
}
async function dragButtonTo(page, x, y) {
  const start = await page.evaluate(() => {
    const r = document.getElementById("xsched-probe-root").shadowRoot.querySelector(".shortcut").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 14 });
  await page.mouse.up();
  await sleep(150);
}
async function dragButtonOntoPanel(page) {
  await installTrace(page);
  const before = await shot(page);
  const aim = await page.evaluate(() => {
    const panel = document.getElementById("xsched-probe-root").shadowRoot.querySelector("section").getBoundingClientRect();
    return { x: panel.left + panel.width / 2, y: panel.top + 80 };
  });
  await dragButtonTo(page, aim.x, aim.y);
  const after = await shot(page);
  return { before, after, events: after.events };
}
async function clickShortcut(page) {
  const point = await page.evaluate(() => {
    const r = document.getElementById("xsched-probe-root").shadowRoot.querySelector(".shortcut").getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
}
async function openSchedule(page) {
  const point = await page.evaluate(() => {
    const r = document.querySelector('[data-testid="scheduleOption"]').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.up();
  await waitFor(page, "schedule window", async () => (await shot(page)).picker);
}
async function closeSchedule(page) {
  await page.evaluate(() => {
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      if (dialog.id !== "fixture-compose-modal") dialog.remove();
    }
  });
}
async function waitFor(page, label, fn, timeout = 10000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (error) { last = error.message; }
    await sleep(150);
  }
  throw new Error(`timed out: ${label}; last=${String(last).slice(0, 240)}`);
}

main().catch((error) => {
  console.error("repro-panel: FAILED — " + error.stack);
  process.exit(1);
});
