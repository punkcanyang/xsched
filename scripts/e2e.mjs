// xsched gate 0 — end-to-end proof.
//
// Loads the *real* probe extension into Chrome for Testing against a local HTTPS fixture
// server that the browser is told is https://x.com (via --host-resolver-rules), then checks:
//   - the overlay shows the right count and schedule time for every locale,
//   - a virtualized list accumulates when the *test* scrolls (the probe never scrolls),
//   - the roles-only revision still reads via the a11y layer,
//   - an empty list and the home timeline read as expected,
//   - the extension issues no network requests beyond the fixture documents.
//
// headless:false because Chrome extensions need a real profile; run under Xvfb
// (scripts re-exec themselves via `xvfb-run -a` when DISPLAY is unset).
//
//   npm run e2e

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { allowedRequest, hasExtensionInitiator } from "./network-policy.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DOCS = join(ROOT, "docs");
const PROBE = join(ROOT, "probe");
const FIXTURES = join(ROOT, "fixtures");

// Chrome needs an X server; there is none by default in this box.
if (!process.env.DISPLAY && !process.env.XSCHED_E2E_REEXEC) {
  const result = spawnSync("xvfb-run", ["-a", process.execPath, SELF], {
    stdio: "inherit",
    timeout: 180000,
    env: { ...process.env, XSCHED_E2E_REEXEC: "1" },
  });
  process.exit(result.status == null ? 1 : result.status);
}

const CHROME_PATH = process.env.CHROME_PATH || "/tmp/cft/chrome/linux-155.0.8059.39/chrome-linux64/chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let assertions = 0;
function assert(cond, msg) {
  assertions += 1;
  if (!cond) throw new Error("ASSERT: " + msg);
}

async function until(fn, label, timeout = 15000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    try {
      const value = await fn();
      if (value) return value;
      last = value;
    } catch (err) {
      last = err && err.message;
    }
    await sleep(200);
  }
  throw new Error(`timed out: ${label}; last=${String(last).slice(0, 300)}`);
}

