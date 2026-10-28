import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  overlapWithSchedule, countedMs, totalForList, formatDuration, describeSchedule,
  zonedToUtc, isCountingNow,
} from '../js/time.js';

const H = 3600000;
const M = 60000;
const day = (on, from = '09:00', to = '17:00') => ({ on, from, to });
const weekdays = (tz, from = '09:00', to = '17:00') => ({
  tz,
  days: {
    mon: day(true, from, to), tue: day(true, from, to), wed: day(true, from, to),
    thu: day(true, from, to), fri: day(true, from, to), sat: day(false), sun: day(false),
  },
});

test('zonedToUtc respects offsets', () => {
  // Brussels is UTC+2 in summer, UTC+1 in winter.
  assert.equal(zonedToUtc(2026, 7, 1, 9, 0, 'Europe/Brussels'), Date.UTC(2026, 6, 1, 7, 0));
  assert.equal(zonedToUtc(2026, 1, 15, 9, 0, 'Europe/Brussels'), Date.UTC(2026, 0, 15, 8, 0));
});

test('24/7 counts everything', () => {
  assert.equal(countedMs(0, 5 * H, { mode: '24/7' }), 5 * H);
});

test('working hours: within one day', () => {
  const s = weekdays('UTC');
  // Wed 2026-10-28 08:00 -> 12:00 UTC: only 09:00-12:00 counts.
  const a = Date.UTC(2026, 9, 28, 8), b = Date.UTC(2026, 9, 28, 12);
  assert.equal(overlapWithSchedule(a, b, s), 3 * H);
});

test('working hours: over a weekend', () => {
  const s = weekdays('UTC');
  // Fri 2026-10-30 16:00 -> Mon 2026-11-02 10:00: 1h Fri + 1h Mon.
  const a = Date.UTC(2026, 9, 30, 16), b = Date.UTC(2026, 10, 2, 10);
  assert.equal(overlapWithSchedule(a, b, s), 2 * H);
});

test('working hours: a full week', () => {
  const s = weekdays('Europe/Brussels');
  const a = Date.UTC(2026, 10, 2, 0), b = Date.UTC(2026, 10, 9, 0); // Mon -> Mon
  assert.equal(overlapWithSchedule(a, b, s), 40 * H);
});

test('working hours across the DST change still give 8h days', () => {
  // Brussels leaves summer time on Sun 2026-10-25.
  const s = weekdays('Europe/Brussels');
  const a = Date.UTC(2026, 9, 22, 0), b = Date.UTC(2026, 9, 28, 0); // Thu -> Wed 00:00 UTC
  // Thu, Fri, Mon, Tue = 4 working days.
  assert.equal(overlapWithSchedule(a, b, s), 32 * H);
});

test('overnight window (22:00-06:00)', () => {
  const s = { tz: 'UTC', days: Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((k) => [k, day(true, '22:00', '06:00')])) };
  const a = Date.UTC(2026, 9, 28, 0), b = Date.UTC(2026, 9, 29, 0); // a full day
  assert.equal(overlapWithSchedule(a, b, s), 8 * H);
});

test('equal from/to means the whole day', () => {
  const s = { tz: 'UTC', days: { wed: day(true, '00:00', '00:00') } };
  const a = Date.UTC(2026, 9, 28, 0), b = Date.UTC(2026, 9, 30, 0);
  assert.equal(overlapWithSchedule(a, b, s), 24 * H);
});

test('totalForList sums only that list and open intervals use now', () => {
  const now = 10 * H;
  const iv = [
    { list: 'a', start: 0, end: 2 * H },
    { list: 'b', start: 2 * H, end: 3 * H },
    { list: 'a', start: 3 * H, end: null },
  ];
  assert.equal(totalForList(iv, 'a', now, { mode: '24/7' }), 9 * H);
  assert.equal(totalForList(iv, 'b', now, { mode: '24/7' }), 1 * H);
});

test('isCountingNow', () => {
  const s = weekdays('UTC');
  assert.equal(isCountingNow(Date.UTC(2026, 9, 28, 10), { mode: 'schedule', schedule: s }), true);
  assert.equal(isCountingNow(Date.UTC(2026, 9, 28, 20), { mode: 'schedule', schedule: s }), false);
  assert.equal(isCountingNow(Date.UTC(2026, 9, 28, 20), { mode: '24/7' }), true);
});

test('formatDuration', () => {
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(30 * 1000), '<1m');
  assert.equal(formatDuration(45 * M), '45m');
  assert.equal(formatDuration(3 * H + 12 * M), '3h 12m');
  assert.equal(formatDuration(5 * H), '5h');
  assert.equal(formatDuration(52 * H), '2d 4h');
  assert.equal(formatDuration(48 * H), '2d');
  assert.equal(formatDuration(52 * H + 5 * M, { useDays: false }), '52h 5m');
});

test('describeSchedule groups days', () => {
  const s = weekdays('UTC');
  s.days.sat = day(true, '10:00', '14:00');
  assert.equal(describeSchedule(s), 'Mon–Fri 09:00–17:00 · Sat 10:00–14:00');
  assert.equal(describeSchedule({ days: {} }), 'no days selected');
});
