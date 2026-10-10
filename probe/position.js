// The sole audited persistence boundary: x.com button/panel coordinates, never page data.
(() => {
"use strict";
const POSITION_KEY = "xsched.probe.pos";
const PANEL_KEY = "xsched.probe.panelPos";
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
    if (window.location.hostname !== "x.com" || !allowedKey(key)) return false;
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
globalThis.XSCHED_POSITION = Object.freeze({ load, save, loadPanel, savePanel, reset });
})();
