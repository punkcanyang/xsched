import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import * as fs from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
await import('../probe/ui.js');
const U=globalThis.XSCHED_UI;
const source=fs.readFileSync(new URL('../probe/position.js',import.meta.url),'utf8');
const key='xsched.probe.pos';
function storage(hostname='x.com') {
  const data=new Map(), calls=[];
  const window={location:{hostname},localStorage:{
    getItem(key){calls.push(['get',key]);return data.get(key)??null;},
    setItem(key,value){calls.push(['set',key]);data.set(key,value);},
    removeItem(key){calls.push(['remove',key]);data.delete(key);},
  }};
  const context=vm.createContext({window});vm.runInContext(source,context);
  return { api:context.XSCHED_POSITION, window, data, calls };
}
test('position boundary persists exactly finite x/y under one fixed xsched key',()=>{
  const f=storage();
  assert.equal(f.api.load(),null);
  for(const value of [null,[],{}, {x:'1',y:2},{x:NaN,y:2},{x:Infinity,y:2},{x:1,y:-Infinity},{x:1,y:2,text:'private'}]) assert.equal(f.api.save(value),false);
  assert.equal(f.data.size,0);
  assert.equal(f.api.save({x:123.5,y:456}),true);
  assert.deepEqual(JSON.parse(f.data.get(key)),{x:123.5,y:456});
  assert.deepEqual({...f.api.load()},{x:123.5,y:456});
  for(const [,storedKey] of f.calls) assert.equal(storedKey,key);
  assert.equal(f.api.reset(),true);assert.equal(f.data.size,0);
});
test('untrusted position JSON, throwing storage and changed getters fail closed',()=>{
  const f=storage();
  for(const raw of ['{','null','[]','{"x":"1","y":2}','{"x":null,"y":2}','{"x":1,"y":2,"account":"private"}','{"x":1e999,"y":2}',' '.repeat(129)]) {
    f.data.set(key,raw);assert.equal(f.api.load(),null,raw);
  }
  f.data.clear();let reads=0;
  assert.equal(f.api.save({get x(){return ++reads<=2?1:'private';},y:2}),false);
  assert.equal(f.data.size,0);
  Object.defineProperty(f.window,'localStorage',{get(){throw new Error('private exception');}});
  assert.equal(f.api.load(),null);assert.equal(f.api.save({x:1,y:2}),false);assert.equal(f.api.reset(),false);
  const other=storage('twitter.com');assert.equal(other.api.load(),null);assert.equal(other.api.save({x:1,y:2}),false);assert.equal(other.api.reset(),false);assert.equal(other.calls.length,0);
});
test('position clamping and panel directions keep the anchor immutable and the panel within 60vh',()=>{
  for(const anchor of [{x:16,y:16},{x:1040,y:16},{x:16,y:740},{x:1040,y:740},{x:530,y:388}]) {
    const before={...anchor};
    const panel=U.panelPlacement(1100,820,anchor,[],492,160);
    assert.ok(panel.clear);assert.ok(panel.maxHeight<=492);
    assert.ok(panel.left>=16 && panel.right<=1084 && panel.top>=16 && panel.bottom<=804);
    assert.ok(!U.overlaps(panel,{left:anchor.x,right:anchor.x+44,top:anchor.y,bottom:anchor.y+44}));
    assert.deepEqual(anchor,before);
  }
  const original={x:1000,y:700};
  assert.deepEqual(U.clampPosition(original,390,600),{x:330,y:540});
  assert.deepEqual(original,{x:1000,y:700});
  assert.deepEqual(U.clampPosition(original,1100,820),original);
  assert.equal(U.panelPlacement(100,100,{x:16,y:16},[],100,160).clear,false);
});
test('panel avoids native controls without moving the button; placement ignores panel size',()=>{
  const obstacle={left:900,right:980,top:600,bottom:655,width:80,height:55};
  const closed=U.placement(1100,820,[obstacle]);
  assert.deepEqual(U.placement(1100,820,[obstacle],350),closed);
  const anchor={x:1100-closed.right-44,y:820-closed.bottom-44};
  const panel=U.panelPlacement(1100,820,anchor,[obstacle],350,160);
  assert.ok(panel.clear && !U.overlaps(panel,obstacle));
  assert.deepEqual(anchor,{x:1040,y:664});
});
test('actual verify scanner locks storage to the exact audited root module, including 17 bypass self-tests',()=>{
  // Execute the actual static guard functions without its DOM leak-test imports.
  // This leaves the full npm verify path and all its existing checks unchanged.
  const url=new URL('../scripts/verify.mjs',import.meta.url);
  const code=fs.readFileSync(url,'utf8').split('// Run static checks before executing')[0]
    .replace(/^import[\s\S]*?;\n/gm,'').replace(/\bexport /g,'')
    .replaceAll('import.meta.url',JSON.stringify(url.href));
  const context=vm.createContext({...fs,dirname,join,relative,fileURLToPath,inflateSync,createHash,Buffer,console});
  vm.runInContext(code+'\nglobalThis.guard={scanSource,checkProbeDir,positionStorageSelfTest};',context);
  const guard=context.guard;
  assert.equal(guard.positionStorageSelfTest(),17);
  assert.equal(guard.scanSource(source,'probe/position.js',{positionModule:true}).length,0);
  assert.ok(guard.scanSource(source,'probe/other.js').length>0);
  const result=guard.checkProbeDir(fileURLToPath(new URL('../probe',import.meta.url)));
  assert.equal(result.errors.length,0,Array.from(result.errors).join('\n'));
});
