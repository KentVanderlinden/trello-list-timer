// Turns Trello card actions into "the card was in list X from A to B" intervals.
// Pure module: no DOM, no Trello client, so it can be tested in Node.

// Action types (with field filters) that tell us where a card was and when.
export const ACTION_FILTER = [
  'createCard',
  'copyCard',
  'convertToCardFromCheckItem',
  'moveCardToBoard',
  'moveCardFromBoard',
  'updateCard:idList',
  'updateCard:closed',
].join(',');

// Trello ids are Mongo ObjectIds: the first 8 hex chars are the creation time in seconds.
export function createdAtFromId(id) {
  return parseInt(String(id).slice(0, 8), 16) * 1000;
}

// Raw Trello action -> compact event, or null if it isn't relevant.
// Event: { id, card, t, k: 'enter'|'leave'|'archive'|'unarchive', l?, from? }
export function toEvent(action) {
  const d = action && action.data;
  const card = d && d.card && d.card.id;
  if (!card) return null;
  const t = Date.parse(action.date);
  if (Number.isNaN(t)) return null;
  const base = { id: action.id, card, t };

  switch (action.type) {
    case 'createCard':
    case 'copyCard':
    case 'convertToCardFromCheckItem':
    case 'moveCardToBoard':
      return d.list ? { ...base, k: 'enter', l: d.list.id } : null;
    case 'moveCardFromBoard':
      return { ...base, k: 'leave' };
    case 'updateCard':
      if (d.listAfter) {
        return { ...base, k: 'enter', l: d.listAfter.id, from: d.listBefore && d.listBefore.id };
      }
      if (d.old && 'closed' in d.old) {
        return { ...base, k: d.old.closed ? 'unarchive' : 'archive' };
      }
      return null;
    default:
      return null;
  }
}

function byTime(a, b) {
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Build the timeline of one card.
 * @param events  the card's events (any order)
 * @param card    { id, idList, closed } as Trello reports it now
 * @param now     current time in ms
 * @returns { intervals: [{list, start, end|null}], visits: {listId: n}, currentList, stale }
 *   end === null means "still there". stale = history is missing the latest move.
 */
export function buildTimeline(events, card, now = Date.now()) {
  const ev = (events || []).slice().sort(byTime);
  const intervals = [];
  const visits = {};
  let list = null;
  let archived = false;
  let since = null;

  const inList = () => list !== null && !archived;
  const close = (t) => {
    if (inList() && since !== null && t > since) intervals.push({ list, start: since, end: t });
  };
  const visit = (l) => { visits[l] = (visits[l] || 0) + 1; };

  // History can be incomplete (very old cards, or Trello trimming it). If it doesn't
  // start with the card arriving on the board, assume it sat in its first known list
  // since it was created.
  const created = createdAtFromId(card.id);
  const first = ev[0];
  if (!first) {
    list = card.idList || null;
    archived = !!card.closed;
    since = created;
    if (list) visit(list);
  } else if (first.k === 'enter' && first.from) {
    list = first.from;
    since = Math.min(created, first.t);
    visit(list);
  } else if (first.k === 'archive' || first.k === 'unarchive') {
    list = card.idList || null;
    archived = first.k === 'unarchive';
    since = Math.min(created, first.t);
    if (list) visit(list);
  }

  for (const e of ev) {
    if (e.k === 'enter') {
      close(e.t);
      list = e.l;
      archived = false;
      since = e.t;
      visit(list);
    } else if (e.k === 'leave') {
      close(e.t);
      list = null;
      since = null;
    } else if (e.k === 'archive') {
      close(e.t);
      archived = true;
    } else if (e.k === 'unarchive') {
      if (archived) since = e.t;
      archived = false;
    }
  }

  let stale = false;
  if (card.idList && !card.closed && card.idList !== (inList() ? list : null)) {
    // Trello says the card is somewhere our history doesn't know about yet.
    // Close what we have and start the new list now; the caller should refresh.
    stale = true;
    close(now);
    list = card.idList;
    archived = false;
    since = now;
    visit(list);
  }

  if (inList() && since !== null) intervals.push({ list, start: since, end: null });

  return { intervals, visits, currentList: inList() ? list : null, stale };
}
