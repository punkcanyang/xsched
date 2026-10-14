// Sole audited persistence boundary: fixed keys, numeric positions/settings/times,
// one JSON boolean for the panel switch, and one overview snapshot key.
(() => {
"use strict";
const POSITION_KEY = "xsched.probe.pos";
const PANEL_KEY = "xsched.probe.panelPos";
const RANGE_KEY = "xsched.probe.quickRange";
const CACHE_KEY = "xsched.probe.lastScheduled";
const HEIGHT_KEY = "xsched.probe.panelHeight";
const OPEN_KEY = "xsched.probe.panelOpen";
const OVERVIEW_KEY = "xsched.probe.overview";
const allowedKey = key => key === POSITION_KEY || key === PANEL_KEY;
function valid(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}
function read(key) {
  try {
    if (window.location.hostname !== "x.com" || !allowedKey(key)) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw || raw.length > 128) return null;
    const value = JSON.parse(raw);
    return valid(value) ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}
function write(key, value) {
  try {
    if (window.location.hostname !== "x.com" || !allowedKey(key) || !valid(value)) return false;
    const position = { x: value.x, y: value.y };
    if (!valid(position)) return false;
    window.localStorage.setItem(key, JSON.stringify(position));
    return true;
  } catch { return false; }
}
function erase(key) {
  try {
    if (window.location.hostname !== "x.com" || (!allowedKey(key) && key!==CACHE_KEY)) return false;
    window.localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
function load() { return read(POSITION_KEY); }
function save(value) { return write(POSITION_KEY, value); }
function loadPanel() { return read(PANEL_KEY); }
function savePanel(value) { return write(PANEL_KEY, value); }
function reset() {
  const button = erase(POSITION_KEY);
  const panel = erase(PANEL_KEY);
  return button && panel;
}
// Separate numeric-only schemas. No arbitrary key or object is accepted.
function recordValid(key, value) {
  if (!value || typeof value!=="object" || Array.isArray(value)) return false;
  const keys=Object.keys(value);
  if (key===RANGE_KEY) return keys.length===2 && keys.includes('a') && keys.includes('b')
    && Number.isSafeInteger(value.a) && Number.isSafeInteger(value.b) && value.a>0 && value.a<=value.b;
  // Old two-number cache migrates as list-derived. 1=list, 2=observed completion;
  // source is a finite numeric enum, never a DOM label or arbitrary string.
  if (key===CACHE_KEY) return (keys.length===2 || (keys.length===3 && keys.includes('source') && (value.source===1 || value.source===2))) && keys.includes('time') && keys.includes('readAt')
    && Number.isSafeInteger(value.time) && Number.isSafeInteger(value.readAt)
    && value.time>0 && value.readAt>0 && value.time<=8640000000000000 && value.readAt<=8640000000000000;
  return key===HEIGHT_KEY && keys.length===1 && keys[0]==='height'
    && typeof value.height==='number' && Number.isFinite(value.height) && value.height>0 && value.height<=1000000;
}
function readRecord(key) {
  try {
    if(window.location.hostname!=="x.com" || ![RANGE_KEY,CACHE_KEY,HEIGHT_KEY].includes(key))return null;
    const raw=window.localStorage.getItem(key);
    if(!raw || raw.length>128)return null;
    const value=JSON.parse(raw);
    return recordValid(key,value) ? value : null;
  } catch {return null;}
}
function writeRecord(key,value) {
  try {
    if(window.location.hostname!=="x.com" || !recordValid(key,value))return false;
    const snapshot=key===RANGE_KEY ? {a:value.a,b:value.b} : key===CACHE_KEY ? {time:value.time,readAt:value.readAt} : {height:value.height};
    if(key===CACHE_KEY && Object.hasOwn(value,'source'))snapshot.source=value.source;
    if(!recordValid(key,snapshot))return false;
    window.localStorage.setItem(key,JSON.stringify(snapshot));
    return true;
  } catch {return false;}
}
function loadRange(){return readRecord(RANGE_KEY);}
function saveRange(value){return writeRecord(RANGE_KEY,value);}
function loadCache(){return readRecord(CACHE_KEY);}
function saveCache(value){return writeRecord(CACHE_KEY,value);}
function clearCache(){return erase(CACHE_KEY);}
function loadHeight(){return readRecord(HEIGHT_KEY)?.height ?? null;}
function saveHeight(height){return writeRecord(HEIGHT_KEY,{height});}
// Panel switch is a JSON boolean only. Objects, numbers and strings are refused.
function booleanState(value) {
  return value === true || value === false ? value : null;
}
function loadOpen() {
  try {
    if (window.location.hostname !== "x.com") return null;
    const raw = window.localStorage.getItem(OPEN_KEY);
    if (typeof raw !== "string" || raw.length > 128 || (raw !== "true" && raw !== "false")) return null;
    return booleanState(JSON.parse(raw));
  } catch { return null; }
}
function saveOpen(value) {
  try {
    const state = booleanState(value);
    if (window.location.hostname !== "x.com" || state === null) return false;
    const raw = JSON.stringify(state === true);
    if ((state === true && raw !== "true") || (state === false && raw !== "false")) return false;
    window.localStorage.setItem(OPEN_KEY, raw);
    return true;
  } catch { return false; }
}
// Overview snapshot: truncated list previews from a prior Scheduled read only.
function overviewPreviewOk(text) {
  return typeof text === "string" && Array.from(text).length <= 100 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
}
function overviewItemValid(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return false;
  const keys = Object.keys(item);
  return keys.length === 2 && keys.includes("t") && keys.includes("p")
    && Number.isSafeInteger(item.t) && item.t > 0 && item.t <= 8640000000000000
    && overviewPreviewOk(item.p);
}
function overviewValid(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.includes("s") || !keys.includes("n")) return false;
  if (!Number.isSafeInteger(value.s) || value.s <= 0 || value.s > 8640000000000000) return false;
  if (!Number.isSafeInteger(value.n) || value.n < 0 || value.n > 80) return false;
  if (value.n === 0) return keys.length === 2;
  if (keys.length !== 3 || !keys.includes("i") || !Array.isArray(value.i) || value.i.length !== value.n) return false;
  for (const item of value.i) if (!overviewItemValid(item)) return false;
  return true;
}
function overviewSnapshot(value) {
  if (value.n === 0) return { s: value.s, n: 0 };
  const i = [];
  for (const item of value.i) i.push({ t: item.t, p: item.p });
  return { s: value.s, n: value.n, i };
}
function overviewMatches(left, right) {
  if (!left || !right || left.s !== right.s || left.n !== right.n) return false;
  if (right.n === 0) return true;
  if (!Array.isArray(left.i) || !Array.isArray(right.i) || left.i.length !== right.n || right.i.length !== right.n) return false;
  let index = 0;
  while (index < right.n) {
    const a = left.i[index];
    const b = right.i[index];
    if (!a || !b || a.t !== b.t || a.p !== b.p) return false;
    index += 1;
  }
  return true;
}
function loadOverview() {
  try {
    if (window.location.hostname !== "x.com") return null;
    const raw = window.localStorage.getItem(OVERVIEW_KEY);
    if (!raw || raw.length > 24576) return null;
    const value = JSON.parse(raw);
    const overview = overviewValid(value) ? overviewSnapshot(value) : null;
    return overview && overviewMatches(value, overview) ? overview : null;
  } catch { return null; }
}
function saveOverview(value) {
  try {
    if (window.location.hostname !== "x.com" || !overviewValid(value)) return false;
    const overview = overviewSnapshot(value);
    if (!overviewValid(overview) || !overviewMatches(value, overview)) return false;
    const raw = JSON.stringify(overview);
    if (raw.length > 24576) return false;
    window.localStorage.setItem(OVERVIEW_KEY, raw);
    return true;
  } catch { return false; }
}
function clearOverview() {
  try {
    if (window.location.hostname !== "x.com") return false;
    window.localStorage.removeItem(OVERVIEW_KEY);
    return true;
  } catch { return false; }
}
globalThis.XSCHED_POSITION = Object.freeze({ load, save, loadPanel, savePanel, reset, loadRange, saveRange, loadCache, saveCache, clearCache, loadHeight, saveHeight, loadOpen, saveOpen, loadOverview, saveOverview, clearOverview });
})();
