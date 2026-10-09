// Offline reconstruction: parse only element/enum structure, never copy attribute
// prose or original text. Input stays outside the repo. All substitutions are fake.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
const retained = new Set(['role', 'aria-modal', 'aria-hidden', 'aria-selected', 'data-testid']);
const values = new Set(['dialog','group','button','tab','tablist','presentation','navigation','article','true','false','tweetText','cellInnerDiv']);
function parseTree(text) {
  const roots = [];
  const stack = [];
  for (const [index,line] of text.split('\n').entries()) {
    const match = /^( *)([a-z][a-z0-9-]*) c=\d+(.*)$/.exec(line);
    if (!match) continue;
    const depth = match[1].length/2;
    while (stack.length && stack.at(-1).depth >= depth) stack.pop();
    const attrs = {};
    for (const attr of match[3].matchAll(/\b([a-z][a-z0-9-]*)=([^\s]+)/g)) if (retained.has(attr[1]) && values.has(attr[2])) attrs[attr[1]] = attr[2];
    const node = { tag:match[2], attrs, children:[], depth, line:index+1 };
    (stack.length ? stack.at(-1).children : roots).push(node);
    stack.push(node);
  }
  return roots;
}
const descendants = (node) => [node, ...node.children.flatMap(descendants)];
const escape = (s) => s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function reconstruct(text) {
  if (!/^xsched-skeleton v0\.0\.2 path=scheduled nodes=4109\n/.test(text)) throw new Error('expected the supplied owner skeleton header');
  const all = parseTree(text).flatMap(descendants);
  const outer = all.find(n => n.attrs.role === 'dialog');
  const inner = outer && descendants(outer).find(n => n !== outer && n.attrs.role === 'dialog' && n.attrs['aria-modal'] === 'true');
  if (!inner) throw new Error('nested modal absent');
  const rows = descendants(inner).filter(n => n.tag === 'button' && descendants(n).some(c => c.attrs['data-testid'] === 'tweetText'));
  if (rows.length !== 1 || rows[0].line !== 108) throw new Error('owner evidence changed; review count and row paths');
  const time = descendants(rows[0]).find(n => n.tag === 'span' && n.line === 117);
  const tweet = descendants(rows[0]).find(n => n.attrs['data-testid'] === 'tweetText');
  if (!time || !tweet) throw new Error('expected separate time span/body');
  // Preserve exact element nesting L36–124 and enum values. Drop x-valued attributes,
  // classes/styles/SVG geometry and everything unrelated to the modal + one fake
  // background article. No source strings are copied into text replacements.
  function emit(n) {
    const attrs = Object.entries(n.attrs).map(([k,v]) => ` ${k}="${escape(v)}"`).join('');
    let content = n.children.map(emit).join('');
    if (n === time) content = '將於2026年10月10日 上午9:00傳送'; // INFERRED, not recovered
    if (n.line === 123) content = '甲乙'; // synthetic two-character body
    if (n.line === 89) content = '甲乙丙丁戊己';
    if (n.line === 96) content = '甲乙丙'; // labels remain unknown
    return `<${n.tag}${attrs}>${content}</${n.tag}>`;
  }
  const html = '<!doctype html>\n<!-- Owner masked skeleton reconstruction; no real text/IDs. Time grammar and zh-Hant locale are INFERRED synthetic examples, NOT verified X text. -->\n<html lang="zh-Hant"><head><meta charset="utf-8"><title>骨架重建假資料，時間格式推定</title></head><body>\n<p>骨架結構重建，非真頁快照；時間與文字全是假資料</p>\n' + emit(outer) + '\n<div aria-hidden="true"><div data-testid="cellInnerDiv"><article role="article"><time datetime="2026-10-09T09:00:00">09:00</time><div data-testid="tweetText">背景假資料</div></article></div></div>\n</body></html>\n';
  scanFixture(html);
  return html;
}
export function scanFixture(html) {
  if (/(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+|@[\p{L}\p{N}_]+|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b)/iu.test(html)) throw new Error('fixture contains an address, handle or UUID');
  const { document } = parseHTML(html);
  for (const el of document.querySelectorAll('*')) {
    for (const attr of el.attributes) if (!['role','aria-modal','aria-hidden','aria-selected','data-testid','lang','charset','datetime'].includes(attr.name)) throw new Error('unexpected fixture attribute: '+attr.name);
  }
  return true;
}
export function crossYearFixture(html) {
  const { document } = parseHTML(html);
  const row = [...document.querySelectorAll('button')].find(el => el.querySelector('[data-testid="tweetText"]'));
  const clone = row.cloneNode(true);
  const label = el => [...el.querySelectorAll('span')].find(span => !span.closest('[data-testid="tweetText"]'));
  label(row).textContent = '12月31日 下午11:59';
  label(clone).textContent = '1月1日 上午12:05';
  clone.querySelector('[data-testid="tweetText"] span').textContent = '丙丁';
  row.after(clone);
  const result = document.toString();
  scanFixture(result);
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output, mode] = process.argv.slice(2);
  if (!input || !output) throw new Error('usage: node scripts/real-skeleton-fixture.mjs <owner skeleton> <output.html>');
  const ordinary = reconstruct(readFileSync(input,'utf8'));
  const html = mode === '--cross-year' ? crossYearFixture(ordinary) : ordinary;
  writeFileSync(output,html);
  console.log(mode === '--cross-year' ? 'cross-year synthetic 2-row fixture; privacy scan OK' : 'reconstructed 1 modal row, separate source #text(28) time span, synthetic replacement; privacy scan OK');
}
