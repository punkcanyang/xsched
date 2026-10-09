import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
await import('../probe/ui.js');
await import('../probe/reader.js');
const U = globalThis.XSCHED_UI;
const R = globalThis.XSCHED_READER;
test('shortcut aria-label/title vocabulary includes exactly nine complete languages', () => {
  assert.deepEqual(Object.keys(U.STRINGS).sort(), ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt'].sort());
  for (const [key, value] of Object.entries(U.STRINGS)) {
    assert.ok(value.shortcut.length > 6 && value.goto.length > 3, key);
    assert.equal(U.stringsFor(key, 'en-US'), value);
  }
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW']) assert.equal(U.stringsFor(tag, ''), U.STRINGS['zh-Hant']);
  for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans-CN']) assert.equal(U.stringsFor(tag, ''), U.STRINGS['zh-Hans']);
  assert.equal(U.stringsFor('unknown', 'ja-JP'), U.STRINGS.ja);
  assert.equal(U.stringsFor('', ''), U.STRINGS.en);
});
test('shortcut placement clears elevated FAB and open drawer in desktop/narrow viewports', () => {
  for (const width of [1100, 390]) {
    const fab = { left: width - 76, right: width - 20, top: 656, bottom: 712 };
    const place = U.placement(width, 820, [fab]);
    assert.ok(place.clear);
    assert.ok(!U.overlaps({ left: width - place.right - 44, right: width - place.right, top: 820 - place.bottom - 44, bottom: 820 - place.bottom }, fab));
  }
  const drawer = { left: 700, right: 1100, top: 200, bottom: 820 };
  const place = U.placement(1100, 820, [drawer], 350);
  assert.ok(place.clear);
  assert.ok(1100 - place.right <= drawer.left - 8);
});
test('version header detects mismatch/invalidated runtime without echoing arbitrary values', () => {
  assert.equal(R.versionLine('0.0.3'), 'xsched probe v0.0.3 (manifest 0.0.3)');
  assert.match(R.versionLine('0.0.2'), /⚠ 版本不符：script 0.0.3 \/ manifest 0.0.2.*重新整理/);
  assert.match(R.versionLine(undefined, true), /擴充已重新載入，請重新整理頁面/);
  for (const value of ['@private https://private.example/', {}, null, '1.2.3\nsecret']) {
    assert.equal(R.versionLine(value), 'xsched probe v0.0.3 (manifest unknown)');
  }
  assert.match(R.buildDiagnostic({ manifestVersion: '0.0.3' }), /^xsched probe v0\.0\.3 \(manifest 0\.0\.3\)\n/);
});
test('all package and script versions are 0.0.3', async () => {
  await import('../probe/skeleton.js');
  for (const file of ['../package.json', '../package-lock.json', '../probe/manifest.json']) {
    assert.equal(JSON.parse(readFileSync(new URL(file, import.meta.url))).version, '0.0.3');
  }
  assert.equal(R.PROBE_VERSION, '0.0.3');
  assert.equal(globalThis.XSCHED_SKELETON.SKELETON_VERSION, '0.0.3');
});
