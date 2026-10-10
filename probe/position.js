// The sole audited persistence boundary: x.com button coordinates, never page data.
(() => {
"use strict";
const POSITION_KEY = "xsched.probe.pos";
function valid(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === 2
    && typeof value.x === "number" && Number.isFinite(value.x)
    && typeof value.y === "number" && Number.isFinite(value.y);
}
function load() {
  try {
    if (window.location.hostname !== "x.com") return null;
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw || raw.length > 128) return null;
    const value = JSON.parse(raw);
    return valid(value) ? { x: value.x, y: value.y } : null;
  } catch { return null; }
}
function save(value) {
  try {
    if (window.location.hostname !== "x.com" || !valid(value)) return false;
    const position = { x: value.x, y: value.y };
    if (!valid(position)) return false;
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    return true;
  } catch { return false; }
}
function reset() {
  try {
    if (window.location.hostname !== "x.com") return false;
    window.localStorage.removeItem(POSITION_KEY);
    return true;
  } catch { return false; }
}
globalThis.XSCHED_POSITION = Object.freeze({ load, save, reset });
})();
