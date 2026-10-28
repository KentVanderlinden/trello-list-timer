import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toEvent, buildTimeline, createdAtFromId } from '../js/intervals.js';

const H = 3600000;
const T0 = Date.UTC(2026, 9, 1, 8, 0); // 2026-10-01 08:00 UTC
const CARD = Math.floor(T0 / 1000).toString(16).padStart(8, '0') + '0000000000000000';

let n = 0;
const iso = (ms) => new Date(ms).toISOString();
const id = () => (Math.floor(T0 / 1000) + n++).toString(16).padStart(8, '0') + 'aaaaaaaaaaaaaaaa';
const create = (t, list) => ({ id: id(), type: 'createCard', date: iso(t), data: { card: { id: CARD }, list: { id: list } } });
const move = (t, from, to) => ({ id: id(), type: 'updateCard', date: iso(t), data: { card: { id: CARD }, listBefore: { id: from }, listAfter: { id: to } } });
const archive = (t, closed) => ({ id: id(), type: 'updateCard', date: iso(t), data: { card: { id: CARD, closed }, old: { closed: !closed } } });
const leave = (t) => ({ id: id(), type: 'moveCardFromBoard', date: iso(t), data: { card: { id: CARD } } });
const arrive = (t, list) => ({ id: id(), type: 'moveCardToBoard', date: iso(t), data: { card: { id: CARD }, list: { id: list } } });
const events = (...actions) => actions.map(toEvent).filter(Boolean);
const sum = (tl, list, now) => tl.intervals.filter((i) => i.list === list).reduce((s, i) => s + ((i.end ?? now) - i.start), 0);

test('created id timestamp', () => {
  assert.equal(createdAtFromId(CARD), T0);
});

test('re-entries add up and count visits', () => {
  const ev = events(
    create(T0, 'todo'),
    move(T0 + 1 * H, 'todo', 'work'),
    move(T0 + 3 * H, 'work', 'hold'),
    move(T0 + 4 * H, 'hold', 'work'),
  );
  const now = T0 + 6 * H;
  const tl = buildTimeline(ev, { id: CARD, idList: 'work', closed: false }, now);
  assert.equal(sum(tl, 'work', now), 4 * H);
  assert.equal(sum(tl, 'hold', now), 1 * H);
  assert.equal(tl.visits.work, 2);
  assert.equal(tl.visits.hold, 1);
  assert.equal(tl.currentList, 'work');
  assert.equal(tl.stale, false);
});

test('order of events does not matter', () => {
  const ev = events(move(T0 + 2 * H, 'a', 'b'), create(T0, 'a'));
  const tl = buildTimeline(ev, { id: CARD, idList: 'b' }, T0 + 3 * H);
  assert.equal(sum(tl, 'a', 0), 2 * H);
});

test('archived time does not count; unarchive resumes', () => {
  const ev = events(
    create(T0, 'work'),
    archive(T0 + 1 * H, true),
    archive(T0 + 5 * H, false),
  );
  const now = T0 + 6 * H;
  const tl = buildTimeline(ev, { id: CARD, idList: 'work', closed: false }, now);
  assert.equal(sum(tl, 'work', now), 2 * H);
  assert.equal(tl.visits.work, 1);
});

test('moving off the board stops the clock, coming back restarts it', () => {
  const ev = events(create(T0, 'work'), leave(T0 + 1 * H), arrive(T0 + 10 * H, 'work'));
  const now = T0 + 11 * H;
  const tl = buildTimeline(ev, { id: CARD, idList: 'work' }, now);
  assert.equal(sum(tl, 'work', now), 2 * H);
  assert.equal(tl.visits.work, 2);
});

test('no history: card counted in its current list since creation', () => {
  const now = T0 + 5 * H;
  const tl = buildTimeline([], { id: CARD, idList: 'work' }, now);
  assert.equal(sum(tl, 'work', now), 5 * H);
  assert.equal(tl.currentList, 'work');
});

test('history without creation: assume card started in the first "from" list', () => {
  const ev = events(move(T0 + 2 * H, 'todo', 'work'));
  const now = T0 + 3 * H;
  const tl = buildTimeline(ev, { id: CARD, idList: 'work' }, now);
  assert.equal(sum(tl, 'todo', now), 2 * H);
  assert.equal(sum(tl, 'work', now), 1 * H);
});

test('stale history is flagged and the new list starts now', () => {
  const ev = events(create(T0, 'todo'));
  const now = T0 + 2 * H;
  const tl = buildTimeline(ev, { id: CARD, idList: 'work' }, now);
  assert.equal(tl.stale, true);
  assert.equal(tl.currentList, 'work');
  assert.equal(sum(tl, 'work', now), 0);
  assert.equal(sum(tl, 'todo', now), 2 * H);
});

test('irrelevant actions are ignored', () => {
  assert.equal(toEvent({ id: 'x', type: 'commentCard', date: iso(T0), data: { card: { id: CARD } } }), null);
  assert.equal(toEvent({ id: 'x', type: 'updateCard', date: iso(T0), data: { card: { id: CARD }, old: { name: 'a' } } }), null);
});
