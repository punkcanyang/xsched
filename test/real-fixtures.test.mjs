import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/reader.js');
const root = new URL('../fixtures/real/', import.meta.url);
const files = readdirSync(root).filter((name) => name.endsWith('.html')).sort();
test('real skeleton fixtures (waiting for owner evidence)', { skip: files.length === 0 }, async (t) => {
  for (const file of files) await t.test(file, () => {
    const expected = JSON.parse(readFileSync(new URL(file.replace(/\.html$/, '.json'), root), 'utf8'));
    assert.equal(typeof expected.pathname, 'string');
    assert.ok(Number.isSafeInteger(expected.count) && expected.count >= 0);
    assert.ok(expected.onScheduled === 0 || expected.onScheduled === 1);
    const { document } = parseHTML(readFileSync(new URL(file, root), 'utf8'));
    const actual = globalThis.XSCHED_READER.readSnapshot(document, { pathname: expected.pathname });
    assert.equal(actual.onScheduled, expected.onScheduled);
    assert.equal(actual.items.length, expected.count);
    if (expected.layer) assert.equal(actual.layer, expected.layer);
    if (expected.times) assert.deepEqual(actual.items.map((item) => item.time), expected.times);
  });
});
