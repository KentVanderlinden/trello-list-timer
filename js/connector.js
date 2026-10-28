// Power-Up entry point: tells Trello which badges, sections and buttons we add.
/* global TrelloPowerUp */

import { API_KEY, APP_NAME, assetUrl, badgeColor, mainIds, countingOf } from './config.js';
import { cardStats } from './stats.js';
import { formatDuration } from './time.js';
import { isAuthorized } from './history.js';

const ICON = assetUrl('img/icon.svg');
const ICON_WHITE = assetUrl('img/icon-white.svg');
const REFRESH_SECONDS = 60;

const openSettings = (t) => t.popup({ title: `${APP_NAME} settings`, url: './settings.html', height: 480 });

const useDays = (config) => countingOf(config).mode !== 'schedule';

async function safeStats(t) {
  try { return await cardStats(t); } catch (err) { console.warn('[List Timer]', err); return null; }
}

// Main lists the card has spent time in (or is in now), in board order.
function mainRows(stats) {
  if (!stats || stats.status !== 'ok') return [];
  const mains = mainIds(stats.config, stats.lists.map((l) => l.id));
  return stats.rows.filter((r) => mains.includes(r.id) && (r.total > 0 || r.running));
}

// A badge that re-computes itself every minute so the time keeps ticking.
function liveBadge(t, listId, render) {
  return {
    dynamic: async () => {
      const stats = await safeStats(t);
      const row = stats && stats.status === 'ok' && stats.rows.find((r) => r.id === listId);
      if (!row) return { refresh: REFRESH_SECONDS };
      return { ...render(row, stats), refresh: REFRESH_SECONDS };
    },
  };
}

TrelloPowerUp.initialize({
  'card-badges': async (t) => {
    const stats = await safeStats(t);
    return mainRows(stats).map((row) => liveBadge(t, row.id, (r, s) => ({
      icon: ICON,
      text: `${r.label} · ${formatDuration(r.total, { useDays: useDays(s.config) })}`,
      // Colored while the card is in the list (and the clock is ticking), gray otherwise.
      color: r.running && s.countingNow ? badgeColor(s.config, r.id) : null,
    })));
  },

  'card-detail-badges': async (t) => {
    const stats = await safeStats(t);
    return mainRows(stats).map((row) => ({
      ...liveBadge(t, row.id, (r, s) => ({
        title: r.name,
        text: `${r.running ? '▶ ' : ''}${formatDuration(r.total, { useDays: useDays(s.config) })}`,
        color: r.running && s.countingNow ? badgeColor(s.config, r.id) : null,
      })),
    }));
  },

  'card-back-section': (t) => ({
    title: 'Time in lists',
    icon: ICON,
    content: { type: 'iframe', url: t.signUrl('./card-section.html'), height: 80 },
  }),

  'board-buttons': () => [{
    icon: { dark: ICON_WHITE, light: ICON },
    text: APP_NAME,
    callback: openSettings,
  }],

  'show-settings': openSettings,

  'authorization-status': async (t) => ({ authorized: await isAuthorized(t) }),

  'show-authorization': (t) => t.popup({ title: `Authorize ${APP_NAME}`, url: './auth.html', height: 170 }),
}, {
  appKey: API_KEY,
  appName: APP_NAME,
});
