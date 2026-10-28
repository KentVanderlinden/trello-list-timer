// Loads card move history for a board from the Trello REST API and caches it.
// One fetch per board is shared by every card badge; later refreshes only ask
// for newer actions. A copy is kept in localStorage so reopening the board is fast.

import { API_KEY } from './config.js';
import { ACTION_FILTER, toEvent } from './intervals.js';

const API = 'https://api.trello.com/1';
const PAGE = 1000;
const MAX_PAGES = 50;
const STORE_VERSION = 1;

export class NotAuthorizedError extends Error {}

export async function isAuthorized(t) {
  try { return await t.getRestApi().isAuthorized(); } catch { return false; }
}

async function token(t) {
  const api = t.getRestApi();
  const tok = await api.getToken();
  if (!tok) throw new NotAuthorizedError('Not authorized');
  return tok;
}

async function apiGet(t, path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', API_KEY);
  url.searchParams.set('token', await token(t));
  const res = await fetch(url.href);
  if (res.status === 401) {
    // Token revoked or expired: forget it so the user is asked to authorize again.
    try { await t.getRestApi().clearToken(); } catch { /* ignore */ }
    throw new NotAuthorizedError('Token rejected');
  }
  if (!res.ok) throw new Error(`Trello API ${res.status}`);
  return res.json();
}

async function fetchActions(t, path, since) {
  const out = [];
  let before = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = { filter: ACTION_FILTER, limit: PAGE, fields: 'type,date,data', memberCreator: 'false' };
    if (since) params.since = since;
    if (before) params.before = before;
    const batch = await apiGet(t, path, params);
    out.push(...batch);
    if (batch.length < PAGE) break;
    before = batch[batch.length - 1].id;
  }
  return out;
}

// ---------- Board cache ----------

class BoardHistory {
  constructor(boardId) {
    this.boardId = boardId;
    this.seen = new Set();
    this.byCard = new Map();
    this.newestTime = 0;
    this.fetchedAt = 0;
    this.pending = null;
  }

  add(ev) {
    if (!ev || this.seen.has(ev.id)) return;
    this.seen.add(ev.id);
    let list = this.byCard.get(ev.card);
    if (!list) this.byCard.set(ev.card, (list = []));
    list.push(ev);
    if (ev.t > this.newestTime) this.newestTime = ev.t;
  }

  eventsFor(cardId) {
    return this.byCard.get(cardId) || [];
  }

  storageKey() { return `list-timer:board:${this.boardId}`; }

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.storageKey()) || 'null');
      if (!raw || raw.v !== STORE_VERSION) return;
      for (const [id, card, t, k, l, from] of raw.e) this.add({ id, card, t, k, l: l || undefined, from: from || undefined });
    } catch { /* storage unavailable or corrupt: just refetch */ }
  }

  save() {
    try {
      const e = [];
      for (const evs of this.byCard.values()) for (const x of evs) e.push([x.id, x.card, x.t, x.k, x.l || 0, x.from || 0]);
      localStorage.setItem(this.storageKey(), JSON.stringify({ v: STORE_VERSION, e }));
    } catch { /* quota or private mode: in-memory cache still works */ }
  }
}

const boards = new Map();

function boardEntry(boardId) {
  let b = boards.get(boardId);
  if (!b) {
    b = new BoardHistory(boardId);
    b.load();
    boards.set(boardId, b);
  }
  return b;
}

/**
 * Up-to-date history for a board. Refetches newer actions when the cache is older
 * than maxAge. Throws NotAuthorizedError when the user hasn't authorized.
 */
export async function getBoardHistory(t, boardId, { maxAge = 60000 } = {}) {
  const b = boardEntry(boardId);
  if (b.pending) { await b.pending; return b; }
  if (b.fetchedAt && Date.now() - b.fetchedAt < maxAge) return b;

  b.pending = (async () => {
    // Overlap by a minute so actions with the same timestamp aren't missed; ids dedupe.
    const since = b.newestTime ? new Date(b.newestTime - 60000).toISOString() : null;
    try {
      const actions = await fetchActions(t, `/boards/${boardId}/actions`, since);
      for (const a of actions) b.add(toEvent(a));
      b.fetchedAt = Date.now();
      b.save();
    } catch (err) {
      if (err instanceof NotAuthorizedError) throw err;
      // Network or rate-limit hiccup: keep what we have, try again in ~15s.
      b.fetchedAt = Date.now() - maxAge + 15000;
      if (!b.seen.size) throw err;
    }
  })();
  try { await b.pending; } finally { b.pending = null; }
  return b;
}
