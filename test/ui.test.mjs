import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
await import('../probe/ui.js');
await import('../probe/reader.js');
const U = globalThis.XSCHED_UI;
const R = globalThis.XSCHED_READER;
test('shortcut aria-label/title vocabulary includes exactly nine complete languages', () => {
  assert.deepEqual(Object.keys(U.STRINGS).sort(), ['zh-Hant', 'zh-Hans', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'pt'].sort());
  for (const [key, value] of Object.entries(U.STRINGS)) {
    assert.ok(value.shortcut.length > 6 && value.goto.length > 3 && value.collapse.length > 0 && value.reset.length > 0, key);
    assert.equal(U.stringsFor(key, 'en-US'), value);
  }
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-TW']) assert.equal(U.stringsFor(tag, ''), U.STRINGS['zh-Hant']);
  for (const tag of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans-CN']) assert.equal(U.stringsFor(tag, ''), U.STRINGS['zh-Hans']);
  assert.equal(U.stringsFor('unknown', 'ja-JP'), U.STRINGS.ja);
  assert.equal(U.stringsFor('', ''), U.STRINGS.en);
});
test('bounded geometry detects non-button fixed unread widget, excludes our host and invisible widgets', () => {
  const {document}=parseHTML('<html><body><div class="unread"><span>1</span></div><div class="hidden"></div><div data-xsched-host="1"></div></body></html>');
  const widget=document.querySelector('.unread');
  const hidden=document.querySelector('.hidden');
  const own=document.querySelector('[data-xsched-host]');
  const rect={left:1208,right:1264,top:488,bottom:544,width:56,height:56};
  for(const el of document.querySelectorAll('*')) el.getBoundingClientRect=()=>rect;
  let points=0;let styles=0;
  document.elementsFromPoint=()=>{points++; return [own,hidden,widget.firstElementChild,widget,document.body];};
  const result=U.collectObstacles(document,el=>{styles++;return {position:el===widget?'fixed':'static',display:el===hidden?'none':'block',visibility:'visible'};},1280,600);
  assert.deepEqual(result,[rect]); assert.ok(points<=320);assert.ok(styles<=768);
  const place=U.placement(1280,600,result);
  assert.ok(place.clear);
  const anchor={x:1280-place.right-44,y:600-place.bottom-44};
  assert.ok(!U.overlaps({left:anchor.x,right:anchor.x+44,top:anchor.y,bottom:anchor.y+44},rect));
  const panel=U.panelPlacement(1280,600,anchor,result,360,160);
  assert.ok(panel.clear && !U.overlaps(panel,rect));
});
test('geometry sees body/html injected wrappers but completely excludes modal content and backdrops',()=>{
  const {document}=parseHTML('<html><body><div class="injected-square"></div><div role="dialog" aria-modal="true"><button>Fake draft</button></div><div class="backdrop"></div></body></html>');
  const round=document.createElement('div');document.documentElement.append(round);
  const square=document.querySelector('.injected-square');
  const dialog=document.querySelector('[role="dialog"]'),backdrop=document.querySelector('.backdrop');
  const rect={left:1040,right:1088,top:660,bottom:708,width:48,height:48};
  for(const el of document.querySelectorAll('*')) el.getBoundingClientRect=()=>el===backdrop?{left:0,top:0,right:1100,bottom:820,width:1100,height:820}:rect;
  document.elementsFromPoint=()=>[dialog.firstElementChild,dialog,backdrop,round,square];
  const out=U.collectObstacles(document,()=>({position:'fixed',display:'block'}),1100,820);
  assert.deepEqual(out,[rect,rect],'only two non-modal floating wrappers survive');
});
test('geometry query and ancestor inspection remain bounded on a large page', () => {
  const {document}=parseHTML('<html><body>'+Array.from({length:1500},()=>'<button>fake</button>').join('')+'</body></html>');
  let inspected=0;
  const out=U.collectObstacles(document,()=>{inspected++;return {position:'static'};},1280,600);
  assert.deepEqual(out,[]);assert.ok(inspected<=160);
  assert.equal(U.placement(100,100,[{left:0,right:100,top:0,bottom:100}],100).clear,false);
});
test('shortcut placement clears elevated FAB and open drawer in desktop/narrow viewports', () => {
  for (const width of [1100, 390]) {
    const fab = { left: width - 76, right: width - 20, top: 656, bottom: 712 };
    const place = U.placement(width, 820, [fab]);
    assert.ok(place.clear);
    assert.ok(!U.overlaps({ left: width - place.right - 44, right: width - place.right, top: 820 - place.bottom - 44, bottom: 820 - place.bottom }, fab));
  }
  const drawer = { left: 700, right: 1100, top: 200, bottom: 820 };
  const place = U.placement(1100, 820, [drawer]);
  assert.ok(place.clear);
  const anchor={x:1100-place.right-44,y:820-place.bottom-44};
  assert.ok(!U.overlaps({left:anchor.x,right:anchor.x+44,top:anchor.y,bottom:anchor.y+44},drawer));
  const panel=U.panelPlacement(1100,820,anchor,[drawer],350,160);
  assert.ok(panel.clear && !U.overlaps(panel,drawer));
});
test('version header detects mismatch/invalidated runtime without echoing arbitrary values', () => {
  assert.equal(R.versionLine('0.1.1'), 'xsched probe v0.1.1 (manifest 0.1.1)');
  assert.match(R.versionLine('0.0.2'), /⚠ 版本不符：script 0.1.1 \/ manifest 0.0.2.*重新整理/);
  assert.match(R.versionLine(undefined, true), /擴充已重新載入，請重新整理頁面/);
  for (const value of ['@private https://private.example/', {}, null, '1.2.3\nsecret']) {
    assert.equal(R.versionLine(value), 'xsched probe v0.1.1 (manifest unknown)');
  }
  assert.match(R.buildDiagnostic({ manifestVersion: '0.1.1' }), /^xsched probe v0\.1\.1 \(manifest 0\.1\.1\)\n/);
});
test('all package and script versions are 0.1.1', async () => {
  await import('../probe/skeleton.js');
  for (const file of ['../package.json', '../package-lock.json', '../probe/manifest.json']) {
    assert.equal(JSON.parse(readFileSync(new URL(file, import.meta.url))).version, '0.1.1');
  }
  assert.equal(R.PROBE_VERSION, '0.1.1');
  assert.equal(globalThis.XSCHED_SKELETON.SKELETON_VERSION, '0.1.1');
});
