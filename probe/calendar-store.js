// Audited calendar persistence only. Page-owned storage on x.com, fixed keys.
(() => {
"use strict";
const DATA_KEY = 'xsched.probe.calendar';
const TARGET_KEY = 'xsched.probe.calendarTarget';
const TTL = 120000;
const LIMIT = 2000;
function time(value) { return Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000; }
function keys(value, names) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
}
function item(value) {
  if (!keys(value, ['time', 'preview'])) return null;
  const copy = {time:value.time, preview:value.preview};
  return time(copy.time) && typeof copy.preview === 'string' && Array.from(copy.preview).length <= 20 ? copy : null;
}
function data(value) {
  if (!keys(value, ['version', 'syncedAt', 'partial', 'items'])) return null;
  const copy = {version:value.version, syncedAt:value.syncedAt, partial:value.partial, items:[]};
  const rows = value.items;
  if (copy.version !== 1 || !(copy.syncedAt === 0 || time(copy.syncedAt)) || typeof copy.partial !== 'boolean'
      || !Array.isArray(rows) || rows.length > LIMIT) return null;
  for (const row of rows) {
    const entry = item(row);
    if (!entry) return null;
    copy.items.push(entry);
  }
  if (copy.syncedAt === 0 && copy.items.length && !copy.partial) return null;
  return copy;
}
function target(value, now) {
  if (!keys(value, ['version', 'time', 'preview', 'expiresAt']) || !time(now)) return null;
  const copy = {version:value.version, time:value.time, preview:value.preview, expiresAt:value.expiresAt};
  return copy.version === 1 && item({time:copy.time, preview:copy.preview}) && time(copy.expiresAt)
    && copy.expiresAt > now && copy.expiresAt <= now + TTL ? copy : null;
}
function load() {
  try {
    if (window.location.hostname !== 'x.com') return null;
    const raw = window.localStorage.getItem(DATA_KEY);
    if (raw === null) return null;
    const copy = typeof raw === 'string' && raw.length <= 1000000 ? data(JSON.parse(raw)) : null;
    if (!copy) window.localStorage.removeItem(DATA_KEY);
    return copy;
  } catch {
    try { if (window.location.hostname === 'x.com') window.localStorage.removeItem(DATA_KEY); } catch { /* unavailable */ }
    return null;
  }
}
function save(value) {
  try {
    if (window.location.hostname !== 'x.com') return false;
    const copy = data(value);
    if (!copy) return false;
    const raw = JSON.stringify(copy);
    if (raw.length > 1000000 || !data(JSON.parse(raw))) return false;
    window.localStorage.setItem(DATA_KEY, raw);
    return true;
  } catch { return false; }
}
function clear() {
  try {
    if (window.location.hostname !== 'x.com') return false;
    window.localStorage.removeItem(DATA_KEY);
    return true;
  } catch { return false; }
}
function putTarget(value, now) {
  try {
    if (window.location.hostname !== 'x.com') return false;
    const entry = item(value);
    if (!entry || !time(now)) return false;
    const copy = target({version:1, time:entry.time, preview:entry.preview, expiresAt:now + TTL}, now);
    if (!copy) return false;
    window.sessionStorage.setItem(TARGET_KEY, JSON.stringify(copy));
    return true;
  } catch { return false; }
}
function clearTarget() {
  try {
    if (window.location.hostname !== 'x.com') return false;
    window.sessionStorage.removeItem(TARGET_KEY);
    return true;
  } catch { return false; }
}
function takeTarget(now) {
  try {
    if (window.location.hostname !== 'x.com') return null;
    const raw = window.sessionStorage.getItem(TARGET_KEY);
    // Remove before validation/use. A failed removal must never grant a click.
    window.sessionStorage.removeItem(TARGET_KEY);
    if (!raw || raw.length > 1024) return null;
    return target(JSON.parse(raw), now);
  } catch { return null; }
}
globalThis.XSCHED_CALENDAR_STORE = Object.freeze({load, save, clear, putTarget, takeTarget, clearTarget, data, target, TTL});
})();
