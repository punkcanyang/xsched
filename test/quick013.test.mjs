import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
await import('../probe/quick.js');await import('../probe/ui.js');
const Q=globalThis.XSCHED_QUICK,U=globalThis.XSCHED_UI;
const now=new Date(2027,11,31,21,0);
test('actual e2e fixture handler serves the numeric 013 name without accepting path traversal',()=>{
  const source=readFileSync(new URL('../scripts/e2e.mjs',import.meta.url),'utf8');
  const handler=source.slice(source.indexOf('function serveFixture('),source.indexOf('\nfunction listen('));
  const context=vm.createContext({URL,readFileSync,join,FIXTURES:fileURLToPath(new URL('../fixtures',import.meta.url))});
  vm.runInContext(handler+'\nglobalThis.serve=serveFixture;',context);
  const request=name=>{
    let code,body;
    const response={writeHead(status){code=status;return this;},end(value){body=value;}};
    context.serve({url:'/compose/post/unsent/scheduled?fixture='+encodeURIComponent(name)},response);
    return {code,body};
  };
  assert.equal(request('quick013-scheduled').code,200);
  assert.match(request('quick013-scheduled').body,/2028/);
  assert.equal(request('en').code,200);
  for(const name of ['../quick013-scheduled','quick013-scheduled/../en','https://example.invalid','quick999-scheduled'])assert.equal(request(name).code,400);
});
function store(hostname='x.com') {
  const data=new Map();
  const window={location:{hostname},localStorage:{getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)}};
  const context=vm.createContext({window});vm.runInContext(readFileSync(new URL('../probe/position.js',import.meta.url),'utf8'),context);
  return {api:context.XSCHED_POSITION,data,window};
}
test('random interval is inclusive, positive, future, cache-based; expired results use now and minute safety margin',()=>{
  const cache={time:new Date(2028,0,2,20).getTime()};
  assert.equal(Q.randomSlot(cache,{a:10,b:30},now,()=>0).getTime(),cache.time+10*60000);
  assert.equal(Q.randomSlot(cache,{a:10,b:30},now,()=>.999999).getTime(),cache.time+30*60000);
  const past={time:new Date(2027,0,1).getTime()};
  assert.equal(Q.randomSlot(past,{a:20,b:20},now,()=>.5).getTime(),now.getTime()+20*60000);
  const seconds=new Date(2027,11,31,23,59,59);
  const short=Q.randomSlot(past,{a:1,b:1},seconds,()=>0);
  assert.equal(short.getTime(),new Date(2028,0,1,0,5).getTime());
  for(const range of [null,{a:0,b:1},{a:-1,b:1},{a:2,b:1},{a:1.5,b:2},{a:'1',b:2},{a:1,b:Infinity}])assert.equal(Q.randomSlot(cache,range,now),null);
  for(const random of [()=>-1,()=>1,()=>NaN])assert.equal(Q.randomSlot(cache,{a:1,b:2},now,random),null);
  assert.equal(Q.randomSlot(null,{a:10,b:30},now),null);
  assert.equal(Q.randomSlot(cache,{a:1,b:Number.MAX_SAFE_INTEGER},now,()=>.99),null,'overflow fails closed');
});
test('numeric persistence: exactly five fixed keys, strict schemas, invalid JSON/getters/storage/origin fail closed',()=>{
  const f=store();
  assert.equal(f.api.saveRange({a:10,b:30}),true);
  assert.equal(f.api.saveCache({time:now.getTime(),readAt:now.getTime()}),true);
  assert.equal(f.api.saveHeight(680),true);
  assert.equal(f.api.save({x:10,y:20}),true);assert.equal(f.api.savePanel({x:30,y:40}),true);
  assert.deepEqual([...f.data.keys()].sort(),['xsched.probe.pos','xsched.probe.panelPos','xsched.probe.quickRange','xsched.probe.lastScheduled','xsched.probe.panelHeight'].sort());
  for(const raw of f.data.values())assert.ok(Object.values(JSON.parse(raw)).every(value=>typeof value==='number'&&Number.isFinite(value)));
  assert.deepEqual({...f.api.loadRange()},{a:10,b:30});assert.equal(f.api.loadHeight(),680);
  for(const value of [{a:2,b:1},{a:1,b:2,text:'private'},{a:'1',b:2},{a:0,b:1},{a:Infinity,b:Infinity},{a:1.1,b:2},[],null])assert.equal(f.api.saveRange(value),false);
  for(const value of [{time:now.getTime(),readAt:now.getTime(),body:'private'},{time:Infinity,readAt:1},{time:-1,readAt:1},{time:1,readAt:'1'}])assert.equal(f.api.saveCache(value),false);
  for(const value of [NaN,Infinity,0,-1,'600',1000001])assert.equal(f.api.saveHeight(value),false);
  let reads=0;assert.equal(f.api.saveRange({get a(){return ++reads<=2?1:'private';},b:2}),false);
  for(const [key,load] of [['xsched.probe.quickRange','loadRange'],['xsched.probe.lastScheduled','loadCache'],['xsched.probe.panelHeight','loadHeight']]) {
    for(const raw of ['{','[]','null','{"body":"private"}',' '.repeat(129)]){f.data.set(key,raw);assert.equal(f.api[load](),null);}
  }
  assert.equal(f.api.clearCache(),true);assert.equal(f.data.has('xsched.probe.lastScheduled'),false);
  const other=store('twitter.com');assert.equal(other.api.saveRange({a:1,b:2}),false);assert.equal(other.api.saveHeight(600),false);assert.equal(other.api.saveCache({time:1,readAt:1}),false);assert.equal(other.data.size,0);
  Object.defineProperty(f.window,'localStorage',{get(){throw Error('blocked');}});
  assert.equal(f.api.loadHeight(),null);assert.equal(f.api.saveRange({a:1,b:2}),false);
});
test('0.1.4 cache source is a numeric enum only; legacy cache remains readable and malicious source fails closed',()=>{
 const f=store(),key='xsched.probe.lastScheduled',base={time:now.getTime(),readAt:now.getTime()};
 assert.equal(f.api.saveCache(base),true);assert.deepEqual({...f.api.loadCache()},base);
 for(const source of [1,2]) {
  assert.equal(f.api.saveCache({...base,source}),true);
  assert.deepEqual(JSON.parse(f.data.get(key)),{...base,source});
  assert.ok(Object.values(f.api.loadCache()).every(Number.isFinite));
 }
 const before=f.data.get(key);
 for(const source of [0,3,-1,1.1,NaN,Infinity,'1','private',null,{},['2']]) {
  assert.equal(f.api.saveCache({...base,source}),false);
  assert.equal(f.data.get(key),before);
  f.data.set(key,JSON.stringify({...base,source}));assert.equal(f.api.loadCache(),null);
  f.data.set(key,before);
 }
 assert.equal(f.api.saveCache({...base,source:2,body:'private'}),false);
 let reads=0;assert.equal(f.api.saveCache({...base,get source(){return ++reads<=2?2:'private';}}),false);
 assert.equal(f.data.get(key),before);
});
test('0.1.4 nine cache-source captions and height floor include measured quick area and tiny saved heights',()=>{
 for(const lang of Object.keys(U.STRINGS)) {
  const text=U.quickStringsFor(lang,'en');
  for(const key of ['lastTime','fromList','fromSchedule','recordedAt'])assert.ok(typeof text[key]==='string' && text[key].length,key+'/'+lang);
  assert.notEqual(text.fromList,text.fromSchedule);
 }
 for(const height of [600,820,1024])assert.equal(U.panelSize(1100,height,80).height,Math.floor(height*2/3));
 assert.equal(U.panelSize(1100,820,80,650).height,650);
 assert.equal(U.panelSize(390,600,80,900).height,568,'viewport caps a physically oversized quick area');
 const pos=U.clampPanelPosition({x:9999,y:9999},1100,820,80,650);
 assert.equal(pos.y,154);assert.ok(pos.y+650<=804);
});
test('nine languages show actual future date/time, tomorrow and workday; panel height defaults 2/3 and is bounded',()=>{
  assert.deepEqual(Object.keys(U.QUICK_EXTRAS).sort(),Object.keys(U.STRINGS).sort());
  for(const lang of Object.keys(U.STRINGS)) {
    for(const value of Object.values(U.QUICK_EXTRAS[lang]))assert.ok(value.length);
    const at=Q.nextSlot('lunch',new Date(2027,11,31,13));
    const label=U.slotLabel('lunch',at,new Date(2027,11,31,13),lang,'en');
    assert.ok(label.includes(U.quickStringsFor(lang,'en').tomorrow));assert.ok(label.includes('12:30'));assert.ok(label.includes('2028'));
    const work=U.slotLabel('workday',Q.nextSlot('workday',now),now,lang,'en');assert.ok(work.includes('2028'));assert.ok(work.includes('09:00'));
  }
  assert.equal(U.panelSize(1100,1024).height,682);
  assert.equal(U.panelSize(1100,1024,900).height,900);
  assert.equal(U.panelSize(390,600,5000).height,568);
  const pos=U.clampPanelPosition({x:9999,y:9999},390,600,5000),size=U.panelSize(390,600,5000);
  assert.ok(pos.y+size.height<=600-16 && pos.x+size.width<=390-16);
});
