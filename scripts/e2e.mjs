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
import { accessSync, constants, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:https";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { allowedRequest, hasExtensionInitiator } from "./network-policy.mjs";

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DOCS = join(ROOT, "docs");
const PROBE = join(ROOT, "probe");
const FIXTURES = join(ROOT, "fixtures");

// puppeteer-core does not install Chrome. Prefer an explicit executable, then
// installed Chrome for Testing caches; never download or use a regular profile.
function executable(path) {
  try {accessSync(path,constants.X_OK);return statSync(path).isFile();} catch {return false;}
}
function resolveChromePath() {
  if(process.env.CHROME_PATH) {
    if(!executable(process.env.CHROME_PATH))throw new Error(`CHROME_PATH is not an executable file: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  const caches=[join(tmpdir(),'cft'),process.env.PUPPETEER_CACHE_DIR || join(homedir(),'.cache','puppeteer')];
  for(const cache of caches) {
    const unpacked=join(cache,'chrome-linux64','chrome');
    if(executable(unpacked))return unpacked;
    let builds=[];
    try {builds=readdirSync(join(cache,'chrome'),{withFileTypes:true}).filter(entry=>entry.isDirectory() && /^linux-\d/.test(entry.name)).map(entry=>entry.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));} catch {continue;}
    for(const build of builds) {
      const path=join(cache,'chrome',build,'chrome-linux64','chrome');
      if(executable(path))return path;
    }
  }
  throw new Error('Chrome for Testing not installed. Install it with: npx @puppeteer/browsers install chrome@stable --path /tmp/cft ; or set CHROME_PATH to its executable.');
}
let CHROME_PATH;
try {CHROME_PATH=resolveChromePath();} catch(error) {
  console.error('e2e: FAILED — '+error.message);
  process.exit(1);
}

// Chrome needs an X server; there is none by default in this box.
if (!process.env.DISPLAY && !process.env.XSCHED_E2E_REEXEC) {
  const result = spawnSync("xvfb-run", ["-a", process.execPath, SELF], {
    stdio: "inherit",
    timeout: 600000,
    env: { ...process.env, XSCHED_E2E_REEXEC: "1" },
  });
  process.exit(result.status == null ? 1 : result.status);
}



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
  if (!/^[a-zA-Z-]+$/.test(name) && name !== 'quick013-scheduled') {
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
  { fixture: "en", file: "v1.0-quick014-en.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "ja", file: "v1.0-quick014-ja.png", count: 2, times: ["2026-07-20 16:24 (Mon)", "2026-08-03 09:05 (Mon)"] },
  { fixture: "zh-Hans", file: "v1.0-quick014-zh-Hans.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "zh-Hant", file: "v1.0-quick014-zh-Hant.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "ko", file: "v1.0-quick014-ko.png", count: 2, times: ["2026-10-10 09:00 (Sat)", "2026-11-09 20:05 (Mon)"] },
  { fixture: "roles", file: "v1.0-quick014-roles-fallback.png", count: 2, layer: "a11y", times: ["2026-10-16 07:30 (Fri)", "2026-10-17 18:00 (Sat)"] },
  { fixture: "empty", file: "v1.0-quick014-empty.png", count: 0 },
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
    async function checkAuthorLink(label) {
      const author = await page.evaluate(() => {
        const host = document.getElementById('xsched-probe-root');
        const shadow = host.shadowRoot;
        const panel = shadow.querySelector('section');
        const links = panel.querySelectorAll('a');
        const shadowCount = shadow.querySelectorAll('a').length;
        const link = links[0];
        if (!link) return { count: links.length, shadowCount };
        const r = link.getBoundingClientRect(), p = panel.getBoundingClientRect();
        const style = getComputedStyle(link);
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        return {
          count: links.length, shadowCount, href: link.getAttribute('href'), target: link.getAttribute('target'),
          rel: link.getAttribute('rel'), text: link.textContent,
          footer: link.classList.contains('panel-author') && link.parentElement === panel && style.position === 'absolute' && !shadow.querySelector('.panel-body').contains(link) && !shadow.querySelector('.panel-actions').contains(link),
          inside: r.left >= p.left && r.right <= p.right && r.top >= p.top && r.bottom <= p.bottom,
          visible: r.width > 0 && r.height > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0,
          hit: document.elementFromPoint(x, y) === host && shadow.elementFromPoint(x, y) === link,
          clear: [...shadow.querySelectorAll('.panel-actions button')].every(button => {
            const b = button.getBoundingClientRect();
            return !(r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
          }),
          private: !host.dataset.xschedDiag.includes('punkcan'),
        };
      });
      assert(author.count === 1, `${label}: exactly one panel author anchor`);
      assert(author.shadowCount === 1, `${label}: exactly one anchor in the entire shadow root`);
      assert(author.href === 'https://x.com/punkcan', `${label}: exact author href`);
      assert(author.target === '_blank', `${label}: author opens a new tab`);
      assert(author.rel?.split(/\s+/).includes('noopener'), `${label}: author has noopener`);
      assert(author.text === '@punkcan', `${label}: author text`);
      assert(author.footer && author.inside && author.visible && author.hit && author.clear, `${label}: footer link visible within panel padding, outside flex/scroll areas, hit-testable and clear of action buttons`);
      assert(author.private, `${label}: author excluded from diagnostic`);
      // Inspect only: never click the author link or authorize its navigation.
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
    assert(scheduled.diag.split('\n')[0] === 'xsched probe v0.2.0 (manifest 0.2.0)', 'diagnostic first line includes both versions');
    await checkAuthorLink('Scheduled author');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-author-link-scheduled.png') });
    await checkNative('desktop scheduled open');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-scheduled-open.png') });
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-diag-version.png') });
    await toggle(false);
    await checkNative('desktop scheduled closed');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-scheduled-closed.png') });
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
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-remount.png') });

    await open('home', '/home');
    const home = await until(async () => {
      const s = await probeState(page);
      return s.mode === 'other' && s.expanded === 'false' ? s : null;
    }, 'shortcut home defaults closed');
    assert(home.shortcut && !home.panelVisible && home.count === 0, 'home shows only shortcut, no shortcut');
    await checkNative('desktop home closed');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-home-closed.png') });
    const homeOpen = await toggle(true);
    const target = 'https://x.com/compose/post/unsent/scheduled';
    assert(homeOpen.target === target, 'goto button fixed target is exact (location.assign, no href sink)');
    const homeBeforeSynthetic = page.url();
    await page.evaluate(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-goto]').click());
    await sleep(300);
    assert(page.url() === homeBeforeSynthetic, 'synthetic page click cannot trigger Scheduled navigation');
    await checkNative('desktop home open');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-home-open-goto-link.png') });
    for (const width of [390, 600]) {
      await page.setViewport({ width, height: 820 });
      await sleep(600);
      await checkNative(`narrow ${width} open`);
      await toggle(false);
      await checkNative(`narrow ${width} closed`);
      if (width === 390) await page.screenshot({ path: join(DOCS, 'v1.0-quick014-narrow-fab.png') });
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
    assert((await probeState(page)).diag.split('\n')[0].includes('script 0.2.0 / manifest 0.0.2'), 'diagnostic mismatch warning');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-version-mismatch.png') });
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: `chrome.runtime.getManifest = () => { throw new Error('Extension context invalidated. private account'); };` });
    await until(async () => (await probeState(page)).version.includes('擴充已重新載入'), 'context invalidated warning');
    assert(!(await probeState(page)).diag.includes('private account'), 'runtime exception is never copied into diagnostic');
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-runtime-invalidated.png') });
    await network.send('Runtime.evaluate', { contextId: versionContext, expression: 'chrome.runtime.getManifest = globalThis.__originalManifest;' });
    await until(async () => (await probeState(page)).diag.startsWith('xsched probe v0.2.0 (manifest 0.2.0)'), 'runtime warning clears');

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
    await until(async () => (await probeState(page)).diag.startsWith('xsched probe v0.2.0'), 'new script takes over old UI');
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
    assert(scrollInfo.height>=400 && scrollInfo.height<=568.5 && scrollInfo.max<=568 && scrollInfo.overflow==='auto' && scrollInfo.scroll>scrollInfo.client, '1280x600: panel meets 2/3 floor and viewport cap with independently scrollable content');
    await checkActions('short viewport before scroll');
    await checkNative('1280x600 native avoidance');
    // Native avoidance may reduce preferred quick-area height. All its buttons
    // must remain reachable through the body scroll, rather than being clipped.
    const quickReachable=await page.evaluate(() => {
      const shadow=document.getElementById('xsched-probe-root').shadowRoot;
      const body=shadow.querySelector('.panel-body');
      const buttons=[...shadow.querySelectorAll('.quick-controls button')];
      return buttons.length===6 && buttons.every(button => {
        const before=button.getBoundingClientRect(),bounds=body.getBoundingClientRect();
        if(before.bottom>bounds.bottom) body.scrollTop+=before.bottom-bounds.bottom;
        else if(before.top<bounds.top) body.scrollTop-=bounds.top-before.top;
        const rect=button.getBoundingClientRect();
        return rect.top>=bounds.top-1 && rect.bottom<=bounds.bottom+1 && shadow.elementFromPoint((rect.left+rect.right)/2,(rect.top+rect.bottom)/2)===button;
      });
    });
    assert(quickReachable,'1280x600 native avoidance: entire quick area remains reachable by scrolling');
    await page.evaluate(() => {const body=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body');body.scrollTop=body.scrollHeight;});
    assert(await page.evaluate(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body').scrollTop>0), 'panel content actually scrolls');
    await checkAuthorLink('Scrolled short viewport author');
    await checkActions('short viewport after scroll');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-small-viewport-scroll.png')});
    await page.screenshot({path:join(DOCS,'v1.0-quick014-avoid-native.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-collapsed.png')});
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
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-real-skeleton-zh-Hant.png') });
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
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-unparsed-sample.png') });
    await open('boss-skeleton-zh-Hans');
    const hans = await until(async () => {
      const state=await probeState(page);
      return state.times[0]==='2026-11-03 23:19 (Tue)' ? state : null;
    }, 'Simplified Chinese weekday label');
    assert(hans.count===1 && /timeOk=1 .*timeFail=0/.test(hans.diag), 'Simplified Chinese single row parses correctly');
    assert(hans.diag.endsWith('fmt=将于 2026年11月3日 周二 下午11:19 发送'), 'Simplified Chinese masked fmt preserves only calendar label');
    await page.screenshot({ path: join(DOCS,'v1.0-quick014-real-skeleton-zh-Hans.png') });

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
    await page.screenshot({ path: join(DOCS, 'v1.0-quick014-cross-year.png') });
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
    assert(/^xsched probe v0\.2\.0 \(manifest 0\.2\.0\)\nschedDialog=0 dateCtl=0 timeCtl=0 selects=0\nschedWatch=0 schedIntent=0\n(?:\w+=[\w%|.:-]* ?)+\nfmt=none$/.test(copied.result.value[0]), "copied diagnostic preserves counters and excludes uncertified legacy format text even if DOM dataset is tampered");
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
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-selectors-broken.png") });
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
    assert(/^xsched-skeleton v0\.2\.0 path=scheduled nodes=\d+\n/.test(skeleton), `skeleton header wrong: ${skeleton.slice(0, 90)}`);
    assert(skeleton.includes("role=dialog"), `skeleton must keep the allow-listed role enum:\n${skeleton.slice(0, 300)}`);
    for (const leak of ["Will send", "Oct 10", "9:00", "Local fixture", "morning product", "weekly recap", "Unsent posts", "Drafts", "fixture", "punkcan", "https://x.com/punkcan"]) {
      assert(!skeleton.includes(leak), `skeleton leaked "${leak}"`);
    }
    writeFileSync(join(DOCS, "v1.0-quick014-skeleton-sample.txt"), skeleton + "\n");
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-skeleton-copied.png") });
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
    assert(/^xsched-skeleton v0\.2\.0 path=scheduled nodes=\d+/.test(fallbackState.fallback), "fallback textarea must hold the skeleton");
    const select = await page.evaluateHandle(() => document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-select]'));
    await select.asElement().click();
    await select.dispose();
    const selected = await page.evaluate(() => {
      const area = document.getElementById('xsched-probe-root').shadowRoot.querySelector('textarea.fallback');
      return area.selectionStart === 0 && area.selectionEnd === area.value.length;
    });
    assert(selected, 'fallback: user can select the entire skeleton');
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-skeleton-fallback.png") });
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
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-virtual-before.png") });

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
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-virtual-after.png") });
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
    await page.screenshot({ path: join(DOCS, "v1.0-quick014-not-scheduled.png") });
    console.log("  ✓ home: 0 rows (shortcut stays mounted off the Scheduled page)");

    for (const subpath of ["/home", "/compose/post/unsent/drafts", "/compose/post/schedule"]) {
      await open("en", subpath); // intentionally contains a selected Scheduled tab
      await sleep(500);
      const state = await probeState(page);
      assert(state.present && state.mode === "other", `${subpath}: selected tab must not override route (mode=${state.mode})`);
    }
    console.log("  ✓ non-Scheduled: home, Drafts, picker with adversarial selected tabs");

    // ── 0.4: immutable anchor, foreign widgets, dragging and numeric persistence ──
    const baselineManifest=JSON.parse(execFileSync('git',['show','4f7a084:probe/manifest.json'],{encoding:'utf8'}));
    const currentManifest=JSON.parse(readFileSync(join(PROBE,'manifest.json'),'utf8'));
    for(const field of ['permissions','host_permissions','web_accessible_resources']) assert(JSON.stringify(currentManifest[field])===JSON.stringify(baselineManifest[field]),'4f7a084 baseline manifest unchanged: '+field);
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-avoid-extensions.png')});
    await page.mouse.move(automatic.x+automatic.width/2,automatic.y+automatic.height/2);
    await sleep(800);
    await page.screenshot({path:join(DOCS,'v1.0-quick014-tooltip.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-button-dragged.png')});
    const saved=await page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.pos')));
    assert(Object.keys(saved).sort().join(',')==='x,y' && Object.values(saved).every(value=>typeof value==='number'&&Number.isFinite(value)) && saved.x===220 && saved.y===120,'fixed xsched key stores exactly numeric x/y');
    await page.reload({waitUntil:'domcontentloaded'});
    await until(async()=> (await probeState(page)).expanded==='true','dragged reload mounted');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(dragged),'reload preserves exact dragged button rectangle');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-dragged-reload.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-reset.png')});
    await toggle(false);const noModalClosed=await buttonRect();
    await toggle(true);assert(JSON.stringify(await buttonRect())===JSON.stringify(noModalClosed),'no modal: toggle keeps exact button rectangle');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-no-modal-open.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-modal-closed.png')});
    await toggle(true);
    assert(JSON.stringify(await buttonRect())===JSON.stringify(modalClosed),'with full-screen backdrop and dialog control: toggle keeps exact rectangle');
    assert(await page.evaluate(()=>{
      const host=document.getElementById('xsched-probe-root');
      return ['BODY','HTML'].includes(host.parentElement.tagName)&&!host.closest('[role="dialog"]')&&getComputedStyle(host).position==='fixed';
    }),'host stays fixed at body/html level, never inside X dialog');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-modal-open.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-panel-dragged.png')});
    // Button drag with panel already manually positioned must preserve full panel rect.
    const beforeSecondButton=await buttonRect();
    await page.mouse.move(beforeSecondButton.x+22,beforeSecondButton.y+22);await page.mouse.down();
    await page.mouse.move(522,122,{steps:14});await page.mouse.up();
    const buttonDragged=await buttonRect();
    assert(buttonDragged.x===500&&buttonDragged.y===100,'button is independently dragged after panel');
    assert(JSON.stringify(await panelRect())===JSON.stringify(panelDragged),'manually positioned panel exact rect stays unchanged during button drag');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-button-dragged.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-reload-both.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-clamped.png')});
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
    await page.screenshot({path:join(DOCS,'v1.0-quick014-reset-both.png')});
    console.log('  ✓ gate0.5: independent header/button drags, button exclusion, exact toggles/reload, clamping and two-key reset');

    // ── quick slots: synthetic picker, 2027+ clock, never native activation ─────
    await page.setViewport({width:1280,height:820});
    async function installQuickClock(contextId) {
      // Test-only Date replacement in BOTH worlds. Production has no clock override.
      const expression=`globalThis.__QuickRealDate=Date;
        globalThis.Date=class extends globalThis.__QuickRealDate {
          constructor(...args){super(...(args.length?args:[new globalThis.__QuickRealDate(2027,11,31,21,0).getTime()]));}
          static now(){return new globalThis.__QuickRealDate(2027,11,31,21,0).getTime();}
        };`;
      await page.evaluate(expression);
      const patched=await network.send('Runtime.evaluate',{contextId,expression});
      assert(!patched.exceptionDetails,'2027+ clock patched in extension, without production hooks');
      assert(await page.evaluate(()=>new Date().getFullYear()>=2027),'fixture clock is 2027+');
      const extClock=await network.send('Runtime.evaluate',{contextId,expression:'new Date().getFullYear()',returnByValue:true});
      assert(extClock.result.value>=2027,'extension clock is also 2027+');
    }
    async function quickFixture(name) {
      await page.evaluate(()=>{window.localStorage.removeItem('xsched.probe.pos');window.localStorage.removeItem('xsched.probe.panelPos');});
      await open(name,'/compose/post');
      const contextId=await until(findExtensionContext,'quick picker isolated context');
      // Module presence / document_idle does not imply the first throttled tick ran.
      // A shortcut click before lastReport exists is intentionally ignored.
      const initial=await until(async()=>{
        const state=await probeState(page);
        return state.present && state.mounted==='1' && state.mode==='other'
          && state.diag.startsWith('xsched probe v0.2.0 (manifest 0.2.0)\n') ? state : null;
      },'quick picker first diagnostic rendered: '+name);
      assert(initial.expanded==='false' && initial.panelVisible===false,'quick picker starts rendered and closed before its single toggle: '+name);
      await installQuickClock(contextId);
      await toggle(true);
      return contextId;
    }
    async function nativePickerState() {
      return page.evaluate(()=>({values:Object.fromEntries([...document.querySelectorAll('select')].map(el=>[el.name,el.value])),counts:{...window.fixtureSend},status:document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status').textContent,busy:document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-slot]').disabled,diag:document.getElementById('xsched-probe-root').dataset.xschedDiag}));
    }
    const quickContext=await quickFixture('quick-dialog');
    assert(/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/.test((await probeState(page)).diag),'complete picker counts contain no native values');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-dialog-detected.png')});
    const untouched=await nativePickerState();
    await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-slot="morning"]').click());
    assert(JSON.stringify((await nativePickerState()).values)===JSON.stringify(untouched.values),'untrusted quick activation cannot fill native values');
    for(const [index,id] of ['morning','lunch','evening','workday'].entries()) {
      const expectedResult=await network.send('Runtime.evaluate',{contextId:quickContext,returnByValue:true,expression:`(()=>{const at=XSCHED_QUICK.nextSlot('${id}');return {month:String(at.getMonth()+1),day:String(at.getDate()),year:String(at.getFullYear()),hour:String(at.getHours()%12||12),minute:String(at.getMinutes()),period:at.getHours()<12?'AM':'PM'};})()`});
      const expected=expectedResult.result.value;
      assert(Number(expected.year)>=2027,'computed slot year must be at least 2027');
      assert(expected.year==='2028'&&expected.month==='1'&&expected.day===(id==='workday'?'3':'1'),'explicit cross-year / weekend expectation');
      // First success changes the render signature. Wait for that repaint before
      // taking the next button handle, so a 60ms tick cannot detach it mid-click.
      const initialStatus=index===0 ? await page.evaluateHandle(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status')) : null;
      await clickShadow(`[data-xsched-slot="${id}"]`);
      if(initialStatus) {
        try { await until(()=>page.evaluate(old=>!old.isConnected,initialStatus),'first quick fill repaint completed'); }
        finally { await initialStatus.dispose(); }
      }
      const filled=await until(async()=>{const v=await nativePickerState();return v.counts.change===(index+1)*6 && !v.busy && v.status==='Fields filled; not scheduled yet'?v:null;},'native change events for '+id);
      assert(JSON.stringify(filled.values)===JSON.stringify(expected),'native fields equal local future slot: '+id);
      assert(filled.counts.input===(index+1)*6,'all native input events bubble: '+id);
      assert(['confirm','schedule','post','submit'].every(key=>filled.counts[key]===0),'no Confirm, Schedule, Post clicks or form submit: '+id);
      assert(filled.status==='Fields filled; not scheduled yet','fill is not reported as scheduled');
      if(id==='lunch')await page.screenshot({path:join(DOCS,'v1.0-quick014-slot-filled.png')});
    }
    await until(async()=> (await probeState(page)).diag.startsWith('xsched probe v0.2.0'),'new diagnostic available');
    await network.send('Runtime.evaluate',{contextId:quickContext,expression:`globalThis.__quickCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){globalThis.__quickCopies.push(text);return Promise.resolve();}}});`});
    await clickShadow('[data-xsched-copy]');await clickShadow('[data-xsched-skeleton]');
    const exported=await network.send('Runtime.evaluate',{contextId:quickContext,expression:'globalThis.__quickCopies',returnByValue:true});
    assert(exported.result.value.length===2,'both diagnostic and modal skeleton physically copied');
    assert(/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/.test(exported.result.value[0]),'copied diagnostic includes counts');
    assert(/fill=ok y=2028 m=1 d=3 h=9 min=0 period=AM/.test(exported.result.value[0]),'copied diagnostic includes completed workday fill summary');
    assert(/role=dialog/.test(exported.result.value[1])&&/select /.test(exported.result.value[1])&&/option /.test(exported.result.value[1]),'skeleton includes native picker/options, not just Scheduled list');
    assert(!/Confirm|synthetic|Schedule \(synthetic\)|2027-01-01/.test(exported.result.value[1]),'native option prose/full dates are not exported');
    assert(/option-values=2027\|2028\|2029/.test(exported.result.value[1]),'only safe numeric option samples are exported');
    await page.evaluate(()=>{const body=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body');body.scrollTop=body.scrollHeight;});
    await page.screenshot({path:join(DOCS,'v1.0-quick014-diag.png')});
    // A picker can become incomplete after an enabled quick button was rendered.
    const beforePartial=await nativePickerState();
    await page.evaluate(()=>document.querySelector('select[name=minute]').remove());
    await until(async()=> /timeCtl=2 selects=5/.test((await probeState(page)).diag),'live partial picker diagnostics');
    const disabled=await page.evaluate(()=>[...document.getElementById('xsched-probe-root').shadowRoot.querySelectorAll('[data-xsched-slot]')].every(el=>el.disabled));
    assert(disabled,'live partial disables every quick slot');
    assert((await nativePickerState()).counts.change===beforePartial.counts.change,'partial removal emits no writes');
    for(const name of ['quick-missing','quick-partial']) {
      await quickFixture(name);
      const before=await nativePickerState();
      const ids=await page.evaluate(()=>[...document.getElementById('xsched-probe-root').shadowRoot.querySelectorAll('[data-xsched-slot]')].map(el=>({id:el.dataset.xschedSlot,disabled:el.disabled})));
      assert(ids.length===5&&ids.every(el=>el.disabled),'missing/incomplete picker: all five disabled');
      assert(before.status==='Schedule fields not detected','missing/incomplete picker explains no fields');
      // Mouse clicks on disabled quick slots must not write even a single native field.
      for(const {id} of ids)await clickShadow(`[data-xsched-slot="${id}"]`);
      const after=await nativePickerState();
      assert(JSON.stringify(after.values)===JSON.stringify(before.values),'missing/incomplete picker never half fills');
      assert(Object.values(after.counts).every(value=>value===0),'missing/incomplete picker emits no input/change/click/submit');
      await page.screenshot({path:join(DOCS,name==='quick-partial'?'v1.0-quick014-partial-fields.png':'v1.0-quick014-not-detected.png')});
    }
    // Granularity/year mismatch: controls exist, but transaction preflight fails.
    await quickFixture('quick-dialog');
    await page.evaluate(()=>document.querySelector('select[name=minute] option[value="30"]').remove());
    const noMinute=await nativePickerState();
    await clickShadow('[data-xsched-slot="lunch"]');
    await until(async()=> (await nativePickerState()).status==='Date/time options cannot represent this slot','unsupported minute clearly fails');
    const noMinuteAfter=await nativePickerState();
    assert(JSON.stringify(noMinuteAfter.values)===JSON.stringify(noMinute.values),'unrepresentable minute leaves ALL fields unchanged');
    assert(Object.values(noMinuteAfter.counts).every(value=>value===0),'unrepresentable minute emits no events or native activation');
    console.log('  ✓ quick slots: four local future choices, 2027+ two-world clocks, native changes, zero send/submit, missing/partial/unsupported atomic failure');

    // ── 0.1.3: masked picker structure, fake values, 2027+ clocks ──────────────
    // These fixtures hide the date picker indicator: Chrome otherwise emits a
    // built-in data:image/svg+xml icon request in CDP. The date input stays intact;
    // production behavior and the strict zero-extension-request guard are unchanged.
    async function realPickerState() {
      return page.evaluate(()=>({values:Object.fromEntries(['month','day','year','hour','minute','period'].map(key=>[key,document.getElementById('fake-select-'+key).value])),counts:{...window.fixtureSend},date:document.querySelector('input[type=date]').value,status:document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status').textContent,busy:document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-slot]').disabled,diag:document.getElementById('xsched-probe-root').dataset.xschedDiag}));
    }
    const realContext=await quickFixture('quick-real-dialog');
    assert(/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/.test((await probeState(page)).diag),'real structure: inner dialog with two groups counted once');
    const realDetected=await page.evaluate(()=>[...document.querySelectorAll('select')].every(control=>control.hasAttribute('aria-labelledby') && control.getAttribute('data-testid')===''));
    assert(realDetected,'real structure has linked labels and empty testids, no legacy testid/name reliance');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-real-detected.png')});
    const calendarBefore=(await realPickerState()).date;
    for (const [index,id] of ['morning','lunch','evening','workday'].entries()) {
      const target=await network.send('Runtime.evaluate',{contextId:realContext,returnByValue:true,expression:`(()=>{const at=XSCHED_QUICK.nextSlot('${id}');return {month:'fake-month-'+(at.getMonth()+1),day:String(at.getDate()),year:String(at.getFullYear()),hour:String(at.getHours()%12||12),minute:String(at.getMinutes()),period:at.getHours()<12?'fake-period-0':'fake-period-1'};})()`});
      const expected=target.result.value;
      assert(expected.year==='2028'&&expected.month==='fake-month-1'&&expected.day===(id==='workday'?'3':'1'),'real future slots cross year/weekend with independent expectation: '+id);
      const oldStatus=index===0?await page.evaluateHandle(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status')):null;
      await clickShadow(`[data-xsched-slot="${id}"]`);
      if(oldStatus) {try{await until(()=>page.evaluate(node=>!node.isConnected,oldStatus),'real first fill repaint');}finally{await oldStatus.dispose();}}
      const actual=await until(async()=>{const state=await realPickerState();return state.counts.change===(index+1)*6 && !state.busy && state.status==='已填入欄位；尚未排程'?state:null;},'real input/change for '+id);
      assert(JSON.stringify(actual.values)===JSON.stringify(expected),'real selects use exact option values / number-text fallback: '+id);
      assert(actual.counts.input===(index+1)*6,'real selects emit every input event: '+id);
      assert(['confirm','schedule','post','submit','calendar'].every(key=>actual.counts[key]===0),'real picker never activates ANY X/calendar/send button or form: '+id);
      assert(actual.date===calendarBefore,'calendar input remains untouched: '+id);
      assert(actual.status==='已填入欄位；尚未排程','real picker does not claim scheduled');
      if(id==='lunch')assert(actual.values.hour==='12'&&actual.values.period==='fake-period-1'&&actual.values.minute==='30','12:30 is twelve PM');
      if(id==='evening') {assert(actual.values.hour==='8'&&actual.values.period==='fake-period-1','20:00 is eight PM');await page.screenshot({path:join(DOCS,'v1.0-quick014-real-filled.png')});}
    }
    // Empty testids cannot be recovered by exporting them. Test a synthetic safe
    // nonempty value plus identity attacks, never substitute a guessed real testid.
    await page.evaluate(()=>{document.getElementById('fake-select-month').setAttribute('data-testid','select-month');document.getElementById('fixture-label-month').setAttribute('data-testid','month-label');});
    await network.send('Runtime.evaluate',{contextId:realContext,expression:`globalThis.__realCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){globalThis.__realCopies.push(text);return Promise.resolve();}}});`});
    await clickShadow('[data-xsched-skeleton]');
    const realExport=await network.send('Runtime.evaluate',{contextId:realContext,returnByValue:true,expression:'globalThis.__realCopies[0]'});
    assert(/select .*data-testid=select-month/.test(realExport.result.value)&&/label .*data-testid=month-label/.test(realExport.result.value),'safe field-shaped select/label testids are exported');
    assert(!/fake-select|fake-month|上午|Fake picker|2027-01-01/.test(realExport.result.value),'picker IDs, opaque values, option prose and full dates remain masked');
    await quickFixture('quick-real-year-missing');
    assert(/schedDialog=1 dateCtl=3 timeCtl=3 selects=6/.test((await probeState(page)).diag),'limited-year real picker still detected');
    const missingBefore=await realPickerState();await clickShadow('[data-xsched-slot="morning"]');
    const missingAfter=await until(async()=>{const state=await realPickerState();return state.status==='目標年份不在 X 的選項中'?state:null;},'explicit unavailable target year');
    assert(JSON.stringify(missingAfter.values)===JSON.stringify(missingBefore.values)&&missingAfter.date===missingBefore.date,'unavailable year changes no fields or date input');
    assert(Object.values(missingAfter.counts).every(value=>value===0),'unavailable year emits zero events/clicks/submit');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-year-missing.png')});
    await quickFixture('quick-real-rollback');
    const rollbackBefore=await realPickerState();await clickShadow('[data-xsched-slot="evening"]');
    const rollbackAfter=await until(async()=>{const state=await realPickerState();return state.status==='填值失敗，已還原；請逐欄檢查'?state:null;},'readback refusal restores all fields');
    assert(JSON.stringify(rollbackAfter.values)===JSON.stringify(rollbackBefore.values),'rollback restores EVERY original select value');
    assert(rollbackAfter.counts.input===12&&rollbackAfter.counts.change===12,'ALL six attempted fields plus ALL six restored fields use native input/change');
    assert(['confirm','schedule','post','submit','calendar'].every(key=>rollbackAfter.counts[key]===0),'rollback never sends, submits or activates calendar');
    assert(rollbackAfter.date===rollbackBefore.date,'rollback does not write date input');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-rollback.png')});
    console.log('  ✓ quickfix real structure: nested modal/two groups, all four future slots, 12-hour periods, safe skeleton export, missing-year atomic failure, full readback rollback, zero native activation');

    // ── 0.1.3: controlled re-renders and option encoding variants ──────────────
    for(const variant of ['numeric','padded','zero','period-values']) {
      await quickFixture('quick-real-'+variant);
      // The synthetic controlled model rejects instance .value writes, even with
      // events. Production must use the native prototype setter, then input/change.
      const direct=await page.evaluate(async()=>{
        const select=document.getElementById('fake-select-year'),before=select.value;
        select.value='2028';
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return select.value===before;
      });
      assert(direct,'controlled instance write is rejected: '+variant);
      const startCounts=(await realPickerState()).counts;
      for(const [index,id] of ['morning','lunch','evening','workday'].entries()) {
        const oldDay=await page.evaluateHandle(()=>document.getElementById('fake-select-day'));
        await clickShadow(`[data-xsched-slot="${id}"]`);
        const state=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程' && v.counts.change===startCounts.change+(index+1)*6?v:null;},'controlled complete fill '+variant+'/'+id);
        assert(state.values.year==='2028','controlled target year: '+variant+'/'+id);
        assert(state.values.month===(variant==='zero'?'0':variant==='padded'?'01':'1'),'exact month encoding: '+variant+'/'+id);
        assert(Number(state.values.day)===(id==='workday'?3:1),'controlled dependent day: '+variant+'/'+id);
        assert(Number(state.values.hour)===(id==='evening'?8:id==='lunch'?12:9)&&Number(state.values.minute)===(id==='lunch'?30:0),'controlled hour/minute: '+variant+'/'+id);
        assert(state.values.period===(variant==='period-values'?(['lunch','evening'].includes(id)?'下午':'上午'):['lunch','evening'].includes(id)?'PM':'AM'),'controlled period encoding: '+variant+'/'+id);
        assert(state.counts.input===startCounts.input+(index+1)*6,'every native input fired: '+variant+'/'+id);
        assert(state.diag.includes('fill=ok y=2028 m=1'),'successful safe fill summary: '+variant+'/'+id);
        assert(await page.evaluate(old=>!old.isConnected,oldDay),'day SELECT was replaced, no stale references: '+variant+'/'+id);
        await oldDay.dispose();
        assert(['confirm','schedule','post','calendar','submit'].every(key=>state.counts[key]===0),'controlled model never sends/activates: '+variant+'/'+id);
      }
      assert(await page.evaluate(()=>window.fixtureRebuilds===8),'year/month each rebuild day once per slot: '+variant);
      await page.screenshot({path:join(DOCS,'v1.0-quick014-'+variant+'.png')});
    }
    const correctionContext=await quickFixture('quick-real-autocorrect');
    const correctionBefore=await realPickerState();
    await clickShadow('[data-xsched-slot="evening"]');
    const correction=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='填值失敗，已還原；請逐欄檢查'?v:null;},'asynchronous X period correction is restored');
    assert(JSON.stringify(correction.values)===JSON.stringify(correctionBefore.values),'automatic correction restores ALL original values');
    assert(/fill=failed failed=period\n/.test(correction.diag),'failed field is period, not a guessed React error');
    assert(/field=period target=PM value=PM read=AM options=AM\|PM/.test(correction.diag),'diagnostic captures period readback BEFORE restoration');
    assert(correction.diag.split('\n').filter(line=>line.startsWith('field=')).length===6,'six safe field diagnostic lines');
    assert(correction.counts.input===12&&correction.counts.change===12,'ALL six attempted fields and ALL six restoration events');
    assert(['confirm','schedule','post','calendar','submit'].every(key=>correction.counts[key]===0),'automatic correction never sends or activates');
    await network.send('Runtime.evaluate',{contextId:correctionContext,expression:`globalThis.__fillCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText(text){globalThis.__fillCopies.push(text);return Promise.resolve();}}});`});
    await clickShadow('[data-xsched-copy]');await clickShadow('[data-xsched-skeleton]');
    const copies=await network.send('Runtime.evaluate',{contextId:correctionContext,returnByValue:true,expression:'globalThis.__fillCopies'});
    assert(copies.result.value[0]===correction.diag,'copied diagnosis includes exact safe readback rows');
    assert(/option-values=empty\|1\|2\|12/.test(copies.result.value[1])&&/option-values=AM\|PM/.test(copies.result.value[1]),'picker skeleton includes bounded numeric/period option samples');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-autocorrect.png')});
    await page.evaluate(()=>{const body=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-body');body.scrollTop=body.scrollHeight;});
    await page.screenshot({path:join(DOCS,'v1.0-quick014-diag-failure.png')});
    console.log('  ✓ quickfill: controlled native setters, ordered dependent re-query, numeric/padded/zero/Chinese values, bounded settled readback, full restoration and safe copied field diagnostics');

    // ── 0.1.3: new cache slot, actual dates, numeric settings and height ────────
    for(const variant of ['transient','interim']) {
      await quickFixture('quick-real-'+variant);
      await clickShadow('[data-xsched-slot="evening"]');
      const state=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程'?v:null;},'013 bounded rebuild/final-only check: '+variant);
      assert(state.values.year==='2028' && state.values.month==='1' && state.values.day==='1' && state.values.hour==='8' && state.values.period==='PM' && state.values.minute==='0','013 rebuilt/final values: '+variant);
      assert(state.counts.input===6 && state.counts.change===6,'six ordered native writes despite transient rebuild/correction: '+variant);
      assert(['confirm','schedule','post','calendar','submit'].every(key=>state.counts[key]===0),'zero activation through transient/interim fill: '+variant);
      await page.screenshot({path:join(DOCS,'v1.0-quick014-'+variant+'.png')});
    }
    await page.evaluate(()=>{for(const key of ['xsched.probe.lastScheduled','xsched.probe.quickRange','xsched.probe.panelHeight'])window.localStorage.removeItem(key);});
    await quickFixture('quick-real-numeric');
    assert(await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-slot="random"]').disabled),'random unavailable without last-list cache');
    assert(await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-cache').textContent.includes('Scheduled')),'missing cache explains visit Scheduled first');
    const fixedLabels=await page.evaluate(()=>[...document.getElementById('xsched-probe-root').shadowRoot.querySelectorAll('[data-xsched-slot]')].filter(b=>b.dataset.xschedSlot!=='random').map(b=>b.textContent));
    assert(fixedLabels.slice(0,3).every(label=>label.includes('明天')&&label.includes('2028')),'expired today labels explicitly show tomorrow, including cross-year date');
    assert(fixedLabels[3].includes('2028') && fixedLabels[3].includes('09:00'),'workday button has its actual future date');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-no-cache-dates.png')});
    // Exercise the real reader/cache route, rather than manufacturing a cache in extension code.
    await open('quick013-scheduled');
    await until(async()=> (await probeState(page)).count===2,'013 two synthetic 2028 rows read');
    const cacheContext=await until(findExtensionContext,'013 cache isolated context');
    await installQuickClock(cacheContext);
    // Re-read the synthetic list after installing the two-world 2027 clock. A
    // changed fake timestamp proves cache refresh, then returns to the target row.
    await page.evaluate(()=>document.querySelectorAll('[role="button"] span')[1].textContent='Will send on Sun, Jan 2, 2028 at 8:01 PM');
    await until(()=>page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled')).time===new Date(2028,0,2,20,1).getTime()),'013 cache refreshed at frozen clock');
    await page.evaluate(()=>document.querySelectorAll('[role="button"] span')[1].textContent='Will send on Sun, Jan 2, 2028 at 8:00 PM');
    await until(()=>page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled')).time===new Date(2028,0,2,20).getTime()),'013 final cache refreshed');

    const cache=await page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled')));
    const lastEpoch=await page.evaluate(()=>new Date(2028,0,2,20).getTime());
    assert(cache.time===lastEpoch && Object.keys(cache).sort().join('|')==='readAt|source|time' && cache.source===1 && Object.values(cache).every(Number.isFinite),'cache has last epoch, read time and numeric list source only');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-cached-list.png')});
    await quickFixture('quick-real-numeric');
    assert(await page.evaluate(()=>!document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-slot="random"]').disabled),'persisted cache enables random in composer');
    assert(await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-cache').textContent.includes('列表讀取時刻')),'actual cache read timestamp visible');
    async function editRange(a,b) {
      await page.evaluate((a,b)=>{const root=document.getElementById('xsched-probe-root').shadowRoot;root.querySelector('[data-xsched-range="a"]').value=String(a);root.querySelector('[data-xsched-range="b"]').value=String(b);},a,b);
      await clickShadow('[data-xsched-range-save]');
    }
    await editRange(30,10);
    await until(()=>page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status').textContent.includes('正整數')),'invalid range explained');
    assert(await page.evaluate(()=>window.localStorage.getItem('xsched.probe.quickRange')===null),'invalid interval cannot overwrite settings');
    await editRange(20,20);
    await until(()=>page.evaluate(()=>window.localStorage.getItem('xsched.probe.quickRange')===JSON.stringify({a:20,b:20})),'valid numeric interval persisted');
    await clickShadow('[data-xsched-slot="random"]');
    const randomFilled=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程'?v:null;},'cached last + interval fill');
    assert(randomFilled.values.year==='2028' && randomFilled.values.month==='1' && randomFilled.values.day==='2' && randomFilled.values.hour==='8' && randomFilled.values.period==='PM' && randomFilled.values.minute==='20','last observed Jan 2 20:00 + 20 minutes exact native values');
    assert(randomFilled.counts.input===6&&randomFilled.counts.change===6&&['confirm','schedule','post','calendar','submit'].every(key=>randomFilled.counts[key]===0),'random field fill never sends/submits');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-random-filled.png')});
    await page.evaluate(()=>window.localStorage.setItem('xsched.probe.lastScheduled',JSON.stringify({time:new Date(2027,0,1).getTime(),readAt:new Date(2027,0,1).getTime()})));
    await quickFixture('quick-real-numeric');
    await clickShadow('[data-xsched-slot="random"]');
    const fallback=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程'?v:null;},'expired cache uses now + interval');
    assert(fallback.values.year==='2027'&&fallback.values.month==='12'&&fallback.values.day==='31'&&fallback.values.hour==='9'&&fallback.values.period==='PM'&&fallback.values.minute==='20','expired cached result uses frozen now 21:00 + 20 minutes');
    assert(['confirm','schedule','post','calendar','submit'].every(key=>fallback.counts[key]===0),'expired fallback never activates');
    const buttonBeforeHeight=await buttonRect(),panelBeforeHeight=await panelRect();
    assert(panelBeforeHeight.height>=Math.floor(820*2/3) && panelBeforeHeight.height<=788,'default height meets 2/3 floor and fits viewport');
    const handle=await page.evaluate(()=>{const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.panel-resizer').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
    await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x,handle.y+80,{steps:8});await page.mouse.up();await sleep(150);
    const resized=await panelRect();assert(Math.abs(resized.height-panelBeforeHeight.height-80)<=1,'physical bottom handle changes height');
    assert(JSON.stringify(await buttonRect())===JSON.stringify(buttonBeforeHeight),'height change never moves Dagaz button');
    assert(resized.left===panelBeforeHeight.left&&resized.top===panelBeforeHeight.top,'height change keeps independent panel anchor');
    const storedHeight=await page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.panelHeight')));
    assert(Object.keys(storedHeight).join('|')==='height'&&Number.isFinite(storedHeight.height),'height payload is one numeric value');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-height-dragged.png')});
    await quickFixture('quick-real-numeric');
    assert(Math.abs((await panelRect()).height-storedHeight.height)<=1,'height preference survives reload');
    assert(await page.evaluate(()=>document.getElementById('xsched-probe-root').shadowRoot.querySelector('[data-xsched-range="a"]').value==='20'),'interval survives reload');
    await page.setViewport({width:390,height:600});await sleep(650);
    const clampedHeight=await panelRect();assert(clampedHeight.top>=0&&clampedHeight.bottom<=600&&clampedHeight.left>=0&&clampedHeight.right<=390,'saved height fits a smaller viewport');
    assert(await page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.panelHeight')).height)===storedHeight.height,'resize preserves original stored height');
    await checkActions('013 height-clamped',true);
    await page.screenshot({path:join(DOCS,'v1.0-quick014-height-clamped.png')});
    console.log('  ✓ 013: final-only readback, bounded rebuild retries, random cache/fallback, numeric interval, actual dates, independent persisted height and clamp');

    // ── 0.1.4: immediate fill geometry and passive completion observation ─────
    // These are synthetic X controls. ONLY page.mouse / Puppeteer user input may
    // activate them. All preceding automatic-fill cases retain zero native clicks.
    await page.setViewport({width:1280,height:820});
    const cacheKey='xsched.probe.lastScheduled';
    async function checkQuickGeometry(label) {
      const state=await page.evaluate(()=>{
        const host=document.getElementById('xsched-probe-root'),root=host.shadowRoot;
        const panel=root.querySelector('section'),area=root.querySelector('.quick-controls'),body=root.querySelector('.panel-body');
        const p=panel.getBoundingClientRect(),b=body.getBoundingClientRect(),q=area.getBoundingClientRect();
        const within=r=>r.width>0 && r.height>0 && r.left>=b.left && r.right<=b.right+1 && r.top>=b.top-1 && r.bottom<=b.bottom+1 && r.top>=0 && r.bottom<=innerHeight;
        const buttons=[...area.querySelectorAll('button')].map(button=>{
          const r=button.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
          return {visible:within(r),hit:document.elementFromPoint(x,y)===host && root.elementFromPoint(x,y)===button};
        });
        return {height:p.height,floor:Math.floor(innerHeight*2/3),cap:innerHeight-32,quick:within(q),slots:area.querySelectorAll('[data-xsched-slot]').length,buttons};
      });
      assert(state.height>=state.floor && state.height<=state.cap+1,label+': height floor and viewport cap');
      assert(state.quick && state.slots===5 && state.buttons.length===6,label+': full quick area, all five slots and interval save visible');
      for(const button of state.buttons)assert(button.visible && button.hit,label+': every quick button visible and hit-testable');
      await checkActions(label,true);
      return state.height;
    }
    await page.evaluate(()=>{
      window.localStorage.setItem('xsched.probe.panelHeight',JSON.stringify({height:80}));
      window.localStorage.setItem('xsched.probe.lastScheduled',JSON.stringify({time:new Date(2028,0,1,9).getTime(),readAt:new Date(2027,11,31,21).getTime(),source:1}));
    });
    for(const viewport of [{width:1280,height:820},{width:1280,height:600}]) {
      await page.setViewport(viewport);await quickFixture('quick-real-numeric');
      const height=await checkQuickGeometry('014 just opened');
      await clickShadow('[data-xsched-slot="lunch"]');
      const during=await checkQuickGeometry('014 immediately after slot click');
      assert(during===height,'first immediate fill cannot collapse or resize panel');
      const result=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程'?v:null;},'014 complete immediate fill');
      assert((await checkQuickGeometry('014 settled fill'))===height,'settled status leaves height unchanged');
      assert(['confirm','schedule','post','calendar','submit'].every(key=>result.counts[key]===0),'014 immediate fill never activates native controls');
      await page.screenshot({path:join(DOCS,viewport.height===600?'v1.0-quick014-height-floor-small.png':'v1.0-quick014-immediate-fill.png')});
    }
    await page.setViewport({width:1280,height:820});
    async function completionFixture(mode,priorHour=9) {
      await page.evaluate((hour)=>window.localStorage.setItem('xsched.probe.lastScheduled',JSON.stringify({time:new Date(2028,0,1,hour).getTime(),readAt:new Date(2027,11,31,21).getTime(),source:1})),priorHour);
      await quickFixture('quick-real-numeric');
      await page.evaluate(mode=>{
        window.fixtureUntrustedActivations=0;
        const picker=document.querySelector('[role="dialog"][aria-modal=true]'),composer=picker.parentElement.closest('[role="dialog"]');
        const schedule=document.getElementById('schedule'),confirm=document.getElementById('confirm');
        schedule.textContent=mode==='unknown'?'Unverified Schedule label':'Schedule';confirm.textContent=mode==='cancel'?'Cancel':'Confirm';
        const toast=()=>{const node=document.createElement('div');node.setAttribute('role','alert');node.textContent='Your post was scheduled.';document.body.append(node);};
        if(mode==='stale')toast();
        for(const button of document.querySelectorAll('button'))button.addEventListener('click',event=>{if(!event.isTrusted)window.fixtureUntrustedActivations++;});
        confirm.addEventListener('click',()=>{if(mode==='cancel'||mode==='confirm-only'||mode==='two-stage')picker.remove();});
        schedule.addEventListener('click',()=>{
          if(mode==='error') {const node=document.createElement('div');node.setAttribute('role','alert');node.textContent='Error';document.body.append(node);return;}
          if(mode==='toast'){toast();return;}
          if(mode==='stale')return;
          picker.remove();
        });
        if(mode==='two-stage') {
          const final=document.createElement('button');final.type='button';final.id='fixture-final-schedule';final.textContent='Schedule';composer.append(final);
          final.addEventListener('click',event=>{if(!event.isTrusted)window.fixtureUntrustedActivations++;window.fixtureSend.schedule++;composer.remove();});
        }
      },mode);
      const before=await page.evaluate(key=>window.localStorage.getItem(key),cacheKey);
      if(mode!=='unfilled') {
        await clickShadow('[data-xsched-slot="lunch"]');
        await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程';},'014 observation candidate filled');
        assert(await page.evaluate(key=>window.localStorage.getItem(key),cacheKey)===before,'fill alone cannot advance cache: '+mode);
        const counts=(await realPickerState()).counts;
        assert(['confirm','schedule','post','calendar','submit'].every(key=>counts[key]===0),'zero native activations before simulated USER: '+mode);
      }
      if(mode==='changed') {
        await page.evaluate(()=>{
          const control=document.getElementById('fake-select-minute');
          Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(control,'31');
          for(const type of ['input','change'])control.dispatchEvent(new Event(type,{bubbles:true}));
        });
        await until(async()=> /schedWatch=0/.test((await probeState(page)).diag),'014 edit disarms watch');
      }
      if(mode==='plain')await page.evaluate(()=>document.querySelector('[aria-modal=true]').remove());
      else if(['cancel','confirm-only','two-stage'].includes(mode))await page.click('#confirm');
      else await page.click('#schedule');
      if(mode==='two-stage') {
        await sleep(550);
        assert(await page.evaluate(key=>window.localStorage.getItem(key),cacheKey)===before,'Confirm closure is provisional');
        await page.click('#fixture-final-schedule');
      }
      const success=['close','toast','two-stage','older'].includes(mode);
      if(success && priorHour<12)await until(()=>page.evaluate(key=>JSON.parse(window.localStorage.getItem(key)).source===2,cacheKey),'014 cache completion: '+mode);
      else await sleep(1000);
      const result=await page.evaluate(key=>({cache:JSON.parse(window.localStorage.getItem(key)),raw:window.localStorage.getItem(key),label:document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-cache').textContent,counts:{...window.fixtureSend},untrusted:window.fixtureUntrustedActivations}),cacheKey);
      assert(result.untrusted===0 && result.counts.submit===0 && result.counts.post===0 && result.counts.calendar===0,'no extension activation or submission: '+mode);
      assert(result.counts.schedule===(['plain','cancel','confirm-only'].includes(mode)?0:1),'native schedule count is exactly the explicit test-user click: '+mode);
      assert(result.counts.confirm===(['cancel','confirm-only','two-stage'].includes(mode)?1:0),'Confirm/cancel count is exactly the explicit test-user click: '+mode);
      if(success && priorHour<12) {
        const expected=await page.evaluate(()=>new Date(2028,0,1,12,30).getTime());
        assert(result.cache.time===expected && result.cache.source===2 && result.label.includes('剛才排的'),'observed filled time and source: '+mode);
      } else assert(result.raw===before,'cancel/error/ambiguous/older outcome leaves entire cache unchanged: '+mode);
      assert(Object.keys(result.cache).sort().join('|')==='readAt|source|time' && Object.values(result.cache).every(Number.isFinite),'cache contains numeric schema only: '+mode);
      await page.screenshot({path:join(DOCS,'v1.0-quick014-observed-'+mode+'.png')});
    }
    for(const mode of ['close','toast','plain','cancel','changed','error','unfilled','unknown','stale','confirm-only','two-stage'])await completionFixture(mode);
    await completionFixture('older',14);
    // Establish an OBSERVED cache later than the next list's maximum, rather than
    // just checking that a list-derived cache can be overwritten by another list.
    await page.evaluate(()=>window.localStorage.setItem('xsched.probe.lastScheduled',JSON.stringify({time:new Date(2028,0,2,20).getTime(),readAt:new Date(2027,11,31,21).getTime(),source:1})));
    await quickFixture('quick-real-numeric');await editRange(20,20);
    await page.evaluate(()=>{
      const button=document.getElementById('schedule');button.textContent='Schedule';
      button.addEventListener('click',()=>document.querySelector('[aria-modal=true]').remove());
    });
    await clickShadow('[data-xsched-slot="random"]');
    const laterFill=await until(async()=>{const v=await realPickerState();return !v.busy && v.status==='已填入欄位；尚未排程'?v:null;},'014 later candidate filled');
    assert(laterFill.values.day==='2' && laterFill.values.hour==='8' && laterFill.values.minute==='20' && laterFill.values.period==='PM','later observed candidate is Jan 2 20:20');
    assert(['confirm','schedule','post','calendar','submit'].every(key=>laterFill.counts[key]===0),'later candidate has zero automatic native activations');
    await page.click('#schedule');
    await until(()=>page.evaluate(()=>{const saved=JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled'));return saved.source===2 && saved.time===new Date(2028,0,2,20,20).getTime();}),'014 later observed cache established');
    assert(await page.evaluate(()=>window.fixtureSend.schedule===1 && window.fixtureSend.submit===0),'later candidate has exactly one test-user schedule click and no submit');
    // The later observed time is not authoritative over the next list read.
    await open('quick013-scheduled');await until(async()=> (await probeState(page)).count===2,'014 list re-read');
    const authorityContext=await until(findExtensionContext,'014 list context');await installQuickClock(authorityContext);
    await page.evaluate(()=>document.querySelectorAll('[role="button"] span')[1].textContent='Will send on Sun, Jan 2, 2028 at 8:01 PM');
    await until(()=>page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled')).time===new Date(2028,0,2,20,1).getTime()),'014 re-read under future clock');
    await page.evaluate(()=>document.querySelectorAll('[role="button"] span')[1].textContent='Will send on Sun, Jan 2, 2028 at 8:00 PM');
    await until(()=>page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled')).time===new Date(2028,0,2,20).getTime()),'014 authoritative fake list restored');
    assert(await page.evaluate(()=>{const saved=JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled'));return saved.source===1 && saved.time===new Date(2028,0,2,20).getTime();}),'Scheduled list replaces observed source and maximum');
    await page.screenshot({path:join(DOCS,'v1.0-quick014-list-authoritative.png')});
    console.log('  ✓ 014: immediate full quick area / height floor, passive trusted completion, cancellation/error vetoes, max-only advance and authoritative list');

    // ── P0: one scenario, twenty complete open/close cycles ───────────────────
    await page.setViewport({width:1280,height:820});
    await open('quick013-scheduled'); // synthetic 2028 rows; no native fill/send
    await until(async()=> (await probeState(page)).expanded==='true','P0 initial open');
    await toggle(false);
    const toggleCount=state=>Number(/\btoggles=(\d+)/.exec(state.diag)?.[1]);
    const recoveryCount=state=>Number(/\brecoveries=(\d+)/.exec(state.diag)?.[1]);
    const startCounts=await probeState(page);
    const assertInViewport=async label=>{
      const rect=await page.evaluate(()=>{
        const host=document.getElementById('xsched-probe-root'),panel=host?.shadowRoot.querySelector('section');
        if(!panel)return null;
        const r=panel.getBoundingClientRect(),style=getComputedStyle(panel);
        return {visible:style.display!=='none' && style.visibility==='visible' && !panel.hidden,
          x:r.left,y:r.top,right:r.right,bottom:r.bottom,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight};
      });
      assert(rect && rect.visible && rect.w>0 && rect.h>0 && rect.x>=0 && rect.y>=0
        && rect.right<=rect.vw+1 && rect.bottom<=rect.vh+1,label+': panel visible and entirely in viewport');
    };
    for(let cycle=0;cycle<20;cycle++) {
      if(cycle%4===0) {
        const home=cycle%8===0;
        await page.evaluate(home=>history.pushState({},'',(home?'/home':'/compose/post/unsent/scheduled')+'?fixture=quick013-scheduled'),home);
        await until(async()=> (await probeState(page)).mode===(home?'other':'scheduled'),'P0 SPA route '+cycle);
      }
      if(cycle%3===0)await page.setViewport(cycle%2 ? {width:1280,height:820}:{width:390,height:600});
      await toggle(true);await assertInViewport('P0 open '+cycle);
      // Fault injection stays in this same cycle scenario and only touches our UI.
      if([5,9,13,17].includes(cycle)) {
        const before=recoveryCount(await probeState(page));
        await page.evaluate(cycle=>{
          const host=document.getElementById('xsched-probe-root'),panel=host.shadowRoot.querySelector('section');
          if(cycle===5)panel.remove();
          else if(cycle===9)panel.hidden=true;
          else if(cycle===13)panel.style.setProperty('transform','translate(5000px, 5000px)','important');
          else host.remove();
        },cycle);
        await until(async()=>{const s=await probeState(page);return s.expanded==='true' && s.panelVisible && recoveryCount(s)>before;},'P0 recovery '+cycle);
        await assertInViewport('P0 recovered '+cycle);
      }
      await toggle(false);
    }
    const endCounts=await probeState(page);
    assert(toggleCount(endCounts)===toggleCount(startCounts)+40,'P0 twenty open/close cycles count exactly forty Dagaz toggles');
    assert(recoveryCount(endCounts)>=recoveryCount(startCounts)+4,'P0 missing/hidden/offscreen/SPA-host recovery counted');
    console.log('  ✓ P0: twenty open/close cycles with SPA/resize, shadow recovery and in-viewport panels');

    // ── 0.1.5: composer entry, only native picker icon activation ──────────────
    await page.setViewport({width:320,height:820});
    await open('quick-composer','/compose/post');
    const composerContext=await until(findExtensionContext,'015 composer isolated world');
    await installQuickClock(composerContext);
    await until(()=>page.evaluate(()=>document.querySelector('.xsched-composer-root')?.shadowRoot.querySelector('[data-xsched-composer-slot="morning"]')?.textContent.includes('2028')),'015 actual future slot labels');
    assert((await probeState(page)).expanded==='false','015 composer works without opening Dagaz panel');
    async function composerClick(id) {
      const handle=await page.evaluateHandle(id=>document.querySelector('.xsched-composer-root').shadowRoot.querySelector('[data-xsched-composer-slot="'+id+'"]'),id);
      try {await handle.asElement().click();} finally {await handle.dispose();}
    }
    const inlineGeometry=await page.evaluate(()=>{
      const host=document.querySelector('.xsched-composer-root'),buttons=[...host.shadowRoot.querySelectorAll('button')];
      const native=[...document.querySelectorAll('.fixture-toolbar button')].map(el=>el.getBoundingClientRect());
      return buttons.length===5 && buttons.every(button=>{const r=button.getBoundingClientRect();return r.width>0 && r.left>=0 && r.right<=innerWidth && button.title===button.getAttribute('aria-label') && !native.some(n=>r.left<n.right && r.right>n.left && r.top<n.bottom && r.bottom>n.top);});
    });
    assert(inlineGeometry,'015 five localized wrapped slots fit 320px without covering native toolbar');
    await page.screenshot({path:join(DOCS,'v1.0-quick015-composer.png')});
    for(const [index,id,hour,minute,period] of [[0,'morning','9','0','AM'],[1,'lunch','12','30','PM'],[2,'evening','8','0','PM']]) {
      await composerClick(id);
      await until(()=>page.evaluate(()=>{
        const notice=document.querySelector('.xsched-composer-notice')?.shadowRoot.querySelector('[role="status"]');
        return notice?.textContent.includes('Fields filled') && document.getElementById('xsched-probe-root').dataset.xschedDiag.includes('fill=ok');
      }),'015 '+id+' fill completed');
      const filled=await page.evaluate(()=>({values:Object.fromEntries(['month','day','year','hour','minute','period'].map(key=>[key,document.getElementById('fake-select-'+key).value]))}));
      assert(filled.values.year==='2028' && filled.values.month==='1' && filled.values.day==='1' && filled.values.hour===hour && filled.values.minute===minute && filled.values.period===period,'015 '+id+' complete native readback');
      assert(await page.evaluate(index=>window.fixtureSend.icon===index+1 && window.fixtureSend.input>0 && window.fixtureSend.change>0 && ['confirm','schedule','post','calendar','submit'].every(key=>window.fixtureSend[key]===0),index),'015 one icon activation per use; input/change and zero confirm/schedule/post/submit');
      assert((await probeState(page)).expanded==='false','015 Dagaz panel remains closed');
      await page.screenshot({path:join(DOCS,'v1.0-quick015-filled-'+id+'.png')});
      // Test teardown only: extension cannot click Close or mutate the X dialog.
      await page.evaluate(()=>document.querySelector('[role="dialog"]').remove());
      await until(()=>page.evaluate(()=>!document.querySelector('.xsched-composer-root').shadowRoot.querySelector('button').disabled),'015 next composer use available');
    }
    // Same entry failures: stale icon, no new picker and writer rollback.
    await page.evaluate(()=>document.querySelector('[data-testid="scheduleOption"]').remove());
    await until(()=>page.evaluate(()=>{const root=document.querySelector('.xsched-composer-root')?.shadowRoot;return root && [...root.querySelectorAll('button')].every(button=>button.disabled) && root.querySelector('[role="status"]').textContent.includes('not found');}),'015 missing icon is clearly disabled');
    for(const mode of ['no-dialog','reject']) {
      await open('quick-composer','/compose/post');
      const ctx=await until(findExtensionContext,'015 failure world');await installQuickClock(ctx);
      await until(()=>page.evaluate(()=>document.querySelector('.xsched-composer-root')?.shadowRoot.querySelector('button')),'015 failure entry mounted');
      await page.evaluate(mode=>window.fixtureMode=mode,mode);
      await composerClick('evening');
      await until(()=>page.evaluate(()=>{const notice=document.querySelector('.xsched-composer-notice')?.shadowRoot.querySelector('[role="status"]');return notice && !notice.textContent.includes('Opening');}),'015 '+mode+' clear failure');
      assert(await page.evaluate(()=>window.fixtureSend.icon===1 && ['confirm','schedule','post','calendar','submit'].every(key=>window.fixtureSend[key]===0)),'015 failure does not send or close controls');
      if(mode==='no-dialog')assert(await page.evaluate(()=>window.fixtureSend.input===0 && window.fixtureSend.change===0),'015 missing dialog has zero writes');
      else assert(await page.evaluate(()=>['year','month','day','hour','minute'].every(key=>document.getElementById('fake-select-'+key).value==='') && document.getElementById('fake-select-period').value==='AM'),'015 rejection restores whole original form');
      await page.screenshot({path:join(DOCS,'v1.0-quick015-'+mode+'.png')});
    }

    async function reviewDragPanelTo(x,y) {
      const start=await page.evaluate(()=>{const root=document.getElementById('xsched-probe-root').shadowRoot,p=root.querySelector('section').getBoundingClientRect(),h=root.querySelector('.panel-header').getBoundingClientRect();return {x:h.left+20,y:h.top+14,left:p.left,top:p.top};});
      await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+x-start.left,start.y+y-start.top,{steps:14});await page.mouse.up();
    }
    async function reviewDragButtonTo(x,y) {
      const start=await buttonRect();await page.mouse.move(start.x+22,start.y+22);await page.mouse.down();await page.mouse.move(x+22,y+22,{steps:14});await page.mouse.up();
    }
    // P1(c): entering Scheduled before a list exists is not an empty-list read.
    await page.setViewport({width:1280,height:820});
    await open('quick-composer','/compose/post');
    await page.evaluate(()=>{
      window.localStorage.removeItem('xsched.probe.pos');window.localStorage.removeItem('xsched.probe.panelPos');
      window.localStorage.setItem('xsched.probe.lastScheduled',JSON.stringify({time:new Date(2028,0,2,20).getTime(),readAt:new Date(2028,0,1).getTime(),source:2}));
    });
    await page.reload({waitUntil:'domcontentloaded'});
    const reviewContext=await until(findExtensionContext,'015 P1 context');await installQuickClock(reviewContext);
    const observedBefore=await page.evaluate(()=>window.localStorage.getItem('xsched.probe.lastScheduled'));
    await page.evaluate(()=>{
      history.pushState({},'','/compose/post/unsent/scheduled?fixture=quick-composer');
      const scope=document.createElement('div');scope.id='fixture-incoming-list';scope.setAttribute('role','dialog');scope.setAttribute('aria-busy','true');
      const tab=document.createElement('div');tab.setAttribute('role','tab');tab.setAttribute('aria-selected','true');tab.textContent='Scheduled';scope.append(tab);
      const empty=document.createElement('div');empty.textContent='Nothing scheduled yet.';scope.append(empty);document.body.append(scope);
    });
    await until(async()=> (await probeState(page)).mode==='scheduled','015 incoming Scheduled');await sleep(650);
    assert(await page.evaluate(value=>window.localStorage.getItem('xsched.probe.lastScheduled')===value,observedBefore),'P1(c) loading Scheduled must preserve observed source-2 cache');

    // P1(g): confirmed empty is distinct from the old unread-cache disabled case.
    await page.evaluate(()=>document.getElementById('fixture-incoming-list').removeAttribute('aria-busy'));
    await until(()=>page.evaluate(()=>window.localStorage.getItem('xsched.probe.lastScheduled')===null),'015 confirmed empty read');
    await page.evaluate(()=>{history.pushState({},'','/compose/post?fixture=quick-composer');document.getElementById('fixture-incoming-list').remove();});
    await until(()=>page.evaluate(()=>{const button=document.querySelector('.xsched-composer-root')?.shadowRoot.querySelector('[data-xsched-composer-slot="random"]');return button && !button.disabled;}),'015 empty-list random enabled');
    await composerClick('random');
    await until(()=>page.evaluate(()=>document.querySelector('.xsched-composer-notice')?.shadowRoot.querySelector('[role="status"]')?.textContent.includes('Fields filled')),'015 empty-list random filled');
    assert(await page.evaluate(()=>{
      const val=key=>document.getElementById('fake-select-'+key).value;
      const hour=Number(val('hour'))%12+(val('period')==='PM'?12:0);
      const at=new Date(Number(val('year')),Number(val('month'))-1,Number(val('day')),hour,Number(val('minute')));
      const range=JSON.parse(window.localStorage.getItem('xsched.probe.quickRange')) || {a:10,b:30};
      const delta=at.getTime()-Date.now();
      return window.localStorage.getItem('xsched.probe.lastScheduled')===null && delta>=Math.max(5,range.a)*60000 && delta<=Math.max(5,range.b)*60000 && window.fixtureSend.icon===1 && window.fixtureSend.schedule===0 && window.fixtureSend.submit===0;
    }),'P1(g) confirmed zero schedules fill now plus A-B with no last-time cache or sends');

    // P1(d): this is a test-user Schedule click, never extension activation.
    if((await probeState(page)).expanded==='false')await toggle(true);
    await page.evaluate(()=>{const button=document.getElementById('schedule');button.textContent='Schedule';button.addEventListener('click',()=>document.querySelector('[role="dialog"]').remove(),{once:true});});
    await page.click('#schedule');
    await until(()=>page.evaluate(()=>JSON.parse(window.localStorage.getItem('xsched.probe.lastScheduled') || 'null')?.source===2),'015 observed scheduling completion');
    assert(await page.evaluate(()=>{
      const text=document.getElementById('xsched-probe-root').shadowRoot.querySelector('.quick-status').textContent;
      return text==='Scheduling completion observed' && !text.includes('not scheduled yet') && window.fixtureSend.schedule===1 && window.fixtureSend.submit===0;
    }),'P1(d) successful user scheduling clears not-scheduled status');

    // P1(b): only a proven picker that actually overlaps moves the panel.
    await composerClick('morning');
    await until(()=>page.evaluate(()=>document.getElementById('fake-select-year')?.value==='2028'),'015 next proven picker');
    await page.evaluate(()=>Object.assign(document.querySelector('[aria-modal="true"]').style,{left:'900px',top:'16px',width:'100px',height:'100px',maxHeight:'100px',overflow:'auto'}));
    await sleep(650);await reviewDragPanelTo(100,80);await sleep(650);
    const clearPickerPanel=await panelRect();
    const savedDraggedPoint=await page.evaluate(()=>window.localStorage.getItem('xsched.probe.panelPos'));
    await page.evaluate(point=>Object.assign(document.querySelector('[aria-modal="true"]').style,{left:(point.x+point.width-30)+'px',top:(point.y+20)+'px'}),clearPickerPanel);
    await until(async()=> (await panelRect()).x===clearPickerPanel.x-38,'015 minimal picker avoidance');
    assert(await page.evaluate(({point,saved})=>{
      const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector('section').getBoundingClientRect(),native=document.querySelector('[aria-modal="true"]').getBoundingClientRect();
      return point.x===100 && point.y===80 && r.left===point.x-38 && r.top===point.y && !(r.left<native.right && r.right>native.left && r.top<native.bottom && r.bottom>native.top) && window.localStorage.getItem('xsched.probe.panelPos')===saved;
    },{point:clearPickerPanel,saved:savedDraggedPoint}),'P1(b) retain a clear dragged point; overlapping picker takes shortest 38px escape without saving it');
    await page.evaluate(()=>document.querySelector('[role="dialog"]').remove());
    await until(async()=> (await panelRect()).x===100 && (await panelRect()).y===80,'015 dragged point restored after picker');

    // P1(f): physically drag behind each action, then verify the target still hits.
    const hits=[];
    for(const selector of ['[data-xsched-copy]','.panel-author']) {
      const target=await page.evaluate(selector=>{const r=document.getElementById('xsched-probe-root').shadowRoot.querySelector(selector).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};},selector);
      if(hits.length){await clickShadow('[data-xsched-minimize]');await until(async()=> (await probeState(page)).expanded==='false','015 minimize for next shortcut drag');}
      await reviewDragButtonTo(target.x-22,target.y-22);
      if(hits.length)await toggle(true);
      hits.push(await page.evaluate(({selector,target})=>{
        const host=document.getElementById('xsched-probe-root'),root=host.shadowRoot,element=root.querySelector(selector);
        return document.elementFromPoint(target.x,target.y)===host && root.elementFromPoint(target.x,target.y)?.closest(selector)===element;
      },{selector,target}));
    }
    assert(hits.length===2 && hits.every(Boolean),'P1(f) dragged Dagaz cannot cover Copy diagnostics or author link');

    // P1(e): full page reload of this composer restores the last JSON boolean switch.
    // The shortcut may sit under the open panel after P1(f); collapse with minimize.
    await until(async () => {
      const state = await probeState(page);
      return state.expanded === 'true' && state.panelVisible === true ? state : null;
    }, '015 panel open before reload');
    assert(await page.evaluate(() => window.localStorage.getItem('xsched.probe.panelOpen') === 'true'), '015 open switch is stored as JSON true');
    await page.reload({waitUntil:'domcontentloaded'});
    await until(async () => {
      const state = await probeState(page);
      return state.expanded === 'true' && state.panelVisible === true ? state : null;
    }, '015 open panel survives full reload');
    await clickShadow('[data-xsched-minimize]');
    await until(async () => {
      const state = await probeState(page);
      return state.expanded === 'false' && state.panelVisible === false ? state : null;
    }, '015 minimize before collapsed reload');
    assert(await page.evaluate(() => window.localStorage.getItem('xsched.probe.panelOpen') === 'false'), '015 collapsed switch is stored as JSON false');
    await page.reload({waitUntil:'domcontentloaded'});
    await until(async () => {
      const state = await probeState(page);
      return state.expanded === 'false' && state.panelVisible === false ? state : null;
    }, '015 collapsed panel survives full reload');

    console.log('  ✓ 015: three composer uses, 320px toolbar, sole icon click, native readback, failure rollback and zero sends');

    // ── 0.1.6: new-post slots only; dropped panel stays over the compose modal ─
    await page.setViewport({width:1280,height:820});
    await open('quick-composer','/compose/post');
    await until(()=>page.evaluate(()=>document.querySelector('#fake-composer .xsched-composer-root')?.shadowRoot.querySelector('[data-xsched-composer-slot="morning"]')),'016 new post slots mounted');
    await page.evaluate(()=>{
      const icon=()=>document.querySelector('#fake-composer [data-testid="scheduleOption"]').cloneNode(true);
      const editor=()=>{const node=document.createElement('div');node.setAttribute('data-testid','tweetTextarea_0');node.setAttribute('role','textbox');node.textContent='';return node;};
      const reply=document.createElement('div');reply.id='fixture-reply';reply.setAttribute('role','dialog');reply.setAttribute('aria-modal','true');
      const article=document.createElement('article');article.setAttribute('data-testid','tweet');
      const text=document.createElement('div');text.setAttribute('data-testid','tweetText');text.textContent='parent post';article.append(text);
      reply.append(article,editor(),icon());
      const quote=document.createElement('div');quote.id='fixture-quote';quote.setAttribute('role','dialog');quote.setAttribute('aria-modal','true');
      const card=document.createElement('div');card.setAttribute('data-testid','quoteTweet');quote.append(editor(),card,icon());
      document.body.append(reply,quote);
    });
    await until(()=>page.evaluate(()=>{
      const slots=root=>root?.querySelector('.xsched-composer-root')?.shadowRoot?.querySelectorAll('[data-xsched-composer-slot]').length || 0;
      return slots(document.getElementById('fake-composer'))===5
        && slots(document.getElementById('fixture-reply'))===0
        && slots(document.getElementById('fixture-quote'))===0
        && document.getElementById('fixture-reply').getAttribute('role')==='dialog'
        && document.getElementById('fixture-quote').querySelector('[data-testid="quoteTweet"]') ? true : null;
    }),'016 reply and quote composers have no quick slots; the new post still has five');
    await page.evaluate(()=>{
      const form=document.getElementById('fake-composer');
      const shell=document.createElement('div');shell.id='fixture-compose-shell';
      shell.style.cssText='position:fixed;left:24px;top:24px;width:720px;height:640px;z-index:20;background:#15202b;box-sizing:border-box';
      const modal=document.createElement('div');modal.id='fixture-compose-modal';
      modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Compose');
      modal.style.cssText='width:100%;height:100%;box-sizing:border-box';
      form.before(shell);shell.append(modal);modal.append(form);
    });
    await page.evaluateOnNewDocument(()=>{
      const install=()=>{
        if(document.getElementById('fixture-compose-shell'))return;
        const form=document.getElementById('fake-composer');if(!form)return;
        const shell=document.createElement('div');shell.id='fixture-compose-shell';
        shell.style.cssText='position:fixed;left:24px;top:24px;width:720px;height:640px;z-index:20;background:#15202b;box-sizing:border-box';
        const modal=document.createElement('div');modal.id='fixture-compose-modal';
        modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Compose');
        modal.style.cssText='width:100%;height:100%;box-sizing:border-box';
        form.before(shell);shell.append(modal);modal.append(form);
      };
      if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
    });
    if((await probeState(page)).expanded!=='true')await toggle(true);
    await reviewDragPanelTo(80,72);
    await sleep(700);
    assert(await page.evaluate(()=>{
      const root=document.getElementById('xsched-probe-root').shadowRoot;
      const panel=root.querySelector('section').getBoundingClientRect();
      const shell=document.getElementById('fixture-compose-shell').getBoundingClientRect();
      const modal=document.getElementById('fixture-compose-modal');
      const pos=JSON.parse(window.localStorage.getItem('xsched.probe.panelPos') || 'null');
      const status=root.querySelector('.quick-status')?.textContent || '';
      return location.pathname==='/compose/post' && modal?.getAttribute('role')==='dialog'
        && panel.left===80 && panel.top===72 && pos?.x===80 && pos?.y===72
        && panel.left<shell.right && panel.right>shell.left && panel.top<shell.bottom && panel.bottom>shell.top
        && /not detected|未偵測到排程欄位|未检测到排程字段/.test(status);
    }),'016 released drag over the compose modal stays; avoidance does not pull it back');
    const droppedPos=await page.evaluate(()=>window.localStorage.getItem('xsched.probe.panelPos'));
    await page.reload({waitUntil:'domcontentloaded'});
    await until(async()=>{
      const rect=await panelRect();
      const state=await probeState(page);
      return rect.x===80 && rect.y===72 && state.mode==='other' && state.panelVisible ? rect : null;
    },'016 dropped panel survives reload over the compose modal');
    assert(await page.evaluate(saved=>window.localStorage.getItem('xsched.probe.panelPos')===saved && document.getElementById('fixture-compose-modal')?.getAttribute('role')==='dialog',droppedPos),'016 reload keeps the dropped panelPos while the compose dialog is open');
    console.log('  ✓ 016: reply/quote have no slots; drag over compose modal stays after release and reload');

    // ── 0.2.0 overview: cache list, empty/expired prompts, SPA/reload, drag/toggle ─
    async function overviewState() {
      return page.evaluate(() => {
        const root = document.getElementById('xsched-probe-root')?.shadowRoot;
        const box = root?.querySelector('.overview-root');
        return {
          status: box?.dataset.xschedOverviewStatus || '',
          count: box?.dataset.xschedOverviewCount || '',
          statusText: box?.querySelector('.overview-status')?.textContent || '',
          next: box?.querySelector('.overview-next')?.textContent || '',
          sync: box?.querySelector('.overview-sync')?.textContent || '',
          times: box ? [...box.querySelectorAll('.overview-when')].map(el => el.textContent) : [],
          previews: box ? [...box.querySelectorAll('.overview-preview')].map(el => el.textContent) : [],
          rows: box ? box.querySelectorAll('.overview-row').length : 0,
          liveTimes: root ? [...root.querySelectorAll('.time')].map(el => el.textContent) : [],
          countText: root?.querySelector('.count')?.textContent || ''
        };
      });
    }
    async function ensureOverviewOpen() {
      await until(async () => {
        const s = await probeState(page);
        return s.present && s.mounted === '1' && typeof s.diag === 'string' && s.diag.startsWith('xsched probe v0.2.0') ? s : null;
      }, '020 overlay diagnostic ready');
      if ((await probeState(page)).expanded !== 'true') await toggle(true);
    }
    async function ensureOverviewClosed() {
      if ((await probeState(page)).expanded !== 'true') return;
      await clickShadow('[data-xsched-minimize]');
      await until(async () => {
        const s = await probeState(page);
        return s.expanded === 'false' && s.panelVisible === false ? s : null;
      }, '020 panel minimized');
    }
    await page.evaluate(() => window.localStorage.removeItem('xsched.probe.overview'));
    await open('home', '/home');
    await ensureOverviewOpen();
    const missing = await overviewState();
    assert(missing.status === 'missing', '020 missing cache is an explicit unsynced state');
    assert(/not synced|尚未同步/i.test(missing.statusText), '020 missing copy must not say the list is empty');
    assert(!/empty list confirmed|沒有已排程的推文（已確認/i.test(missing.statusText), '020 missing is not confirmed empty');
    assert(missing.rows === 0 && missing.countText === 'xsched 探針：非 Scheduled 頁', '020 home heading unchanged without a cache');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-missing.png') });
    const stale = { s: Date.now() - 86400000 - 1000, n: 1, i: [{ t: Date.now() + 3600000, p: 'Synthetic stale overview row' }] };
    await page.evaluate(value => window.localStorage.setItem('xsched.probe.overview', JSON.stringify(value)), stale);
    await open('home', '/home');
    await ensureOverviewOpen();
    const expired = await overviewState();
    assert(expired.status === 'expired', '020 expired cache is marked expired, not empty');
    assert(/expired|過期|过期/i.test(expired.statusText), '020 expired prompt is visible');
    assert(expired.previews[0] === 'Synthetic stale overview row', '020 expired rows remain visible');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-expired.png') });
    await open('overview-multi');
    await until(async () => (await probeState(page)).count === 3, '020 three reverse-order 2028 rows');
    const live = await overviewState();
    assert(live.status === 'ready' && live.count === '3', '020 scheduled page summary uses the live list');
    assert(JSON.stringify(live.liveTimes) === JSON.stringify(['2028-01-01 09:00 (Sat)', '2028-02-06 12:30 (Sun)', '2028-03-01 21:00 (Wed)']), '020 live list is sorted even when DOM order is reversed');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-sorted.png') });
    await page.evaluate(() => history.pushState({}, '', '/home?fixture=overview-multi'));
    await until(async () => (await probeState(page)).mode === 'other', '020 SPA leaves Scheduled without a document navigation');
    await ensureOverviewOpen();
    const spa = await overviewState();
    assert(spa.status === 'ready' && spa.rows === 3, '020 SPA does not clear the overview snapshot');
    assert(JSON.stringify(spa.times) === JSON.stringify(['2028-01-01 09:00 (Sat)', '2028-02-06 12:30 (Sun)', '2028-03-01 21:00 (Wed)']), '020 cached rows stay chronological after SPA');
    assert(spa.countText === 'xsched 探針：非 Scheduled 頁' && spa.liveTimes.length === 0, '020 off-Scheduled rows do not reuse live .time nodes');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-spa.png') });
    const beforeDrag = { button: await buttonRect(), panel: await panelRect() };
    await ensureOverviewClosed();
    await toggle(true);
    const afterToggle = await overviewState();
    assert(afterToggle.status === 'ready' && afterToggle.rows === 3, '020 closing and opening the panel keeps the overview');
    assert(JSON.stringify(await buttonRect()) === JSON.stringify(beforeDrag.button), '020 toggle does not move the shortcut');
    await reviewDragPanelTo(120, 90);
    const afterDrag = await overviewState();
    const draggedPanel = await panelRect();
    assert(draggedPanel.x === 120 && draggedPanel.y === 90, '020 panel drag still stores an independent point');
    assert(JSON.stringify(await buttonRect()) === JSON.stringify(beforeDrag.button), '020 panel drag does not move the shortcut');
    assert(afterDrag.status === 'ready' && afterDrag.rows === 3, '020 dragging the panel does not drop overview rows');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-toggle-drag.png') });
    await open('home', '/home');
    await ensureOverviewOpen();
    const beforeReload = await overviewState();
    assert(beforeReload.rows === 3, '020 home still shows the cached list before reload');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ensureOverviewOpen();
    const reloaded = await overviewState();
    assert(reloaded.status === 'ready' && reloaded.rows === 3, '020 full reload still shows the overview snapshot');
    assert(JSON.stringify(reloaded.times) === JSON.stringify(['2028-01-01 09:00 (Sat)', '2028-02-06 12:30 (Sun)', '2028-03-01 21:00 (Wed)']), '020 reload keeps chronological previews');
    await page.screenshot({ path: join(DOCS, 'v1.0-overview020-reload.png') });
    const walkTimes = ['2028-01-01 09:00 (Sat)', '2028-02-06 12:30 (Sun)', '2028-03-01 21:00 (Wed)'];
    for (let round = 1; round <= 3; round++) {
      await ensureOverviewOpen();
      await ensureOverviewClosed();
      await toggle(true);
      const walked = await overviewState();
      assert(walked.status === 'ready' && walked.rows === 3, `020 walk ${round} toggle keeps overview`);
      assert(JSON.stringify(walked.times) === JSON.stringify(walkTimes), `020 walk ${round} order after toggle`);
      await page.evaluate(round => history.pushState({}, '', round % 2 ? '/compose/post?fixture=home' : '/home?fixture=home'), round);
      await until(async () => (await probeState(page)).mode === 'other', `020 walk ${round} SPA stays off Scheduled`);
      await ensureOverviewOpen();
      assert((await overviewState()).rows === 3, `020 walk ${round} SPA does not clear overview`);
      const walkButton = await buttonRect();
      await reviewDragPanelTo(128, 88);
      assert(JSON.stringify(await buttonRect()) === JSON.stringify(walkButton), `020 walk ${round} drag leaves the shortcut`);
      assert((await overviewState()).rows === 3, `020 walk ${round} drag keeps overview`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await ensureOverviewOpen();
      const walkReload = await overviewState();
      assert(walkReload.status === 'ready' && walkReload.rows === 3, `020 walk ${round} reload keeps overview`);
      assert(JSON.stringify(walkReload.times) === JSON.stringify(walkTimes), `020 walk ${round} reload order`);
    }
    console.log('  ✓ 020: overview sort, missing/expired prompts, SPA, reload, toggle/drag; 3 consecutive walks');

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
    if (err.stack) console.error(err.stack);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.close();
    rmSync(certDir, { recursive: true, force: true });
    rmSync(profile, { recursive: true, force: true });
  }
  process.exit(failed ? 1 : 0);
}

main();
