// The sole audited persistence boundary: x.com button/panel coordinates, never page data.
(() => {
"use strict";
const POSITION_KEY = "xsched.probe.pos";
const PANEL_KEY = "xsched.probe.panelPos";
const RANGE_KEY = "xsched.probe.quickRange";
const CACHE_KEY = "xsched.probe.lastScheduled";
const HEIGHT_KEY = "xsched.probe.panelHeight";
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
  if (key===CACHE_KEY) return keys.length===2 && keys.includes('time') && keys.includes('readAt')
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
globalThis.XSCHED_POSITION = Object.freeze({ load, save, loadPanel, savePanel, reset, loadRange, saveRange, loadCache, saveCache, clearCache, loadHeight, saveHeight });
})();
