// App settings and the per-board configuration stored in Trello.

// Paste the API key from https://trello.com/power-ups/admin (Power-Up → API key).
// It's a public key by design; it is safe to commit.
export const API_KEY = '835fcd473a710097f73db27d94452d0b';
export const APP_NAME = 'List Timer';

export function isKeyConfigured() {
  return /^[0-9a-f]{32}$/i.test(API_KEY);
}

export function assetUrl(path) {
  return new URL(`../${path}`, import.meta.url).href;
}

// Trello badge colors.
export const COLORS = ['green', 'blue', 'sky', 'purple', 'pink', 'red', 'orange', 'yellow', 'lime'];

export function defaultSchedule() {
  const work = { on: true, from: '09:00', to: '17:00' };
  const off = { on: false, from: '09:00', to: '17:00' };
  let tz = 'UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* keep UTC */ }
  return {
    tz,
    days: { mon: { ...work }, tue: { ...work }, wed: { ...work }, thu: { ...work }, fri: { ...work }, sat: { ...off }, sun: { ...off } },
  };
}

export function defaultConfig() {
  return { version: 1, lists: {}, mode: '24/7', schedule: defaultSchedule() };
}

// Fill gaps so the rest of the code can trust the shape.
export function normalizeConfig(raw) {
  const base = defaultConfig();
  if (!raw || typeof raw !== 'object') return base;
  const cfg = { ...base, ...raw };
  cfg.lists = raw.lists && typeof raw.lists === 'object' ? raw.lists : {};
  cfg.mode = raw.mode === 'schedule' ? 'schedule' : '24/7';
  const s = raw.schedule || {};
  cfg.schedule = { tz: s.tz || base.schedule.tz, days: { ...base.schedule.days, ...(s.days || {}) } };
  return cfg;
}

export async function loadConfig(t) {
  return normalizeConfig(await t.get('board', 'shared', 'config'));
}

// Only keep settings for lists that still exist, and drop empty entries,
// so we stay far below Trello's 4096-character storage limit.
export async function saveConfig(t, cfg, existingListIds) {
  const lists = {};
  for (const [id, l] of Object.entries(cfg.lists)) {
    if (existingListIds && !existingListIds.includes(id)) continue;
    if (!l.tracked) continue;
    const entry = { tracked: true };
    if (l.main) entry.main = true;
    if (l.color && l.color !== 'green') entry.color = l.color;
    if (l.label) entry.label = String(l.label).slice(0, 24);
    lists[id] = entry;
  }
  const out = { version: 1, lists, mode: cfg.mode, schedule: cfg.schedule };
  return t.set('board', 'shared', 'config', out);
}

export function trackedIds(cfg, orderedListIds) {
  const ids = Object.keys(cfg.lists).filter((id) => cfg.lists[id].tracked);
  if (!orderedListIds) return ids;
  return orderedListIds.filter((id) => ids.includes(id));
}

export function mainIds(cfg, orderedListIds) {
  return trackedIds(cfg, orderedListIds).filter((id) => cfg.lists[id].main);
}

export function badgeColor(cfg, id) {
  const c = cfg.lists[id] && cfg.lists[id].color;
  return COLORS.includes(c) ? c : 'green';
}

export function countingOf(cfg) {
  return { mode: cfg.mode, schedule: cfg.schedule };
}
