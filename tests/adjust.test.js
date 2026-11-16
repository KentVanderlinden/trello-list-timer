import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdjustments, applyAdjustment, adjustmentFor, parseHoursMinutes, splitHoursMinutes,
  saveAdjustments,
} from '../js/adjust.js';

const H = 3600000;
const M = 60000;

test('normalizeAdjustments drops junk and zeros', () => {
  assert.deepEqual(normalizeAdjustments(null), {});
  assert.deepEqual(normalizeAdjustments('x'), {});
  assert.deepEqual(normalizeAdjustments({ a: -H, b: 0, c: 'nope', d: Infinity, e: '1500.4' }), { a: -H, e: 1500 });
});

test('applyAdjustment adds the correction and never goes negative', () => {
  assert.equal(applyAdjustment(10 * H, -8 * H), 2 * H);
  assert.equal(applyAdjustment(10 * H, undefined), 10 * H);
  assert.equal(applyAdjustment(H, -5 * H), 0);
  assert.equal(applyAdjustment(H, 30 * M), H + 30 * M);
});

test('adjustmentFor makes the total equal what was typed', () => {
  // Left the card in "Working on it" overnight: 11h 20m tracked, really 3h 20m.
  const tracked = 11 * H + 20 * M + 37000;
  const adj = adjustmentFor(3 * H + 20 * M, tracked);
  assert.equal(applyAdjustment(tracked, adj), 3 * H + 20 * M);
  // The card is still in the list: time keeps counting on top of the corrected total.
  assert.equal(applyAdjustment(tracked + 10 * M, adj), 3 * H + 30 * M);
  // Adding time works too.
  assert.equal(adjustmentFor(5 * H, 4 * H), H);
});

test('parseHoursMinutes', () => {
  assert.equal(parseHoursMinutes('3', '20'), 3 * H + 20 * M);
  assert.equal(parseHoursMinutes('', '45'), 45 * M);
  assert.equal(parseHoursMinutes('2', ''), 2 * H);
  assert.equal(parseHoursMinutes('0', '0'), 0);
  assert.equal(parseHoursMinutes('1.5', '0'), 90 * M);
  assert.equal(parseHoursMinutes('', ''), null);
  assert.equal(parseHoursMinutes('-1', '0'), null);
  assert.equal(parseHoursMinutes('abc', '0'), null);
});

test('splitHoursMinutes rounds down to whole minutes', () => {
  assert.deepEqual(splitHoursMinutes(27 * H + 5 * M + 59000), { hours: 27, minutes: 5 });
  assert.deepEqual(splitHoursMinutes(-5), { hours: 0, minutes: 0 });
});

test('saveAdjustments removes the key when nothing is left', async () => {
  const calls = [];
  const t = {
    set: async (...a) => calls.push(['set', ...a]),
    remove: async (...a) => calls.push(['remove', ...a]),
  };
  await saveAdjustments(t, { l1: -H, l2: 0 });
  await saveAdjustments(t, { l2: 0 });
  assert.deepEqual(calls, [
    ['set', 'card', 'shared', 'adjust', { l1: -H }],
    ['remove', 'card', 'shared', 'adjust'],
  ]);
});
