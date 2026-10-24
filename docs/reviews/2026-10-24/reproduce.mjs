// Reuse the production-content test harness without changing its tracked source.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const ROOT=new URL('../../../',import.meta.url);
const harnessURL=new URL('test/content.test.mjs',ROOT);
let harness=readFileSync(harnessURL,'utf8').split("test('panel author link",1)[0];
harness=harness.replace("from 'linkedom'",'from '+JSON.stringify(new URL('node_modules/linkedom/esm/index.js',ROOT).href))
 .replaceAll("await import('../probe/", "await import('"+new URL('probe/',ROOT).href)
 .replaceAll('import.meta.url',JSON.stringify(harnessURL.href));
const reproductions = "let time = new Date(2028,0,1,8,0,0);\nconst f=fixture('/compose/post/unsent/scheduled','zh-Hant','../fixtures/calendar.html',()=>time);\nconst input=f.shadow().querySelector('[data-xsched-range=\"a\"]');\nconst original=input.value; input.value='123';\ntime=new Date(time.getTime()+61000); f.poll();\nconst current=f.shadow().querySelector('[data-xsched-range=\"a\"]');\nconsole.log(JSON.stringify({case:'unsaved-input-after-countdown-tick',original,typed:'123',after:current.value,sameNode:input===current}));\nassert.notEqual(input,current); assert.equal(current.value,original);\nconst O=globalThis.XSCHED_OVERVIEW, at=new Date(2028,0,1,9);\nconst merged=O.mergeSnapshots([{at,preview:'Post A'}],[{at,preview:'Post B'}]);\nconsole.log(JSON.stringify({case:'two-distinct-posts-same-minute-in-separate-windows',expectedDistinctPosts:2,result:merged.map(x=>x.preview)}));\nassert.deepEqual(merged.map(x=>x.preview),['Post B']);\n";
await import('data:text/javascript;base64,'+Buffer.from(harness+reproductions).toString('base64'));
