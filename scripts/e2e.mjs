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

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), "..");
const DOCS = join(ROOT, "docs");
const PROBE = join(ROOT, "probe");
const FIXTURES = join(ROOT, "fixtures");

// Chrome needs an X server; there is none by default in this box.
if (!process.env.DISPLAY && !process.env.XSCHED_E2E_REEXEC) {
  const result = spawnSync("xvfb-run", ["-a", process.execPath, SELF], {
    stdio: "inherit",
    env: { ...process.env, XSCHED_E2E_REEXEC: "1" },
  });
  process.exit(result.status == null ? 1 : result.status);
}

const CHROME_PATH = process.env.CHROME_PATH || "/tmp/cft/chrome/linux-155.0.8059.39/chrome-linux64/chrome";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function assert(cond, msg) {
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
  ], { stdio: "ignore" });

  const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, serveFixture);
  let port;
  try {
    port = await listen(server, 0);
  } catch (err) {
    throw new Error(`fixture server failed: ${err}`);
  }

  const profile = mkdtempSync(join(tmpdir(), "xsched-profile-"));
  const requests = [];
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
        `--host-resolver-rules=MAP x.com:443 127.0.0.1:${port}, MAP www.x.com:443 127.0.0.1:${port}, MAP twitter.com:443 127.0.0.1:${port}, EXCLUDE localhost`,
        "--window-size=1100,820",
        `--disable-extensions-except=${PROBE}`,
        `--load-extension=${PROBE}`,
      ],
    });

    const page = await browser.newPage();
    page.on("request", (req) => requests.push(req.url()));
    page.on("console", (msg) => consoleLogs.push(msg.text()));
    page.on("pageerror", (err) => consoleLogs.push("pageerror " + err.message));
    await page.setViewport({ width: 1100, height: 820 });

    const navigations = new Set();
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
        assert(state.diag.includes(`layer=${testCase.layer}`), `${testCase.fixture}: diag should say layer=${testCase.layer}: ${state.diag}`);
      }
      // Diagnostics must never carry content.
      for (const leak of ["Local", "本機", "ローカル", "로컬", "Will send", "http", "x.com"]) {
        assert(!state.diag.includes(leak), `${testCase.fixture}: diag leaked "${leak}": ${state.diag}`);
      }
      await page.screenshot({ path: join(DOCS, testCase.file) });
      console.log(`  ✓ ${testCase.fixture}: ${testCase.count} row(s)`);
    }

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

    // ── home timeline: probe must hide and read nothing ─────────────────────────
    await open("home", "/home");
    await sleep(900);
    const homeState = await probeState(page);
    assert(!homeState.present || homeState.count === 0, `home: overlay should be hidden or 0, got ${JSON.stringify(homeState)}`);
    console.log("  ✓ home: 0 rows (overlay hidden)");

    // ── network discipline ─────────────────────────────────────────────────────
    const external = requests.filter((u) => {
      if (u.startsWith("chrome-extension://") || u.startsWith("data:") || u.startsWith("blob:")) return false;
      return !(u.startsWith("https://x.com/") || u.startsWith("https://www.x.com/") || u.startsWith("https://twitter.com/"));
    });
    assert(external.length === 0, `non-x.com request(s): ${external.join(", ")}`);

    const xcom = requests.filter((u) => u.startsWith("https://x.com/") || u.startsWith("https://twitter.com/"));
    for (const u of xcom) {
      const { pathname } = new URL(u);
      const allowed = navigations.has(u) || pathname === "/favicon.ico";
      assert(allowed, `unexpected x.com request (extension should not fetch): ${u}`);
    }
    // The overlay only exists if the content script ran, which only happens if the
    // extension was loaded from probe/.
    assert(sawOverlay, "extension content script never ran (overlay never appeared)");
    console.log(`  ✓ network: ${requests.length} request(s), all fixture documents / extension files`);

    console.log("\ne2e: OK");
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
