// Small helpers shared by the iframe pages (settings, card section, auth).
/* global TrelloPowerUp */

import { API_KEY, APP_NAME } from './config.js';

export function connect() {
  return TrelloPowerUp.iframe({ appKey: API_KEY, appName: APP_NAME });
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Ask the user to authorize, then nudge Trello to re-render our badges.
export async function authorize(t) {
  await t.getRestApi().authorize({ scope: 'read', expiration: 'never' });
  await t.set('member', 'private', 'authorizedAt', Date.now());
}

export function fit(t, el) {
  // Let the layout settle, then size the iframe to its content.
  requestAnimationFrame(() => t.sizeTo(el).catch(() => {}));
}

// Inline icons (currentColor so they follow the theme).
export const ICONS = {
  timer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13.5" r="8"/><path d="M12 13.5V9.5"/><path d="M10 2.5h4"/><path d="M12 2.5v3"/><path d="M19 6.5l1.5-1.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L2.9 9.4l6.3-.9z"/></svg>',
  starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17.1 6.4 20l1.1-6.2L2.9 9.4l6.3-.9z"/></svg>',
};

export function icon(name) {
  const tpl = document.createElement('template');
  tpl.innerHTML = ICONS[name];
  return tpl.content.firstElementChild;
}