// ── fixture server ─────────────────────────────────────────────────────────────
function serveFixture(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", "https://x.com");
  } catch {
    res.writeHead(400).end("bad url");
    return;
  }
  if (url.pathname === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  const name = url.searchParams.get("fixture")
    || (url.pathname === "/home" ? "home" : "en");
  if (!/^[a-zA-Z-]+$/.test(name)) {
    res.writeHead(400).end("bad fixture");
    return;
  }
  let body;
  try {
    body = readFileSync(join(FIXTURES, ...(["boss-skeleton", "boss-skeleton-zh-Hans", "cross-year"].includes(name) ? ["real", `${name}.html`] : [`${name}.html`])), "utf8");
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("no fixture " + name);
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

// ── read the overlay from the page ─────────────────────────────────────────────
async function probeState(page) {
  return page.evaluate(() => {
    const host = document.getElementById("xsched-probe-root");
    if (!host) return { present: false };
    const shadow = host.shadowRoot;
    const pick = (sel) => (shadow && shadow.querySelector(sel) ? shadow.querySelector(sel).textContent : "");
    return {
      present: true,
      on: host.dataset.xschedOn || "",
      mode: host.dataset.xschedMode || "",
      mounted: host.dataset.xschedMounted || "",
      remounts: Number(host.dataset.xschedRemounts || "0"),
      count: Number(host.dataset.xschedCount || "0"),
      scrolled: host.dataset.xschedScrolled || "",
      diag: host.dataset.xschedDiag || "",
      countText: pick(".count"),
      expanded: shadow?.querySelector('.shortcut')?.getAttribute('aria-expanded'),
      shortcut: Boolean(shadow?.querySelector('.shortcut svg path')),
      label: shadow?.querySelector('.shortcut')?.getAttribute('aria-label'),
      title: shadow?.querySelector('.shortcut')?.title,
      version: pick('.version'),
      target: shadow?.querySelector('[data-xsched-goto]')?.dataset.xschedTarget,
      panelVisible: shadow?.querySelector('section')?.getBoundingClientRect().height > 0,
      times: shadow ? [...shadow.querySelectorAll(".time")].map((el) => el.textContent) : [],
      hint: pick(".hint"),
      fallback: shadow && shadow.querySelector("textarea.fallback") ? shadow.querySelector("textarea.fallback").value : "",
    };
  });
}

const CASES = [
  { fixture: "en", file: "gate0.5-en.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "ja", file: "gate0.5-ja.png", count: 2, times: ["2026-07-20 16:24 (Mon)", "2026-08-03 09:05 (Mon)"] },
  { fixture: "zh-Hans", file: "gate0.5-zh-Hans.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "zh-Hant", file: "gate0.5-zh-Hant.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "ko", file: "gate0.5-ko.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "roles", file: "gate0.5-roles-fallback.png", count: 2, layer: "a11y", times: ["2026-10-16 07:30 (Fri)", "2026-10-17 18:00 (Sat)"] },
  { fixture: "empty", file: "gate0.5-empty.png", count: 0 },
];

async function main() {
  mkdirSync(DOCS, { recursive: true });

  const certDir = mkdtempSync(join(tmpdir(), "xsched-cert-"));
  const cert = join(certDir, "cert.pem");
  const key = join(certDir, "key.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048",
    "-keyout", key, "-out", cert,
    "-days", "2", "-nodes",
    "-subj", "/CN=x.com",
    "-addext", "subjectAltName=DNS:x.com,DNS:www.x.com,DNS:twitter.com,DNS:www.twitter.com",
  ], { stdio: "ignore", timeout: 10000 });

  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, serveFixture);
  let port;
  try {
    port = await listen(server, 0);
  } catch (err) {
    throw new Error(`fixture server failed: ${err}`);
  }

  const profile = mkdtempSync(join(tmpdir(), "xsched-profile-"));
  const requests = [];
  const denied = [];
  const consoleLogs = [];
  let browser;
  let failed = null;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: false,
      enableExtensions: true,
      protocolTimeout: 60000,
      userDataDir: profile,
      args: [
        "--disable-gpu",
        "--no-sandbox",
        "--disable-features=DisableLoadExtensionCommandLineSwitch",
        "--disable-dev-shm-usage",
        "--ignore-certificate-errors",
        "--allow-insecure-localhost",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        `--host-resolver-rules=MAP x.com:443 127.0.0.1:${port}, MAP www.x.com:443 127.0.0.1:${port}, MAP twitter.com:443 127.0.0.1:${port}, MAP www.twitter.com:443 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE localhost`,
        "--no-proxy-server",
        "--disable-background-networking",
        "--window-size=1100,820",
        `--disable-extensions-except=${PROBE}`,
        `--load-extension=${PROBE}`,
      ],
    });

    const page = await browser.newPage();
    const navigations = new Set();
    const userNavigations = new Set();
    const network = await page.createCDPSession();
    const contexts = new Map();
    network.on("Runtime.executionContextCreated", ({ context }) => contexts.set(context.id, context));
    network.on("Runtime.executionContextsCleared", () => contexts.clear());
    network.on("Runtime.executionContextDestroyed", ({ executionContextId }) => contexts.delete(executionContextId));
    await network.send("Runtime.enable");
    await network.send("Network.enable");
    network.on("Network.requestWillBeSent", (event) => requests.push(event));
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const allowed = allowedRequest({ url: req.url(), type: req.resourceType(), navigation: req.isNavigationRequest() && req.frame() === page.mainFrame(), userNavigation: userNavigations.has(req.url()) }, navigations);
      if (!allowed) denied.push(`${req.resourceType()} ${req.url()}`);
      void (allowed ? req.continue() : req.abort()).catch((error) => consoleLogs.push(error.message));
    });
    page.on("console", (msg) => consoleLogs.push(msg.text()));
    page.on("pageerror", (err) => consoleLogs.push("pageerror " + err.message));
    await page.setViewport({ width: 1100, height: 820 });

    // Locate the extension's isolated world on the *current* page (context ids change
    // per navigation, so this is re-run whenever we need it).
    async function findExtensionContext() {
      for (const context of contexts.values()) {
        if (context.auxData?.isDefault) continue;
        try {
          const result = await network.send("Runtime.evaluate", { contextId: context.id, expression: "typeof globalThis.XSCHED_READER !== 'undefined'", returnByValue: true });
          if (result.result.value) return context.id;
        } catch { /* context replaced mid-flight */ }
      }
      return null;
    }

    async function open(fixture, subpath = "/compose/post/unsent/scheduled") {
      const url = `https://x.com${subpath}?fixture=${encodeURIComponent(fixture)}`;
      navigations.add(url);
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      assert(response && response.status() === 200, `fixture ${fixture} did not load: ${page.url()}`);
      assert(page.url().startsWith("https://x.com/"), `not served as x.com: ${page.url()}`);
      return url;
    }

    // Proof the extension actually loaded + ran (its overlay appeared at least once).
    // We can't assert on chrome-extension:// *requests*: content-script JS is not a
    // page-level subresource, so puppeteer's request events never surface it.
    let sawOverlay = false;

    async function clickShadow(selector) {
      const handle = await page.evaluateHandle((sel) => document.getElementById('xsched-probe-root').shadowRoot.querySelector(sel), selector);
      try { await handle.asElement().click(); } finally { await handle.dispose(); }
    }
    async function toggle(expected) {
      await clickShadow('.shortcut');
      const state = await until(async () => {
        const s = await probeState(page);
        return s.expanded === String(expected) && s.panelVisible === expected ? s : null;
      }, `shortcut expanded=${expected}`);
      assert(state.label === state.title && Boolean(state.title), 'localized aria-label matches tooltip');
      return state;
    }
    async function checkNative(label) {
      const results = await page.evaluate(() => {
        const host = document.getElementById('xsched-probe-root');
        const shortcut = host.shadowRoot.querySelector('.shortcut');
        const panel = host.shadowRoot.querySelector('section');
        const rects = [shortcut, panel].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
        return [...document.querySelectorAll('.native-post, .native-fab, .native-drawer, .native-unread, .native-grok')].map((el) => {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return null;
          const hit=document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
          return { testid: el.dataset.testid || el.className, overlap: rects.some((a) => a.left < r.right && a.right > r.left && a.top < r.bottom && a.bottom > r.top), hit: el.classList.contains('native-unread') ? el.contains(hit) : hit===el };
        }).filter(Boolean);
      });
      assert(results.length === 4, `${label}: post/FAB, drawer, unread circle and Grok must be visible`);
      for (const r of results) {
        assert(!r.overlap, `${label}: shortcut/panel overlaps ${r.testid}`);
        assert(r.hit, `${label}: elementFromPoint must hit native ${r.testid}`);
      }
      const selector = await page.evaluate(() => innerWidth <= 600 ? '.native-fab' : '.native-post');
      await page.click(selector);
      assert(await page.evaluate(() => window.fixturePostClicks > 0), `${label}: physical Post click reaches native button`);
      await page.click('.native-unread'); await page.click('.native-grok');
      assert(await page.evaluate(() => window.fixtureWidgetClicks >= 2), `${label}: physical clicks reach unread/Grok controls`);
    }

    // ── 0.2 shortcut / positioning / navigation ────────────────────────────
    await open('en');
    const scheduled = await until(async () => {
      const s = await probeState(page);
      return s.count === 2 && s.expanded === 'true' ? s : null;
    }, 'shortcut Scheduled defaults open');
    assert(scheduled.shortcut && scheduled.panelVisible, 'Scheduled mounts Dagaz path and open panel');
    assert(scheduled.diag.split('\n')[0] === 'xsched probe v0.0.6 (manifest 0.0.6)', 'diagnostic first line includes both versions');
    await checkNative('desktop scheduled open');
    await page.screenshot({ path: join(DOCS, 'gate0.5-scheduled-open.png') });
    await page.screenshot({ path: join(DOCS, 'gate0.5-diag-version.png') });
    await toggle(false);
    await checkNative('desktop scheduled closed');
    await page.screenshot({ path: join(DOCS, 'gate0.5-scheduled-closed.png') });
    await page.evaluate(() => history.replaceState({}, '', '/home'));
    await until(async () => (await probeState(page)).mode === 'other', 'closed state survives SPA home');
    assert((await probeState(page)).expanded === 'false', 'explicit closed survives route change');
    await page.evaluate(() => history.replaceState({}, '', '/compose/post/unsent/scheduled'));
    await until(async () => (await probeState(page)).mode === 'scheduled', 'return Scheduled');
    assert((await probeState(page)).expanded === 'false', 'explicit closed overrides Scheduled auto default');
    await page.evaluate(() => document.getElementById('xsched-probe-root').remove());
    const shortcutRemount = await until(async () => {
      const s = await probeState(page);
      return s.remounts > 0 && s.shortcut ? s : null;
    }, 'shortcut remount');
    assert(shortcutRemount.expanded === 'false' && shortcutRemount.mounted === '1', 'remount preserves closed choice and mounted state');
    await toggle(true);
    await page.screenshot({ path: join(DOCS, 'gate0.5-remount.png') });

    await open('home', '/home');
    const home = await until(async () => {
      const s = await probeState(page);
      return s.mode === 'other' && s.expanded === 'false' ? s : null;
    }, 'shortcut home defaults closed');
    assert(home.shortcut && !home.panelVisible && home.count === 0, 'home shows only shortcut, no shortcut');
    await checkNative('desktop home closed');
    await page.screenshot({ path: join(DOCS, 'gate0.5-home-closed.png') });
    const homeOpen = await toggle(true);
    const target = 'https://x.com/compose/post/unsent/scheduled';
    assert(homeOpen.target === target, 'goto button fixed target is exact (location.assign, no href sink)');
    const homeBeforeSynthetic = page.url();
    await page.evaluate(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-goto]').click());
    await sleep(300);
    assert(page.url() === homeBeforeSynthetic, 'synthetic page click cannot trigger Scheduled navigation');
    await checkNative('desktop home open');
    await page.screenshot({ path: join(DOCS, 'gate0.5-home-open-goto-link.png') });
    for (const width of [390, 600]) {
      await page.setViewport({ width, height: 820 });
      await sleep(600);
      await checkNative(`narrow ${width} open`);
      await toggle(false);
      await checkNative(`narrow ${width} closed`);
      if (width === 390) await page.screenshot({ path: join(DOCS, 'gate0.5-narrow-fab.png') });
      await toggle(true);
    }
    await page.setViewport({ width: 1100, height: 820 });
    await sleep(600);
    // An explicit resize rechecks the anchor after expanding the lower-right drawer.
    await page.evaluate(() => Object.assign(document.querySelector('.native-drawer').style, { width: '400px', height: '620px' }));
    // Gate 0.4 intentionally keeps the anchor stable on DOM mutation. Resize is
    // an explicitly allowed auto-avoidance trigger; retain all native hit tests.
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await sleep(600);
    // The panel is now a saved independent position. Reset explicitly re-places
    // both after changing widget geometry; preserve all overlap/hit assertions.
    await clickShadow('[data-xsched-reset-position]');
    await checkNative('expanded Messages/Grok drawer');
    navigations.add(target);
    userNavigations.add(target); // test's physical click authorizes only this navigation
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), clickShadow('[data-xsched-goto]')]);
    assert(page.url() === target, 'goto physically navigates to Scheduled');
    await until(async () => (await probeState(page)).count === 2, 'goto destination reads fixture');
    console.log('  ✓ shortcut: open/close, SPA choice, remount, home navigation, desktop/narrow FAB and drawer hit tests');

    // Runtime warnings are exercised in the extension isolated world only.
    const versionContext = await findExtensionContext();
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: `
      globalThis.__originalManifest = chrome.runtime.getManifest;
      chrome.runtime.getManifest = () => ({version: '0.0.2'});
    ` });
    await until(async () => (await probeState(page)).version.includes('⚠ 版本不符'), 'manifest mismatch warning');
    assert((await probeState(page)).diag.split('\n')[0].includes('script 0.0.6 / manifest 0.0.2'), 'diagnostic mismatch warning');
    await page.screenshot({ path: join(DOCS, 'gate0.5-version-mismatch.png') });
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: `chrome.runtime.getManifest = () => { throw new Error('Extension context invalidated. private account'); };` });
    await until(async () => (await probeState(page)).version.includes('擴充已重新載入'), 'context invalidated warning');
    assert(!(await probeState(page)).diag.includes('private account'), 'runtime exception is never copied into diagnostic');
    await page.screenshot({ path: join(DOCS, 'gate0.5-runtime-invalidated.png') });
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: 'chrome.runtime.getManifest = globalThis.__originalManifest;' });
    await until(async () => (await probeState(page)).diag.startsWith('xsched probe v0.0.6 (manifest 0.0.6)'), 'runtime warning clears');

    // Reproduce an actual 0.0.2 reader/content session in another isolated world.
    // Historical sources are read from the task's base commit, never downloaded.
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: 'globalThis.XSCHED_PROBE_SESSION.dispose();' });
    const frame = await network.send('Page.getFrameTree');
    const legacy = await network.send('Page.createIsolatedWorld', { frameId: frame.frameTree.frame.id, worldName: 'xsched-fixture-legacy-0.0.2' });
    for (const file of ['reader.js', 'skeleton.js', 'content.js']) {
      const source = execFileSync('git', ['show', `d875959:probe/${file}`], { cwd: ROOT, encoding: 'utf8' });
      const result = await network.send('Runtime.evaluate', { contextId: legacy.executionContextId, expression: source });
      assert(!result.exceptionDetails, `legacy ${file} must execute`);
    }
    await until(async () => (await probeState(page)).diag.startsWith('xsched-gate0 v0.0.2'), 'actual old host visible');
    const takeover = await network.send('Runtime.evaluate', { contextId: versionContext, expression: readFileSync(join(PROBE, 'content.js'), 'utf8') });
    assert(!takeover.exceptionDetails, 'new script reinjection avoids top-level const collisions');
    await until(async () => (await probeState(page)).diag.startsWith('xsched probe v0.0.6'), 'new script takes over old UI');
    await sleep(1200); // legacy poll has run repeatedly
    assert(await page.evaluate(() => document.querySelectorAll('#xsched-probe-root').length === 1 && [...document.querySelectorAll('[data-xsched-retired]')].every((el) => el.getBoundingClientRect().height === 0)), 'one active UI; legacy stays connected and hidden');
    await page.evaluate(() => document.getElementById('xsched-probe-root').remove());
    await until(async () => (await probeState(page)).remounts > 0, 'takeover host removal recovers');
    await sleep(800);
    assert(await page.evaluate(() => document.querySelectorAll('#xsched-probe-root').length === 1), 'legacy poll never reclaims visible host after remount');
    console.log('  ✓ version: mismatch, invalidated runtime, actual 0.0.2 takeover, reinjection and remount');

    // ── locale + fallback cases ────────────────────────────────────────────────
    for (const testCase of CASES) {
      await open(testCase.fixture);
      const state = await until(async () => {
        const s = await probeState(page);
        if (!s.present || s.mode === "") return null; // mode is only written by a real render
        return s.count === testCase.count ? s : null;
      }, `${testCase.fixture}: overlay count=${testCase.count}`);

      sawOverlay = true;
      assert(state.on === "1", `${testCase.fixture}: overlay should be on`);
      if (testCase.count > 0) {
        assert(state.countText === `讀到 ${testCase.count} 則`, `${testCase.fixture}: count text "${state.countText}"`);
        for (const want of testCase.times) {
          assert(state.times.includes(want), `${testCase.fixture}: missing time "${want}" (got ${JSON.stringify(state.times)})`);
        }
      } else {
        assert(state.countText === "讀到 0 則", `${testCase.fixture}: count text "${state.countText}"`);
      }
      if (testCase.layer) {
        assert(state.diag.includes("layer=2"), `${testCase.fixture}: diag should say layer=2 (a11y): ${state.diag}`);
      }
      // Diagnostics must never carry content.
      for (const leak of ["Local", "本機", "ローカル", "로컬", "Will send", "http", "x.com"]) {
        assert(!state.diag.includes(leak), `${testCase.fixture}: diag leaked "${leak}": ${state.diag}`);
      }
      await page.screenshot({ path: join(DOCS, testCase.file) });
      console.log(`  ✓ ${testCase.fixture}: ${testCase.count} row(s)`);
    }

    // ── 0.3 short viewport: independent scrolling content, pinned actions ──
    async function checkActions(label, withGoto=false) {
      const hits=await page.evaluate(withGoto => {
        const host=document.getElementById('xsched-probe-root');
        const shadow=host.shadowRoot;
        const selectors=['[data-xsched-copy]','[data-xsched-skeleton]','[data-xsched-reset-position]',...(withGoto ? ['[data-xsched-goto]'] : [])];
        return selectors.map(selector => {
          const button=shadow.querySelector(selector);
          const r=button.getBoundingClientRect();
          const x=r.left+r.width/2, y=r.top+r.height/2;
          return {selector,visible:r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight,
            hit:document.elementFromPoint(x,y)===host && shadow.elementFromPoint(x,y)===button,
            pinned:button.closest('.panel-actions')!==null && !shadow.querySelector('.panel-body').contains(button)};
        });
      },withGoto);
      for (const result of hits) assert(result.visible && result.hit && result.pinned, `${label}: ${result.selector} visible, hit and outside scroll area`);
    }
    await page.setViewport({width:1280,height:600});
    await open('en');
    await until(async () => (await probeState(page)).count===2, 'short viewport original rows');
    await page.evaluate(() => {
      const source=document.querySelector('[data-testid="cellInnerDiv"]');
      const list=source.parentElement;
      const rows=[];
      for(let i=0;i<30;i++) {
        const row=source.cloneNode(true);
        row.querySelector('[data-testid="tweetText"]').textContent='Fake scroll row '+(i+1);
        rows.push(row);
      }
      list.replaceChildren(...rows);
    });
    await until(async () => (await probeState(page)).count===30, 'short viewport thirty fake rows');
    const scrollInfo=await page.evaluate(() => {
      const shadow=document.getElementById('xsched-probe-root').shadowRoot;
      const panel=shadow.querySelector('section'),body=shadow.querySelector('.panel-body');
      return {height:panel.getBoundingClientRect().height,max:parseFloat(getComputedStyle(panel).maxHeight),overflow:getComputedStyle(body).overflowY,scroll:body.scrollHeight,client:body.clientHeight};
    });
    assert(scrollInfo.height<=360.5 && scrollInfo.max<=360 && scrollInfo.overflow==='auto' && scrollInfo.scroll>scrollInfo.client, '1280x600: panel <=60vh with independently scrollable content');
    await checkActions('short viewport before scroll');
    await checkNative('1280x600 native avoidance');
    await page.evaluate(() => {const body=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body');body.scrollTop=body.scrollHeight;});
    assert(await page.evaluate(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body').scrollTop>0), 'panel content actually scrolls');
    await checkActions('short viewport after scroll');
    await page.screenshot({path:join(DOCS,'gate0.5-small-viewport-scroll.png')});
    await page.screenshot({path:join(DOCS,'gate0.5-avoid-native.png')});
    const actionContext=await findExtensionContext();
    assert(actionContext,'short viewport clipboard context exists');
    await network.send('Runtime.evaluate',{contextId:actionContext,expression:`
      globalThis.__scrollCopies=[];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){globalThis.__scrollCopies.push(text);return Promise.resolve();}}});
    `});
    await clickShadow('[data-xsched-copy]');await clickShadow('[data-xsched-skeleton]');
    const writes=await network.send('Runtime.evaluate',{contextId:actionContext,expression:'globalThis.__scrollCopies.length',returnByValue:true});
    assert(writes.result.value===2,'fixed actions physically click and copy while content scrolled to end');
    await clickShadow('[data-xsched-minimize]');
    await until(async () => (await probeState(page)).expanded==='false', 'explicit minimize');
    assert(!(await probeState(page)).panelVisible,'minimize leaves only shortcut');
    await page.screenshot({path:join(DOCS,'gate0.5-collapsed.png')});
    await page.evaluate(() => document.getElementById('xsched-probe-root').remove());
    await until(async () => (await probeState(page)).remounts>0, 'minimized host remount');
    assert((await probeState(page)).expanded==='false','minimized choice survives remount');
    await toggle(true);await checkActions('reexpanded short viewport');
    await checkNative('reexpanded 1280x600');
    await page.setViewport({width:1100,height:820});await sleep(600);
    await checkNative('desktop unread and drawer controls');
    await open('home','/home');await until(async () => (await probeState(page)).mode==='other','short viewport home');
    await page.setViewport({width:1280,height:600});await toggle(true);
    await checkActions('short viewport home goto',true);await checkNative('short home corner widgets');
    await page.setViewport({width:1100,height:820});

    // ── owner skeleton reconstruction: structural count proven, Chinese grammar confirmed, dates fake ──
    await open('boss-skeleton');
    const boss = await until(async () => {
      const state = await probeState(page);
      return state.mode === 'scheduled' && state.times.length === 1 ? state : null;
    }, 'owner skeleton: one visible Scheduled row');
    assert(boss.count === 1, 'owner L108 has ONE row; background cells/articles must not be counted');
    assert(boss.times[0] === '2026-11-03 23:19 (Tue)', 'confirmed Chinese format with fake date parses exact date/clock');
    assert(/timeOk=1 .*timeFail=0/.test(boss.diag), 'owner fixture: every synthetic time parsed, zero failures');
    assert(boss.diag.endsWith('\nfmt=將於 2026年11月3日 週二 下午11:19 發送'), 'success exports directly readable isolated masked format on its own line');
    await page.screenshot({ path: join(DOCS, 'gate0.5-real-skeleton-zh-Hant.png') });
    await page.evaluate(() => document.querySelector('div[aria-hidden="true"]').removeAttribute('aria-hidden'));
    await sleep(300);
    assert((await probeState(page)).count === 1, 'background visibility transition cannot add timeline posts');
    // Replace the proven standalone label with an unknown format; row count remains.
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('button')].find(el => el.querySelector('[data-testid="tweetText"]'));
      [...row.querySelectorAll('span')].find(el => !el.closest('[data-testid="tweetText"]')).textContent = 'Will send on 2027-01-01 23:59 UTC private @decoy_handle decoy@example.invalid https://fake.invalid/';
    });
    const unknown = await until(async () => {
      const state = await probeState(page);
      return state.times.includes('時間未解析') ? state : null;
    }, 'owner unknown time remains explicitly unparsed');
    assert(unknown.count === 1 && /timeFail=1/.test(unknown.diag) && /samples=(?!none)/.test(unknown.diag), 'unknown time keeps row, fail count and sample');
    const masked = await page.evaluate(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('.sample').textContent);
    assert(masked.includes('Will send on 2027-01-01 23:59'), 'unparsed row shows masked time sample beside failure');
    for (const leak of ['UTC','甲乙','private','decoy_handle','example.invalid','@','http']) assert(!masked.includes(leak), 'unparsed sample excludes body/identity: '+leak);
    await page.screenshot({ path: join(DOCS, 'gate0.5-unparsed-sample.png') });
    await open('boss-skeleton-zh-Hans');
    const hans = await until(async () => {
      const state=await probeState(page);
      return state.times[0]==='2026-11-03 23:19 (Tue)' ? state : null;
    }, 'Simplified Chinese weekday label');
    assert(hans.count===1 && /timeOk=1 .*timeFail=0/.test(hans.diag), 'Simplified Chinese single row parses correctly');
    assert(hans.diag.endsWith('fmt=将于 2026年11月3日 周二 下午11:19 发送'), 'Simplified Chinese masked fmt preserves only calendar label');
    await page.screenshot({ path: join(DOCS,'gate0.5-real-skeleton-zh-Hans.png') });

    // A legacy cell's post body cannot rescue its unrecognized time metadata.
    // Prepare a fresh scope before inserting it: virtual accumulation must not
    // retain the initial fixture rows. Update both visible and accessible time
    // labels so an unchanged aria-label cannot legitimately preserve 09:00.
    await open('en');
    await until(async () => {
      const state = await probeState(page);
      return state.count === 2 && state.times.includes('2026-10-10 09:00 (Sat)');
    }, 'legacy body: initial fixture read completed');
    const bodySetup = await page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]');
      const replacement = scope.cloneNode(true);
      const cell = replacement.querySelector('[data-testid="cellInnerDiv"]');
      const unknownTime = 'Will send on 2027-01-01 23:59 UTC';
      cell.querySelector('.when').textContent = unknownTime;
      cell.querySelector('[data-testid="tweetText"]').textContent = '將於 2026年11月3日 週二 下午11:19 發送';
      // Preserve the legacy fixture's accessible metadata + body shape, so the
      // aria parsing path must exclude the appended body date as well.
      cell.querySelector('[role="button"]').setAttribute('aria-label', unknownTime + ' ' + cell.querySelector('[data-testid="tweetText"]').textContent);
      scope.replaceWith(replacement);
      return {
        freshScope: !scope.isConnected && replacement.isConnected,
        labelsChanged: cell.querySelector('.when').textContent === unknownTime && cell.querySelector('[role="button"]').getAttribute('aria-label') === unknownTime + ' ' + cell.querySelector('[data-testid="tweetText"]').textContent,
        bodyPresent: cell.querySelector('[data-testid="tweetText"]').textContent === '將於 2026年11月3日 週二 下午11:19 發送',
      };
    });
    assert(bodySetup.freshScope, 'legacy body: replaced dialog must be a new connected scope');
    assert(bodySetup.labelsChanged, 'legacy body: both visible and accessible metadata must be unknown, with no stale 09:00');
    assert(bodySetup.bodyPresent, 'legacy body: the parseable body date must remain in the test DOM');
    // Check this scan directly, independently of content's virtual accumulation.
    const bodyContext = await until(findExtensionContext, 'legacy body: extension isolated context');
    const bodyScan = await network.send('Runtime.evaluate', { contextId: bodyContext, returnByValue: true, expression: `
      (() => {
        const report = XSCHED_READER.readSnapshot(document, { pathname: location.pathname });
        return { count: report.items.length, times: report.items.map(item => XSCHED_READER.formatTime(item.at)), l1: report.l1, l2: report.l2, timeOk: report.timeOk, timeFail: report.timeFail, samples: report.samples, fmt: report.fmt,
          diag: XSCHED_READER.buildDiagnostic({ ...report, items: report.items.length }) };
      })()
    ` });
    assert(!bodyScan.exceptionDetails && Boolean(bodyScan.result.value), 'legacy body: isolated reader scan must succeed');
    const scannedBody = bodyScan.result.value;
    assert(scannedBody.count === 1 && scannedBody.l1 === 1 && scannedBody.l2 === 1 && scannedBody.timeOk === 1 && scannedBody.timeFail === 1, `legacy body: current scan must exclude the rewritten row: ${JSON.stringify(scannedBody)}`);
    assert(scannedBody.times.length === 1 && scannedBody.times[0] === '2026-11-09 20:05 (Mon)', 'legacy body: the rewritten row must not borrow its body time');
    assert(scannedBody.samples.length === 0 && scannedBody.fmt === '', 'legacy body: body and uncertified div labels cannot become samples/fmt');
    const bodyTime = await until(async () => {
      const state = await probeState(page);
      return state.count === 1 && /\bl1=1 l2=1\b/.test(state.diag) && /\btimeFail=1\b/.test(state.diag) ? state : null;
    }, 'legacy body schedule phrase cannot become a second row');
    assert(bodyTime.times.length === 1 && bodyTime.times[0] === '2026-11-09 20:05 (Mon)', 'legacy fallback reads only the separate recognized time label');
    assert(/\btimeFail=1\b/.test(bodyTime.diag) && /\bsamples=none\nfmt=none$/.test(bodyTime.diag), 'legacy unknown metadata counts as a failure without exporting an uncertified sample');
    for (const leak of ['將於', '2026年11月3日', '11月3日', '23:19', '2026-11-03']) {
      assert(!decodeURIComponent(scannedBody.diag).includes(leak), 'legacy body date cannot enter decoded snapshot diagnostic: ' + leak);
      assert(!decodeURIComponent(bodyTime.diag).includes(leak), 'legacy body date cannot enter decoded content diagnostic: ' + leak);
    }

    await open('cross-year');
    await until(async () => (await probeState(page)).count === 2, 'cross-year structural rows');
    const yearContext = await findExtensionContext();
    assert(yearContext, 'cross-year isolated context exists');
    // Freeze extension Date only on this fake document so outside execution date
    // never changes the meaning of the missing-year scenario. No production hook.
    const frozen = await network.send('Runtime.evaluate', { contextId: yearContext, expression: `
      globalThis.__RealDate = Date;
      globalThis.Date = class extends globalThis.__RealDate {
        constructor(...args) { super(...(args.length ? args : [new globalThis.__RealDate(2026,11,31,12,0).getTime()])); }
        static now() { return new globalThis.__RealDate(2026,11,31,12,0).getTime(); }
      };
    ` });
    assert(!frozen.exceptionDetails, 'cross-year fixture clock patched in isolated test context');
    await page.evaluate(() => document.body.append(document.createElement('div')));
    const year = await until(async () => {
      const state = await probeState(page);
      return state.times[0] === '2026-12-31 23:59 (Thu)' && state.times[1] === '2027-01-01 00:05 (Fri)' ? state : null;
    }, 'missing year Dec31 to next Jan1, in chronological order');
    assert(year.count === 2 && /timeOk=2 .*timeFail=0/.test(year.diag), 'cross-year both dates/clock parsed, no failures');
    await page.screenshot({ path: join(DOCS, 'gate0.5-cross-year.png') });
    console.log('  ✓ owner skeleton: 1 modal row, background excluded, normalized synthetic time/fmt; unknown label stays counted; cross-year 2 ordered rows');

    // Instrument only the fixture's extension isolated world to observe clipboard
    // calls. No clipboard permission, page-world injection, or real account is used.
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "clipboard: initial rows");
    const extensionContext = await findExtensionContext();
    assert(extensionContext, "reader must run in an isolated extension context");
    const iconInfo = await network.send("Runtime.evaluate", {
      contextId: extensionContext,
      expression: "({icons: chrome.runtime.getManifest().icons, hasAction: Object.hasOwn(chrome.runtime.getManifest(), 'action'), url: chrome.runtime.getURL('icons/icon128.png')})",
      returnByValue: true,
    });
    const loadedIcons = iconInfo.result.value;
    assert(JSON.stringify(loadedIcons.icons) === JSON.stringify({ 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" }), "loaded extension manifest must register the four local icons");
    assert(!loadedIcons.hasAction, "logo must not introduce an action");
    // The test navigates a separate target directly to a packaged extension image.
    // Its requests are recorded separately; fixture request policy stays unchanged.
    const iconPage = await browser.newPage();
    const iconRequests = [];
    const iconDenied = [];
    try {
      await iconPage.setRequestInterception(true);
      iconPage.on("request", (req) => {
        iconRequests.push(req.url());
        const allowed = req.url() === loadedIcons.url;
        if (!allowed) iconDenied.push(req.url());
        void (allowed ? req.continue() : req.abort()).catch((error) => consoleLogs.push(error.message));
      });
      await iconPage.goto(loadedIcons.url, { waitUntil: "load", timeout: 10000 });
      assert(iconPage.url() === loadedIcons.url, "test must load the packaged chrome-extension icon URL");
      const dimensions = await iconPage.evaluate(() => {
        const image = document.querySelector("img");
        return [image?.naturalWidth, image?.naturalHeight];
      });
      assert(dimensions[0] === 128 && dimensions[1] === 128, "packaged icon128.png must decode as 128x128 in Chrome");
      // Chrome may serve extension-scheme files without page request events. The
      // URL and successful image decode prove existence; any surfaced extra request
      // is still blocked. This never exempts an extension request on the fixture.
      assert(iconRequests.every((url) => url === loadedIcons.url) && iconDenied.length === 0, `test icon target must request only its packaged image: ${JSON.stringify(iconDenied)}`);
      console.log("  ✓ Logo B: registered 4 icons, no action; packaged 128x128 resource decoded in a separate test-driven target");
    } finally { await iconPage.close(); }
    await network.send("Runtime.evaluate", { contextId: extensionContext, expression: `
      globalThis.__fixtureCopies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText(text) { globalThis.__fixtureCopies.push(text); return Promise.resolve(); }
      }});
    ` });
    await sleep(200);
    const copyCount = await network.send("Runtime.evaluate", { contextId: extensionContext, expression: "globalThis.__fixtureCopies.length", returnByValue: true });
    assert(copyCount.result.value === 0, "no clipboard call before user click");
    await page.evaluate(() => { document.getElementById("xsched-probe-root").dataset.xschedDiag = "@fake_account https://fake.example/ private body 9:00 AM"; });
    const copyButton = await page.evaluateHandle(() => document.getElementById("xsched-probe-root").shadowRoot.querySelector('[data-xsched-copy="1"]'));
    await copyButton.asElement().click();
    await copyButton.dispose();
    const copied = await network.send("Runtime.evaluate", { contextId: extensionContext, expression: "globalThis.__fixtureCopies", returnByValue: true });
    assert(copied.result.value.length === 1, "exactly one clipboard call after user click");
    assert(/^xsched probe v0\.0\.6 \(manifest 0\.0\.6\)\n(?:\w+=[\w%|.:-]* ?)+\nfmt=none$/.test(copied.result.value[0]), "copied diagnostic preserves counters and excludes uncertified legacy format text even if DOM dataset is tampered");
    console.log("  ✓ clipboard: user click only; copied counters cannot leak DOM dataset text");

    // ── 0.1: every selector broken → still mounted, 0 rows, masked samples ─────────
    await open("selectors-broken");
    const broken = await until(async () => {
      const s = await probeState(page);
      return s.present && s.mode === "scheduled" && s.mounted === "1" ? s : null;
    }, "selectors-broken: overlay mounted on a scheduled page");
    assert(broken.count === 0, `selectors-broken: expected 0 rows, got ${broken.count}`);
    assert(broken.countText === "讀到 0 則", `selectors-broken: count text "${broken.countText}"`);
    const failMatch = /timeFail=(\d+)/.exec(broken.diag);
    assert(failMatch && Number(failMatch[1]) > 0, `selectors-broken: expected timeFail>0: ${broken.diag}`);
    // samples is a percent-encoded token on the counter line; fmt is a separate
    // readable line. Stop at every whitespace boundary, including LF/CRLF.
    const sampleMatch = /(?:^|[ \t])samples=([^\s]+)/m.exec(broken.diag);
    assert(sampleMatch && sampleMatch[1] !== "none", `selectors-broken: expected masked samples: ${broken.diag}`);
    for (const encoded of sampleMatch[1].split("|")) {
      const sample = decodeURIComponent(encoded);
      assert(/^Will send on 2027-04-0[56] (?:18:30|07:15)$/.test(sample), `selectors-broken: only calendar phrase/date/clock expected "${sample}"`);
      assert(/^[\x20-\x7e]*$/.test(sample), `selectors-broken: non-ASCII in sample "${sample}"`);
      assert(Array.from(sample).length <= 60, `selectors-broken: sample exceeds cap: "${sample}"`);
    }
    for (const leak of ["Arrives", "UTC", "placeholder body"]) {
      assert(!broken.diag.includes(leak), `selectors-broken: diag leaked "${leak}": ${broken.diag}`);
    }
    await page.screenshot({ path: join(DOCS, "gate0.5-selectors-broken.png") });
    console.log("  ✓ selectors-broken: mounted, 0 rows, masked samples only");

    // ── 0.1: X's SPA redraw removes the host → the probe must re-mount it ──────
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "remount: initial rows");
    const removed = await page.evaluate(() => {
      document.getElementById("xsched-probe-root").remove();
      return !document.getElementById("xsched-probe-root");
    });
    assert(removed, "remount: test failed to remove the host");
    const remounted = await until(async () => {
      const s = await probeState(page);
      return s.present && s.remounts >= 1 ? s : null;
    }, "remount: overlay re-attached after host removal");
    assert(remounted.mounted === "1", `remount: host must be laid out, mounted=${remounted.mounted}`);
    // A wholesale body replacement (X swapping a whole subtree) must re-mount too.
    await page.evaluate(() => { document.body.replaceChildren(); });
    const remounted2 = await until(async () => {
      const s = await probeState(page);
      return s.present && s.remounts >= 2 ? s : null;
    }, "remount: overlay re-attached after body replacement");
    assert(remounted2.mounted === "1", `remount: relayed-out host after body swap, mounted=${remounted2.mounted}`);
    await sleep(3100); // start the fight with a fresh creation window
    // A hostile redraw must stay bounded and resume through polling after it stops.
    await page.evaluate(() => {
      window.fixtureRemoves = 0;
      window.fixtureHostFight = new MutationObserver(() => {
        const host = document.getElementById('xsched-probe-root');
        if (host) { window.fixtureRemoves += 1; host.remove(); }
      });
      window.fixtureHostFight.observe(document.body, { childList: true });
      document.getElementById('xsched-probe-root').remove();
    });
    await sleep(1000);
    const fighting = await page.evaluate(() => {
      window.fixtureHostFight.disconnect();
      return window.fixtureRemoves;
    });
    assert(fighting <= 3, `remount: at most 3 creations per window, got ${fighting}`);
    assert(fighting > 0, 'remount: adversarial redraw must actually exercise retry creation');
    await until(async () => {
      const s = await probeState(page);
      return s.present && s.mounted === '1';
    }, 'remount: polling recovers after repeated redraws stop', 6000);
    await page.evaluate(() => document.getElementById('xsched-probe-root').style.setProperty('display', 'none', 'important'));
    await until(async () => (await probeState(page)).mounted === '0', 'mounted: hidden host reports zero');
    assert(await page.evaluate(() => getComputedStyle(document.getElementById('xsched-probe-root')).display === 'none'), 'mounted: placement must preserve the hidden host display');
    assert(/\bmounted=0\b/.test((await probeState(page)).diag), 'mounted: diagnostic must reflect the hidden host');
    await page.evaluate(() => document.getElementById('xsched-probe-root').style.setProperty('display', 'block', 'important'));
    await until(async () => (await probeState(page)).mounted === '1', 'mounted: visible host reports one');
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "remount: fixture restored");
    console.log("  ✓ remount: host/body removal; bounded retries recover through polling; mounted tracks layout");

    // ── 0.1: "copy page structure" yields a content-free skeleton ──────────────
    const skeletonContext = await findExtensionContext();
    assert(skeletonContext, "skeleton: extension isolated world lost");
    await network.send("Runtime.evaluate", { contextId: skeletonContext, expression: `
      globalThis.__fixtureCopies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText(text) { globalThis.__fixtureCopies.push(text); return Promise.resolve(); }
      }});
    ` });
    const skeletonButton = await page.evaluateHandle(() => document.getElementById("xsched-probe-root").shadowRoot.querySelector('[data-xsched-skeleton="1"]'));
    await skeletonButton.asElement().click();
    await skeletonButton.dispose();
    const skeletonCopies = await network.send("Runtime.evaluate", { contextId: skeletonContext, expression: "globalThis.__fixtureCopies", returnByValue: true });
    assert(skeletonCopies.result.value.length === 1, `skeleton: expected one clipboard write, got ${skeletonCopies.result.value.length}`);
    const skeleton = skeletonCopies.result.value[0];
    assert(/^xsched-skeleton v0\.0\.6 path=scheduled nodes=\d+\n/.test(skeleton), `skeleton header wrong: ${skeleton.slice(0, 90)}`);
    assert(skeleton.includes("role=dialog"), `skeleton must keep the allow-listed role enum:\n${skeleton.slice(0, 300)}`);
    for (const leak of ["Will send", "Oct 10", "9:00", "Local fixture", "morning product", "weekly recap", "Unsent posts", "Drafts", "fixture"]) {
      assert(!skeleton.includes(leak), `skeleton leaked "${leak}"`);
    }
    writeFileSync(join(DOCS, "gate0.5-skeleton-sample.txt"), skeleton + "\n");
    await page.screenshot({ path: join(DOCS, "gate0.5-skeleton-copied.png") });
    // The clipboard may be denied; then the overlay must offer the readonly textarea.
    await network.send("Runtime.evaluate", { contextId: skeletonContext, expression: `
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText() { return Promise.reject(new Error('denied')); } } });
    ` });
    const retry = await page.evaluateHandle(() => document.getElementById("xsched-probe-root").shadowRoot.querySelector('[data-xsched-skeleton="1"]'));
    await retry.asElement().click();
    await retry.dispose();
    const fallbackState = await until(async () => {
      const s = await probeState(page);
      return s.fallback ? s : null;
    }, "skeleton: clipboard-denied fallback textarea");
    assert(/^xsched-skeleton v0\.0\.6 path=scheduled nodes=\d+/.test(fallbackState.fallback), "fallback textarea must hold the skeleton");
    const select = await page.evaluateHandle(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-select]'));
    await select.asElement().click();
    await select.dispose();
    const selected = await page.evaluate(() => {
      const area = document.getElementById('xsched-probe-root').shadowRoot.querySelector('textarea.fallback');
      return area.selectionStart === 0 && area.selectionEnd === area.value.length;
    });
    assert(selected, 'fallback: user can select the entire skeleton');
    await page.screenshot({ path: join(DOCS, "gate0.5-skeleton-fallback.png") });
    console.log("  ✓ skeleton: content-free map copied; textarea fallback when clipboard is denied");

    // ── virtualized list: the TEST scrolls, the probe only accumulates ──────────
    await open("virtual");
    const before = await until(async () => {
      const s = await probeState(page);
      return s.present && s.count === 3 ? s : null;
    }, "virtual: initial window of 3");
    assert(before.scrolled === "0", "virtual: probe must not have scrolled on its own");
    assert(before.diag.includes("virtualized=1"), `virtual: expected virtualized=1: ${before.diag}`);
    assert(before.hint.includes("請自己往下捲"), `virtual: expected the do-not-auto-scroll hint: ${before.hint}`);
    await page.screenshot({ path: join(DOCS, "gate0.5-virtual-before.png") });

    await page.evaluate(() => {
      const list = document.getElementById("sched-list");
      list.scrollTop = list.scrollHeight; // the user scrolls to the bottom
    });
    const after = await until(async () => {
      const s = await probeState(page);
      return s.present && s.count === 6 ? s : null;
    }, "virtual: accumulated 6 after scroll");
    assert(after.scrolled === "1", "virtual: probe should mark the session as scrolled");
    for (const want of [
      "2026-12-01 07:00 (Tue)",
      "2026-12-01 12:30 (Tue)",
      "2026-12-02 20:00 (Wed)",
      "2026-12-03 09:15 (Thu)",
      "2026-12-04 18:45 (Fri)",
      "2026-12-05 11:30 (Sat)",
    ]) {
      assert(after.times.includes(want), `virtual: missing accumulated time "${want}"`);
    }
    await page.screenshot({ path: join(DOCS, "gate0.5-virtual-after.png") });
    console.log("  ✓ virtual: 3 → 6 rows after a test-driven scroll");

    await page.evaluate(() => {
      // Keep the reader's dialog scope, but remove the fixture's scroll listener:
      // shrinking scrollHeight otherwise triggers its deliberate window-0 rebuild.
      const list = document.getElementById("sched-list");
      list.replaceWith(list.cloneNode(true));
      const track = document.getElementById("sched-track");
      window.fixtureVirtualRows = [...track.children].map((row) => row.cloneNode(true));
      track.replaceChildren();
    });
    await until(async () => (await probeState(page)).count === 0, "virtual: same-scope empty list clears accumulation");
    await page.evaluate(() => document.getElementById("sched-track").append(...window.fixtureVirtualRows));
    await until(async () => (await probeState(page)).count === 3, "virtual: repopulated scope starts from 3");
    console.log("  ✓ virtual empty reset: 6 → 0 → 3 in the same scope");

    // Same route, entirely new list scope: previously seen virtual rows must clear.
    await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      const replacement = dialog.cloneNode(true);
      replacement.querySelector("#sched-track").replaceChildren();
      dialog.replaceWith(replacement);
    });
    await until(async () => (await probeState(page)).count === 0, "virtual: new empty scope clears old rows");
    console.log("  ✓ virtual reset: 3 → 0 on list replacement");

    // Attribute-only tab switch and SPA route switch (no patched page history).
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "SPA: initial Scheduled");
    await page.evaluate(() => document.querySelector('[role="tab"][aria-selected="true"]').setAttribute("aria-selected", "false"));
    await until(async () => (await probeState(page)).mode === "other", "SPA: deselected tab turns the overlay into a shortcut");
    await page.evaluate(() => document.querySelectorAll('[role="tab"]')[1].setAttribute("aria-selected", "true"));
    await until(async () => (await probeState(page)).count === 2, "SPA: selected tab restores overlay");
    await page.evaluate(() => history.replaceState({}, "", "/home"));
    await until(async () => (await probeState(page)).mode === "other", "SPA: route poll turns the overlay into a shortcut on home");
    await page.evaluate(() => history.replaceState({}, "", "/compose/post/unsent/scheduled"));
    await until(async () => (await probeState(page)).count === 2, "SPA: route poll restores overlay");
    console.log("  ✓ SPA: attribute-only tabs and route changes");

    // Stable DOM must keep the same button (no observer/render loop). Continuous
    // changes faster than SETTLE_MS must still produce an updated count.
    const stable = await page.evaluate(async () => {
      const button = document.getElementById("xsched-probe-root").shadowRoot.querySelector("button");
      await new Promise((resolve) => setTimeout(resolve, 300));
      return button === document.getElementById("xsched-probe-root").shadowRoot.querySelector("button");
    });
    assert(stable, "stable DOM should not continuously replace overlay controls");
    await page.evaluate(() => {
      const list = document.getElementById("sched-list");
      const row = list.firstElementChild.cloneNode(true);
      row.querySelector('[data-testid="tweetText"]').textContent = "Mutation burst fake row";
      list.append(row);
      window.fixtureBurst = setInterval(() => document.querySelector(".banner").textContent = String(Date.now()), 10);
    });
    try {
      await until(async () => (await probeState(page)).count === 3, "continuous mutations cannot starve reader", 2000);
    } finally { await page.evaluate(() => clearInterval(window.fixtureBurst)); }
    console.log("  ✓ mutations: stable controls and bounded throttle");

    // A composer chip inside a Scheduled dialog must not turn into a third row.
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "chip: initial rows");
    await page.evaluate(() => {
      const form = document.createElement("form");
      const chip = document.createElement("div");
      chip.setAttribute("role", "button");
      chip.textContent = "Will send on Oct 20, 2026 at 1:00 PM";
      form.append(chip);
      document.querySelector('[role="dialog"]').append(form);
    });
    await sleep(200);
    assert((await probeState(page)).count === 2, "composer chip must not count as list row");
    console.log("  ✓ composer chip: excluded from Scheduled rows");

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    await sleep(500);
    const afterHide = await probeState(page);
    assert(afterHide.present && afterHide.mode === "scheduled", "pagehide stops timers/observer but keeps the overlay mounted (deliberate)");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await until(async () => (await probeState(page)).count === 2, "bfcache restore restarts probe");
    assert((await probeState(page)).count === 2, "bfcache restore reconstructs current rows without stale state");
    console.log("  ✓ lifecycle: pagehide cleanup and bfcache restart");

    // ── home timeline: shortcut stays closed and reads nothing ─────────────────────────
    await open("home", "/home");
    await sleep(900);
    const homeState = await probeState(page);
    assert(homeState.present && homeState.mode === "other" && homeState.count === 0, `home: overlay should be a 0-row shortcut, got ${JSON.stringify(homeState)}`);
    assert(homeState.countText === "xsched 探針：非 Scheduled 頁", `home: shortcut text was "${homeState.countText}"`);
    await page.screenshot({ path: join(DOCS, "gate0.5-not-scheduled.png") });
    console.log("  ✓ home: 0 rows (shortcut stays mounted off the Scheduled page)");

    for (const subpath of ["/home", "/compose/post/unsent/drafts", "/compose/post/schedule"]) {
      await open("en", subpath); // intentionally contains a selected Scheduled tab
      await sleep(500);
      const state = await probeState(page);
      assert(state.present && state.mode === "other", `${subpath}: selected tab must not override route (mode=${state.mode})`);
    }
    console.log("  ✓ non-Scheduled: home, Drafts, picker with adversarial selected tabs");

    // ── 0.4: immutable anchor, foreign widgets, dragging and numeric persistence ──
    const baselineManifest=JSON.parse(execFileSync('git',['show','93ed233:probe/manifest.json'],{encoding:'utf8'}));
    const currentManifest=JSON.parse(readFileSync(join(PROBE,'manifest.json'),'utf8'));
    for(const field of ['permissions','host_permissions','web_accessible_resources']) assert(JSON.stringify(currentManifest[field])===JSON.stringify(baselineManifest[field]),'0.0.5 baseline manifest unchanged: '+field);
    assert(JSON.stringify(currentManifest.content_scripts[0].matches)===JSON.stringify(baselineManifest.content_scripts[0].matches),'no new content-script hosts');
    await page.setViewport({width:1100,height:820});
    await open('extensions');
    await until(async () => (await probeState(page)).expanded==='true','foreign-widget fixture initially open');
    async function buttonRect() {
      return page.evaluate(()=>{
        const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.shortcut').getBoundingClientRect();
        return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      });
    }
    async function panelRect() {
      return page.evaluate(()=>{
        const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector('section').getBoundingClientRect();
        return {x:r.x,y:r.y,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
      });
    }
    const automatic=await buttonRect();
    const foreign=await page.evaluate(()=>{
      const host=document.getElementById('xsched-probe-root'),r=host.shadowRoot.querySelector('.shortcut').getBoundingClientRect();
      return [...document.querySelectorAll('.other-extension-square, .other-extension-round')].map(el=>{
        const b=el.getBoundingClientRect();
        return {parent:el.parentElement.tagName,overlap:r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top,hit:document.elementFromPoint(b.left+b.width/2,b.top+b.height/2)===el};
      });
    });
    assert(foreign.length===2 && foreign.some(el=>el.parent==='BODY') && foreign.some(el=>el.parent==='HTML'),'two fake extensions injected at body and documentElement');
    for(const widget of foreign) assert(!widget.overlap && widget.hit,'foreign fixed button unobstructed and clickable');
    await page.click('.other-extension-square');await page.click('.other-extension-round');
    assert(await page.evaluate(()=>window.fixtureOtherClicks===2),'physical clicks reach both foreign extension widgets');
    assert(await page.evaluate(()=>{
      const shadow=document.getElementById('xsched-probe-root').shadowRoot;
      return !shadow.querySelector('[role="tooltip"], .tooltip') && shadow.querySelector('.shortcut').title===shadow.querySelector('.shortcut').getAttribute('aria-label');
    }),'uses native title only, with localized aria-label; no custom tooltip');
    await page.screenshot({path:join(DOCS,'gate0.5-avoid-extensions.png')});
    await page.mouse.move(automatic.x+automatic.width/2,automatic.y+automatic.height/2);
    await sleep(800);
    await page.screenshot({path:join(DOCS,'gate0.5-tooltip.png')});
    assert(await page.evaluate(()=>window.localStorage.getItem('xsched.probe.pos')===null),'automatic placement never persists page data');
    // Resize interrupts a real captured pointer, releasing it before mouseup.
    const expandedBeforeCancel=(await probeState(page)).expanded;
    await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.shortcut').addEventListener('pointerdown', event=>{window.fixtureDragPointerId=event.pointerId;},{once:true}));
    await page.mouse.move(automatic.x+automatic.width/2,automatic.y+automatic.height/2);
    await page.mouse.down();await page.mouse.move(automatic.x+automatic.width/2-12,automatic.y+automatic.height/2,{steps:3});
    assert(await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.shortcut').hasPointerCapture(window.fixtureDragPointerId)),'active physical drag owns pointer capture');
    await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    assert(await page.evaluate(()=>!document.getElementById('xsched-probe-root').shadowRoot.querySelector('.shortcut').hasPointerCapture(window.fixtureDragPointerId)),'resize immediately releases drag capture before pointerup');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(automatic),'cancelled drag restores the automatic anchor without saving');
    await page.mouse.up();
    assert((await probeState(page)).expanded===expandedBeforeCancel && await page.evaluate(()=>window.localStorage.getItem('xsched.probe.pos')===null),'cancelled drag cannot toggle panel or persist a position');
    const panelBeforeButtonDrag=await panelRect();
    const expandedBeforeDrag=(await probeState(page)).expanded;
    await page.mouse.move(automatic.x+automatic.width/2,automatic.y+automatic.height/2);
    await page.mouse.down();await page.mouse.move(242,142,{steps:15});await page.mouse.up();
    const dragged=await until(async()=>{
      const r=await buttonRect();return r.x===220&&r.y===120?r:null;
    },'pointer drag moves button to user anchor');
    assert((await probeState(page)).expanded===expandedBeforeDrag,'drag compatibility click cannot toggle panel');
    assert(JSON.stringify(await panelRect())===JSON.stringify(panelBeforeButtonDrag),'open panel exact rectangle never follows button drag');
    await page.screenshot({path:join(DOCS,'gate0.5-button-dragged.png')});
    const saved=await page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.pos')));
    assert(Object.keys(saved).sort().join(',')==='x,y' && Object.values(saved).every(value=>typeof value==='number'&&Number.isFinite(value)) && saved.x===220 && saved.y===120,'fixed xsched key stores exactly numeric x/y');
    await page.reload({waitUntil:'domcontentloaded'});
    await until(async()=> (await probeState(page)).expanded==='true','dragged reload mounted');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(dragged),'reload preserves exact dragged button rectangle');
    await page.screenshot({path:join(DOCS,'gate0.5-dragged-reload.png')});
    // X may redraw away the host just before the viewport changes.
    await page.evaluate(()=>document.getElementById('xsched-probe-root').remove());
    await page.setViewport({width:180,height:150});await sleep(600);
    const clamped=await buttonRect();
    assert(clamped.left>=0&&clamped.top>=0&&clamped.right<=180&&clamped.bottom<=150,'resize clamps manual anchor inside viewport');
    assert(await page.evaluate(()=>window.localStorage.getItem('xsched.probe.pos')===JSON.stringify({x:220,y:120})),'resize does not overwrite original saved preference');
    await page.setViewport({width:1100,height:820});await sleep(600);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(dragged),'larger viewport restores original saved position');
    await clickShadow('[data-xsched-reset-position]');
    assert(await page.evaluate(()=>window.localStorage.getItem('xsched.probe.pos')===null),'reset removes only the position key');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(automatic),'reset returns to automatically avoided default');
    await page.screenshot({path:join(DOCS,'gate0.5-reset.png')});
    await toggle(false);const noModalClosed=await buttonRect();
    await toggle(true);assert(JSON.stringify(await buttonRect())===JSON.stringify(noModalClosed),'no modal: toggle keeps exact button rectangle');
    await page.screenshot({path:join(DOCS,'gate0.5-no-modal-open.png')});
    await page.evaluate(()=>{
      const backdrop=document.createElement('div');backdrop.className='fixture-draft-backdrop';
      Object.assign(backdrop.style,{position:'fixed',inset:'0',background:'#0008',zIndex:'10000'});
      const modal=document.createElement('div');modal.className='fixture-draft-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
      Object.assign(modal.style,{position:'fixed',right:'70px',bottom:'48px',width:'400px',height:'420px',background:'#202327',zIndex:'10001'});
      const button=document.createElement('button');button.textContent='Fake draft control';Object.assign(button.style,{position:'absolute',right:'16px',bottom:'16px'});modal.append(button);
      document.body.append(backdrop,modal);
    });
    await sleep(600);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(noModalClosed),'opening X draft modal cannot auto-move anchor');
    await toggle(false);const modalClosed=await buttonRect();
    await page.screenshot({path:join(DOCS,'gate0.5-modal-closed.png')});
    await toggle(true);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(modalClosed),'with full-screen backdrop and dialog control: toggle keeps exact rectangle');
    assert(await page.evaluate(()=>{
      const host=document.getElementById('xsched-probe-root');
      return ['BODY','HTML'].includes(host.parentElement.tagName)&&!host.closest('[role="dialog"]')&&getComputedStyle(host).position==='fixed';
    }),'host stays fixed at body/html level, never inside X dialog');
    await page.screenshot({path:join(DOCS,'gate0.5-modal-open.png')});
    await page.evaluate(()=>{document.querySelector('.fixture-draft-modal').remove();document.querySelector('.fixture-draft-backdrop').remove();});
    await sleep(600);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(modalClosed),'closing modal cannot move anchor');
    console.log('  ✓ gate0.4: foreign widgets, native title, drag/reload, clamp/reset, immutable modal/no-modal anchor');

    // ── 0.5: drag panel/header; both independent stored positions ──────────────
    // Keep the previous gate's full button/foreign-widget/capture assertions above.
    await clickShadow('[data-xsched-reset-position]');
    assert(await page.evaluate(()=>['xsched.probe.pos','xsched.probe.panelPos'].every(key=>window.localStorage.getItem(key)===null)),'reset leaves both position keys deleted, including subsequent poll');
    const defaultButton=await buttonRect(),defaultPanel=await panelRect();
    const buttonsBefore=await page.evaluate(()=>[...document.getElementById('xsched-probe-root').shadowRoot.querySelectorAll('button')].map(el=>el.textContent));
    const header=await page.evaluate(()=>{
      const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-header').getBoundingClientRect();
      return {x:r.left+20,y:r.top+14};
    });
    await page.mouse.move(header.x,header.y);await page.mouse.down();
    await page.mouse.move(header.x+100-defaultPanel.x,header.y+80-defaultPanel.y,{steps:16});await page.mouse.up();
    const panelDragged=await panelRect();
    assert(panelDragged.x===100&&panelDragged.y===80,'header drag stores independent panel top-left');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(defaultButton),'panel drag never changes exact button rectangle');
    assert((await probeState(page)).expanded==='true','header drag cannot collapse or activate any action');
    assert(JSON.stringify(await page.evaluate(()=>[...document.getElementById('xsched-probe-root').shadowRoot.querySelectorAll('button')].map(el=>el.textContent)))===JSON.stringify(buttonsBefore),'header drag cannot trigger clipboard/reset/minimize actions');
    await page.screenshot({path:join(DOCS,'gate0.5-panel-dragged.png')});
    // Button drag with panel already manually positioned must preserve full panel rect.
    const beforeSecondButton=await buttonRect();
    await page.mouse.move(beforeSecondButton.x+22,beforeSecondButton.y+22);await page.mouse.down();
    await page.mouse.move(522,122,{steps:14});await page.mouse.up();
    const buttonDragged=await buttonRect();
    assert(buttonDragged.x===500&&buttonDragged.y===100,'button is independently dragged after panel');
    assert(JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'manually positioned panel exact rect stays unchanged during button drag');
    await page.screenshot({path:join(DOCS,'gate0.5-button-dragged.png')});
    const keys=await page.evaluate(()=>['xsched.probe.pos','xsched.probe.panelPos'].map(key=>({key,value:JSON.parse(window.localStorage.getItem(key))})));
    for(const entry of keys) assert(entry.key.startsWith('xsched.')&&Object.keys(entry.value).sort().join(',')==='x,y'&&Object.values(entry.value).every(value=>typeof value==='number'&&Number.isFinite(value)),'each fixed xsched key stores exactly finite numeric x/y');
    assert(JSON.stringify(keys.map(entry=>entry.value))===JSON.stringify([{x:500,y:100},{x:100,y:80}]),'button and panel use two distinct keys/coordinates');
    await toggle(false);await toggle(true);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(buttonDragged)&&JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'close/reopen keeps both exact rectangles');
    // Poll and a page mutation/modal may change diagnostics, never either anchor.
    await page.evaluate(()=>{const modal=document.createElement('div');modal.className='fixture-panel-modal';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');Object.assign(modal.style,{position:'fixed',right:'0',bottom:'0',width:'300px',height:'240px'});document.body.append(modal);});
    await sleep(650);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(buttonDragged)&&JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'poll and modal mutation keep independent rectangles');
    await page.evaluate(()=>document.querySelector('.fixture-panel-modal').remove());
    await page.reload({waitUntil:'domcontentloaded'});await until(async()=> (await probeState(page)).expanded==='true','two independent positions reloaded');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(buttonDragged)&&JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'reload restores exact button and panel rectangles');
    await page.screenshot({path:join(DOCS,'gate0.5-reload-both.png')});
    // Starting on the header's minimize button must never take panel capture.
    const minimize=await page.evaluate(()=>{
      const shadow=document.getElementById('xsched-probe-root').shadowRoot;
      const button=shadow.querySelector('[data-xsched-minimize]'),panel=shadow.querySelector('section');
      button.addEventListener('pointerdown',event=>{window.fixturePanelButtonPointer=event.pointerId;},{once:true});
      const r=button.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
    });
    await page.mouse.move(minimize.x,minimize.y);await page.mouse.down();
    assert(await page.evaluate(()=>!document.getElementById('xsched-probe-root').shadowRoot.querySelector('section').hasPointerCapture(window.fixturePanelButtonPointer)),'header button press cannot acquire panel drag capture');
    await page.mouse.move(minimize.x-60,minimize.y+60,{steps:6});await page.mouse.up();
    assert(JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'drag starting on header button cannot move panel');
    await clickShadow('[data-xsched-minimize]');await until(async()=> (await probeState(page)).expanded==='false','minimize still physically clickable');
    await toggle(true);
    assert(JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'minimize/reopen retains independent panel');
    await page.evaluate(()=>{
      window.localStorage.setItem('xsched.probe.pos',JSON.stringify({x:5000,y:5000}));
      window.localStorage.setItem('xsched.probe.panelPos',JSON.stringify({x:5000,y:5000}));
    });
    await page.reload({waitUntil:'domcontentloaded'});await until(async()=> (await probeState(page)).count===2,'offscreen saved positions loaded');
    await page.setViewport({width:390,height:600});await sleep(650);
    const clampedButton=await buttonRect();
    assert(clampedButton.width===44&&clampedButton.left>=0&&clampedButton.right<=390&&clampedButton.top>=0&&clampedButton.bottom<=600,'offscreen saved button clamps within viewport');
    // Saved coordinates win over widgets, but the actual header must remain visible
    // and grab-able; a hidden panel with clamped style numbers cannot pass.
    const clampStyle=await page.evaluate(()=>{
      const panel=document.getElementById('xsched-probe-root').shadowRoot.querySelector('section');
      const h=panel.querySelector('.panel-header').getBoundingClientRect(),shadow=panel.getRootNode(),host=shadow.host;
      return {x:parseFloat(panel.style.left),y:parseFloat(panel.style.top),width:parseFloat(panel.style.width),visible:h.width>0&&h.height>0&&h.top>=0&&h.bottom<=innerHeight,hit:document.elementFromPoint(h.left+20,h.top+14)===host&&panel.contains(shadow.elementFromPoint(h.left+20,h.top+14))};
    });
    assert(clampStyle.x>=0&&clampStyle.x+clampStyle.width<=390&&clampStyle.y>=0&&clampStyle.y+44<=600&&clampStyle.visible&&clampStyle.hit,'offscreen saved panel clamps header within viewport');
    assert(await page.evaluate(()=>['xsched.probe.pos','xsched.probe.panelPos'].every(key=>window.localStorage.getItem(key)===JSON.stringify({x:5000,y:5000}))),'clamp never overwrites either original preference');
    await page.screenshot({path:join(DOCS,'gate0.5-clamped.png')});
    await page.setViewport({width:1100,height:820});await sleep(650);
    // Restore visible user positions so the reset action itself can be hit physically.
    await page.evaluate(()=>{
      window.localStorage.setItem('xsched.probe.pos',JSON.stringify({x:500,y:100}));
      window.localStorage.setItem('xsched.probe.panelPos',JSON.stringify({x:100,y:80}));
    });
    await page.reload({waitUntil:'domcontentloaded'});await until(async()=> (await probeState(page)).expanded==='true','visible reset action restored');
    await clickShadow('[data-xsched-reset-position]');await sleep(650);
    assert(await page.evaluate(()=>['xsched.probe.pos','xsched.probe.panelPos'].every(key=>window.localStorage.getItem(key)===null)),'reset and later polling delete both fixed keys');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(defaultButton)&&JSON.stringify(await panelRect())===JSON.stringify(defaultPanel),'reset restores both automatic default rectangles');
    await page.screenshot({path:join(DOCS,'gate0.5-reset-both.png')});
    console.log('  ✓ gate0.5: independent header/button drags, button exclusion, exact toggles/reload, clamping and two-key reset');

    // ── network discipline ─────────────────────────────────────────────────────
    assert(denied.length === 0, `unexpected request(s) blocked: ${denied.join(", ")}`);
    for (const event of requests) {
      assert(allowedRequest({ url: event.request.url, type: event.type, navigation: event.type === "Document", extensionInitiator: hasExtensionInitiator(event.initiator), userNavigation: userNavigations.has(event.request.url) }, navigations), `unexpected request or extension initiator: ${event.type} ${event.request.url}`);
    }
    // The overlay only exists if the content script ran, which only happens if the
    // extension was loaded from probe/.
    assert(sawOverlay, "extension content script never ran (overlay never appeared)");
    assert(requests.filter((event) => event.type === "Document" && event.request.url === 'https://x.com/compose/post/unsent/scheduled').length === 1, 'exactly one explicitly clicked goto navigation; no repeated automatic navigation');
    const resources = requests.filter((event) => hasExtensionInitiator(event.initiator) && !(event.type === "Document" && userNavigations.has(event.request.url)));
    assert(resources.length === 0, 'zero extension resource/background requests (clicked goto is page navigation)');
    console.log(`  ✓ network: ${requests.length} local fixture/favicon/page navigation request(s); 0 extension resource/background requests; 1 user-triggered goto navigation`);

    assert(!consoleLogs.some((entry) => entry.startsWith("pageerror ")), "no uncaught page/content-script errors");
    console.log(`\ne2e: OK — ${assertions} assertions`);
  } catch (err) {
    failed = err;
    if (consoleLogs.length) console.error("page logs:\n  " + consoleLogs.slice(-20).join("\n  "));
    console.error("e2e: FAILED — " + err.message);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    rmSync(certDir, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
