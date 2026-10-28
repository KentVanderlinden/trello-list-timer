// Stand-in for Trello's power-up.min.js so the pages can be previewed locally.
// dev/preview.mjs swaps it in for the real script; it is never deployed.
(function () {
  try { localStorage.clear(); } catch { /* ignore */ }
  const H = 3600000;
  const now = Date.now();
  const params = new URLSearchParams(location.search);
  const state = params.get('state') || 'ok'; // ok | unauth | empty
  const lists = [
    { id: 'l1', name: 'To do' },
    { id: 'l2', name: 'Working on it' },
    { id: 'l3', name: 'On hold' },
    { id: 'l4', name: 'Waiting for review from the client' },
    { id: 'l5', name: 'Done' },
  ];
  const stored = {
    'board:shared:config': state === 'empty' ? undefined : {
      version: 1,
      lists: { l2: { tracked: true, main: true }, l3: { tracked: true, main: true, color: 'orange', label: 'Hold' }, l4: { tracked: true } },
      mode: params.get('mode') || '24/7',
      schedule: { tz: 'Europe/Brussels', days: {
        mon: { on: true, from: '09:00', to: '17:00' }, tue: { on: true, from: '09:00', to: '17:00' },
        wed: { on: true, from: '09:00', to: '17:00' }, thu: { on: true, from: '09:00', to: '17:00' },
        fri: { on: true, from: '09:00', to: '17:00' }, sat: { on: false, from: '09:00', to: '17:00' },
        sun: { on: false, from: '09:00', to: '17:00' } } },
    },
  };
  const cardId = Math.floor((now - 30 * H) / 1000).toString(16) + '0000000000000000';
  const iso = (ms) => new Date(ms).toISOString();
  let n = 0;
  const salt = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  const aid = () => (Math.floor(now / 1000) - 1000 + n++).toString(16) + salt + 'bbbbbbbb';
  const actions = [
    { id: aid(), type: 'createCard', date: iso(now - 30 * H), data: { card: { id: cardId }, list: { id: 'l1' } } },
    { id: aid(), type: 'updateCard', date: iso(now - 26 * H), data: { card: { id: cardId }, listBefore: { id: 'l1' }, listAfter: { id: 'l2' } } },
    { id: aid(), type: 'updateCard', date: iso(now - 23 * H), data: { card: { id: cardId }, listBefore: { id: 'l2' }, listAfter: { id: 'l3' } } },
    { id: aid(), type: 'updateCard', date: iso(now - 3 * H - 1200000), data: { card: { id: cardId }, listBefore: { id: 'l3' }, listAfter: { id: 'l2' } } },
  ].reverse();

  const realFetch = window.fetch.bind(window);
  window.fetch = (url, opts) => {
    if (String(url).startsWith('https://api.trello.com/')) {
      return Promise.resolve(new Response(JSON.stringify(actions), { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return realFetch(url, opts);
  };

  function makeT() {
    return {
      get: async (scope, vis, key) => stored[`${scope}:${vis}:${key}`],
      set: async (scope, vis, key, val) => { stored[`${scope}:${vis}:${key}`] = val; console.log('[mock] set', key, JSON.stringify(val)); },
      lists: async () => lists,
      board: async () => ({ id: 'board1' }),
      card: async () => ({ id: cardId, idList: 'l2', closed: false }),
      sizeTo: async (el) => { const e = typeof el === 'string' ? document.querySelector(el) : el; window.__height = e.getBoundingClientRect().height; },
      render: (fn) => { fn(); },
      popup: async (o) => console.log('[mock] popup', o.url),
      closePopup: async () => {},
      signUrl: (u) => u,
      getRestApi: () => ({
        isAuthorized: async () => state !== 'unauth',
        getToken: async () => (state === 'unauth' ? null : 'tok'),
        authorize: async () => 'tok',
        clearToken: async () => {},
      }),
    };
  }

  window.TrelloPowerUp = {
    iframe: () => makeT(),
    initialize: (caps) => { window.__caps = caps; window.__t = makeT(); },
  };
})();
