import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const ROOT=new URL('../../../',import.meta.url);
const {default:puppeteer}=await import(new URL('node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',ROOT));
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
const out=mkdtempSync(join(tmpdir(),'xsched-review-output-'));
console.log('Artifacts: '+out);
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/usr/lib/chromium/chromium',headless:true,pipe:true,timeout:15000,userDataDir:mkdtempSync('/tmp/xsched-components-'),env:{...process.env,XDG_CONFIG_HOME:'/tmp/xsched-config',XDG_CACHE_HOME:'/tmp/xsched-cache'},args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
try {
const page=await browser.newPage(); await page.setViewport({width:1280,height:900});
await page.setRequestInterception(true);page.on('request',r=>r.abort());
await page.setContent('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><body style="margin:0;background:#15202b;color:white;font:14px system-ui"><p>本機日曆元件走查・合成資料</p><button id="outside">元件外測試按鈕</button><div id="host"></div></body></html>');
for(const file of ['reader.js','overview.js','calendar.js']) await page.addScriptTag({content:readFileSync(new URL('probe/'+file,ROOT),'utf8')});
await page.evaluate(()=>{
 const root=document.querySelector('#host').attachShadow({mode:'open'}),box=document.createElement('div'),body=document.createElement('div');root.append(box,body);
 const items=[{at:new Date(2028,0,1,9),preview:'範例：產品更新與功能介紹'},{at:new Date(2028,0,1,9,45),preview:'範例：第二則預排貼文'},{at:new Date(2028,0,2,20),preview:'範例：週末活動提醒'}];
 window.cal=XSCHED_CALENDAR.create(document,{reader:XSCHED_READER,store:{takeTarget:()=>null},changed(){},clearData(){}});
 window.cal.mount(root,box,body,null,items,Date.now(),false,false);
});
const observations={scope:'Production calendar.js + overview.js in isolated component fixture; no extension installed',steps:[]};
async function click(sel){const handle=await page.$('#host >>> '+sel);if(!handle)throw Error(sel);await handle.click();}
async function focus(){return page.evaluate(()=>({document:document.activeElement?.tagName,shadow:document.querySelector('#host').shadowRoot.activeElement?.className||null}));}
await click('.calendar-expand'); await page.screenshot({path:out+'/01-calendar-desktop.png'});
observations.steps.push({step:'desktop',focus:await focus()});
await click('.calendar-next');observations.steps.push({step:'after-next-month',focus:await focus()});
await page.keyboard.press('Tab');observations.steps.push({step:'tab-after-month',focus:await focus()});
await click('.calendar-previous');await page.setViewport({width:390,height:844});await page.screenshot({path:out+'/02-calendar-narrow.png'});
observations.narrow=await page.evaluate(()=>{const r=document.querySelector('#host').shadowRoot;return {cellWidth:r.querySelector('.calendar-cell').getBoundingClientRect().width,entries:[...r.querySelectorAll('.calendar-entry')].map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,text:el.textContent})),gridScrollWidth:r.querySelector('.calendar-grid').scrollWidth};});
await page.keyboard.press('Escape');observations.steps.push({step:'escape',closed:await page.$('#host >>> .calendar-full')===null,focus:await focus()});
writeFileSync(out+'/observations.json',JSON.stringify(observations,null,2));console.log(JSON.stringify(observations));
} finally {await browser.close();}
