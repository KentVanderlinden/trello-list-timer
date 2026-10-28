// Glue between Trello, the history cache and the time math: "how long has this
// card been in each tracked list?" Used by the badges and the card-back section.

import { loadConfig, isKeyConfigured, trackedIds, countingOf } from './config.js';
import { getBoardHistory, isAuthorized, NotAuthorizedError } from './history.js';
import { buildTimeline } from './intervals.js';
import { totalForList, isCountingNow } from './time.js';

/**
 * Returns { status, ... }:
 *  - 'no-key'         the API key isn't set in js/config.js yet
 *  - 'not-authorized' the user needs to click Authorize
 *  - 'ok'             with { card, config, lists, rows, counting }
 * rows: one per tracked list, in board order:
 *   { id, name, main, total, visits, running }
 */
export async function cardStats(t, { now = Date.now() } = {}) {
  if (!isKeyConfigured()) return { status: 'no-key' };
  const [card, board, config, lists] = await Promise.all([
    t.card('id', 'idList', 'closed'),
    t.board('id'),
    loadConfig(t),
    t.lists('id', 'name'),
  ]);
  if (!(await isAuthorized(t))) return { status: 'not-authorized', config, lists };

  let history;
  try {
    history = await getBoardHistory(t, board.id);
  } catch (err) {
    if (err instanceof NotAuthorizedError) return { status: 'not-authorized', config, lists };
    throw err;
  }
  let timeline = buildTimeline(history.eventsFor(card.id), card, now);
  if (timeline.stale) {
    // The card just moved and our cache doesn't know yet: refresh soon.
    history = await getBoardHistory(t, board.id, { maxAge: 5000 });
    timeline = buildTimeline(history.eventsFor(card.id), card, now);
  }

  const counting = countingOf(config);
  const names = Object.fromEntries(lists.map((l) => [l.id, l.name]));
  const rows = trackedIds(config, lists.map((l) => l.id)).map((id) => ({
    id,
    name: names[id],
    main: !!config.lists[id].main,
    label: config.lists[id].label || names[id],
    total: totalForList(timeline.intervals, id, now, counting),
    visits: timeline.visits[id] || 0,
    running: timeline.currentList === id,
  }));

  return { status: 'ok', card, config, lists, rows, counting, countingNow: isCountingNow(now, counting) };
}
