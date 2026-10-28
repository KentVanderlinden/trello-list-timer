// Time math: totals per list, working-hours schedules, and formatting.
// Pure module (only uses Intl), testable in Node.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const WEEK_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const DAY_MS = 86400000;

// ---------- Time zones ----------

const formatters = new Map();
function formatterFor(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz) {
  try { formatterFor(tz); return true; } catch { return false; }
}

// Wall-clock parts of an instant in a time zone.
export function zonedParts(ms, tz) {
  const p = {};
  for (const { type, value } of formatterFor(tz).formatToParts(new Date(ms))) p[type] = value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
}

function offsetAt(ms, tz) {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

// Wall-clock time in a time zone -> UTC ms. Day overflow (d + 1) is fine.
export function zonedToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const off = offsetAt(guess, tz);
  let ms = guess - off;
  const off2 = offsetAt(ms, tz);
  if (off2 !== off) ms = guess - off2;
  return ms;
}

// ---------- Schedules ----------

export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''));
  if (!m) return [0, 0];
  return [Math.min(23, +m[1]), Math.min(59, +m[2])];
}

/**
 * How many ms of [start, end) fall inside the weekly schedule.
 * schedule = { tz, days: { mon: { on, from: 'HH:MM', to: 'HH:MM' }, ... } }
 * A window whose end is at or before its start runs past midnight
 * (e.g. 22:00–06:00); equal from/to means the whole day.
 */
export function overlapWithSchedule(start, end, schedule) {
  if (!(end > start)) return 0;
  const tz = schedule && schedule.tz && isValidTimeZone(schedule.tz) ? schedule.tz : 'UTC';
  const days = (schedule && schedule.days) || {};
  const p = zonedParts(start, tz);
  // Start one day early so a window from the previous evening is counted.
  let civil = Date.UTC(p.y, p.m - 1, p.d) - DAY_MS;
  let total = 0;

  for (let guard = 0; guard < 20000; guard++, civil += DAY_MS) {
    const dt = new Date(civil);
    const y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    if (zonedToUtc(y, m, d, 0, 0, tz) >= end) break;
    const cfg = days[DAY_KEYS[dt.getUTCDay()]];
    if (!cfg || !cfg.on) continue;
    const [fh, fm] = parseHM(cfg.from);
    const [th, tm] = parseHM(cfg.to);
    const ws = zonedToUtc(y, m, d, fh, fm, tz);
    const nextDay = th * 60 + tm <= fh * 60 + fm;
    const we = zonedToUtc(y, m, d + (nextDay ? 1 : 0), th, tm, tz);
    total += Math.max(0, Math.min(end, we) - Math.max(start, ws));
  }
  return total;
}

// counting = { mode: '24/7' | 'schedule', schedule }
export function countedMs(start, end, counting) {
  if (!(end > start)) return 0;
  if (!counting || counting.mode !== 'schedule') return end - start;
  return overlapWithSchedule(start, end, counting.schedule);
}

// Is the clock ticking right now (always true in 24/7 mode)?
export function isCountingNow(now, counting) {
  if (!counting || counting.mode !== 'schedule') return true;
  return overlapWithSchedule(now, now + 1000, counting.schedule) > 0;
}

export function totalForList(intervals, listId, now, counting) {
  let sum = 0;
  for (const i of intervals) {
    if (i.list === listId) sum += countedMs(i.start, i.end === null ? now : i.end, counting);
  }
  return sum;
}

// ---------- Formatting ----------

// 0m, <1m, 45m, 3h 12m, 2d 4h. With useDays=false hours keep growing (useful for
// working-hours mode, where "1d" of 8 working hours would be confusing).
export function formatDuration(ms, { useDays = true } = {}) {
  if (!(ms > 0)) return '0m';
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return '<1m';
  const days = Math.floor(totalMin / 1440);
  if (useDays && days > 0) {
    const h = Math.floor((totalMin % 1440) / 60);
    return h ? `${days}d ${h}h` : `${days}d`;
  }
  const hours = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (hours > 0) return m ? `${hours}h ${m}m` : `${hours}h`;
  return `${m}m`;
}

// "Mon–Fri 09:00–17:00 · Sat 10:00–14:00"
export function describeSchedule(schedule) {
  const days = (schedule && schedule.days) || {};
  const groups = [];
  for (const key of WEEK_ORDER) {
    const c = days[key];
    if (!c || !c.on) continue;
    const hours = `${c.from}–${c.to}`;
    const last = groups[groups.length - 1];
    const prevKey = WEEK_ORDER[WEEK_ORDER.indexOf(key) - 1];
    if (last && last.hours === hours && last.end === prevKey) last.end = key;
    else groups.push({ start: key, end: key, hours });
  }
  if (!groups.length) return 'no days selected';
  return groups
    .map((g) => `${DAY_LABELS[g.start]}${g.end !== g.start ? '–' + DAY_LABELS[g.end] : ''} ${g.hours}`)
    .join(' · ');
}
