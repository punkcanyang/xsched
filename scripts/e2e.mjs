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
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
    body = readFileSync(join(FIXTURES, `${name}.html`), "utf8");
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
      count: Number(host.dataset.xschedCount || "0"),
      scrolled: host.dataset.xschedScrolled || "",
      diag: host.dataset.xschedDiag || "",
      countText: pick(".count"),
      times: shadow ? [...shadow.querySelectorAll(".time")].map((el) => el.textContent) : [],
      hint: pick(".hint"),
    };
  });
}

const CASES = [
  { fixture: "en", file: "gate0-en.png", count: 2, times: ["Fri, Oct 10, 2026 at 9:00 AM", "Mon, Nov 9, 2026 at 8:05 PM"] },
  { fixture: "ja", file: "gate0-ja.png", count: 2, times: ["2026年7月20日(月)の午後4:24に送信されます", "2026年8月3日(月)の午前9:05に送信されます"] },
  { fixture: "zh-Hans", file: "gate0-zh-Hans.png", count: 2, times: ["将于2026年10月10日 上午9:00发送", "将于2026年11月9日 下午8:05发送"] },
  { fixture: "zh-Hant", file: "gate0-zh-Hant.png", count: 2, times: ["將於2026年10月10日 上午9:00傳送", "將於2026年11月9日 下午8:05傳送"] },
  { fixture: "ko", file: "gate0-ko.png", count: 2, times: ["2026년 10월 10일 오전 9:00에 전송됩니다", "2026년 11월 9일 오후 8:05에 전송됩니다"] },
  { fixture: "roles", file: "gate0-roles-fallback.png", count: 2, layer: "a11y", times: ["Fri, Oct 16, 2026 at 7:30 AM", "Sat, Oct 17, 2026 at 6:00 PM"] },
  { fixture: "empty", file: "gate0-empty.png", count: 0 },
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
      const allowed = allowedRequest({ url: req.url(), type: req.resourceType(), navigation: req.isNavigationRequest() && req.frame() === page.mainFrame() }, navigations);
      if (!allowed) denied.push(`${req.resourceType()} ${req.url()}`);
      void (allowed ? req.continue() : req.abort()).catch((error) => consoleLogs.push(error.message));
    });
    page.on("console", (msg) => consoleLogs.push(msg.text()));
    page.on("pageerror", (err) => consoleLogs.push("pageerror " + err.message));
    await page.setViewport({ width: 1100, height: 820 });

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

    // ── locale + fallback cases ────────────────────────────────────────────────
    for (const testCase of CASES) {
      await open(testCase.fixture);
      const state = await until(async () => {
        const s = await probeState(page);
        if (!s.present) return null;
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

    // Instrument only the fixture's extension isolated world to observe clipboard
    // calls. No clipboard permission, page-world injection, or real account is used.
    await open("en");
    await until(async () => (await probeState(page)).count === 2, "clipboard: initial rows");
    let extensionContext;
    for (const context of contexts.values()) {
      if (context.auxData?.isDefault) continue;
      const result = await network.send("Runtime.evaluate", { contextId: context.id, expression: "typeof globalThis.XSCHED_READER !== 'undefined'", returnByValue: true });
      if (result.result.value) extensionContext = context.id;
    }
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
    assert(/^xsched-gate0 v0\.0\.1 (?:\w+=\d+ ?)+$/.test(copied.result.value[0]), "copied diagnostic contains numeric fields only even if DOM dataset is tampered");
    console.log("  ✓ clipboard: user click only; copied counters cannot leak DOM dataset text");

    // ── virtualized list: the TEST scrolls, the probe only accumulates ──────────
    await open("virtual");
    const before = await until(async () => {
      const s = await probeState(page);
      return s.present && s.count === 3 ? s : null;
    }, "virtual: initial window of 3");
    assert(before.scrolled === "0", "virtual: probe must not have scrolled on its own");
    assert(before.diag.includes("virtualized=1"), `virtual: expected virtualized=1: ${before.diag}`);
    assert(before.hint.includes("請自己往下捲"), `virtual: expected the do-not-auto-scroll hint: ${before.hint}`);
    await page.screenshot({ path: join(DOCS, "gate0-virtual-before.png") });

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
      "Tue, Dec 1, 2026 at 7:00 AM",
      "Tue, Dec 1, 2026 at 12:30 PM",
      "Wed, Dec 2, 2026 at 8:00 PM",
      "Thu, Dec 3, 2026 at 9:15 AM",
      "Fri, Dec 4, 2026 at 6:45 PM",
      "Sat, Dec 5, 2026 at 11:30 AM",
    ]) {
      assert(after.times.includes(want), `virtual: missing accumulated time "${want}"`);
    }
    await page.screenshot({ path: join(DOCS, "gate0-virtual-after.png") });
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
    await until(async () => !(await probeState(page)).present, "SPA: deselected tab hides overlay");
    await page.evaluate(() => document.querySelectorAll('[role="tab"]')[1].setAttribute("aria-selected", "true"));
    await until(async () => (await probeState(page)).count === 2, "SPA: selected tab restores overlay");
    await page.evaluate(() => history.replaceState({}, "", "/home"));
    await until(async () => !(await probeState(page)).present, "SPA: route poll hides overlay on home");
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
    assert(!(await probeState(page)).present, "pagehide stops timers/observer and removes overlay");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await until(async () => (await probeState(page)).count === 2, "bfcache restore restarts probe");
    assert((await probeState(page)).count === 2, "bfcache restore reconstructs current rows without stale state");
    console.log("  ✓ lifecycle: pagehide cleanup and bfcache restart");

    // ── home timeline: probe must hide and read nothing ─────────────────────────
    await open("home", "/home");
    await sleep(900);
    const homeState = await probeState(page);
    assert(!homeState.present, `home: overlay should be hidden, got ${JSON.stringify(homeState)}`);
    console.log("  ✓ home: 0 rows (overlay hidden)");

    for (const subpath of ["/home", "/compose/post/unsent/drafts", "/compose/post/schedule"]) {
      await open("en", subpath); // intentionally contains a selected Scheduled tab
      await sleep(500);
      assert(!(await probeState(page)).present, `${subpath}: selected tab must not override route`);
    }
    console.log("  ✓ non-Scheduled: home, Drafts, picker with adversarial selected tabs");

    // ── network discipline ─────────────────────────────────────────────────────
    assert(denied.length === 0, `unexpected request(s) blocked: ${denied.join(", ")}`);
    for (const event of requests) {
      assert(allowedRequest({ url: event.request.url, type: event.type, navigation: event.type === "Document", extensionInitiator: hasExtensionInitiator(event.initiator) }, navigations), `unexpected request or extension initiator: ${event.type} ${event.request.url}`);
    }
    // The overlay only exists if the content script ran, which only happens if the
    // extension was loaded from probe/.
    assert(sawOverlay, "extension content script never ran (overlay never appeared)");
    console.log(`  ✓ network: ${requests.length} request(s), only local fixture documents / browser favicon; 0 extension requests`);

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
