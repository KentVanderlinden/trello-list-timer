// "Time in lists" section on the back of a card: every tracked list with its total.

import { badgeColor } from './config.js';
import { cardStats } from './stats.js';
import { formatDuration, describeSchedule } from './time.js';
import {
  adjustmentFor, parseHoursMinutes, splitHoursMinutes, saveAdjustments,
} from './adjust.js';
import { connect, h, icon, authorize, fit } from './ui.js';

const t = connect();
const root = document.getElementById('root');

const openSettings = () => t.popup({ title: 'List Timer settings', url: './settings.html', height: 480 });

// Id of the list whose time is being edited. While set, the periodic refresh is
// paused so it doesn't wipe what the user is typing.
let editing = null;

function show(...children) {
  root.replaceChildren(...children);
  fit(t, root);
}

const signed = (ms, useDays) => `${ms < 0 ? '−' : '+'}${formatDuration(Math.abs(ms), { useDays })}`;

function row(r, stats) {
  const useDays = stats.counting.mode !== 'schedule';
  const color = badgeColor(stats.config, r.id);
  const sub = [];
  if (r.running) {
    sub.push(stats.countingNow
      ? h('span', { class: 'pill' }, h('span', { class: 'pulse' }), 'Counting')
      : h('span', { class: 'pill paused', title: 'Outside your set hours' }, 'Paused · outside hours'));
  }
  sub.push(h('span', {}, r.visits === 1 ? '1 visit' : `${r.visits} visits`));
  if (r.adjust) {
    sub.push(h('span', {
      class: 'edited',
      title: `Trello's move history says ${formatDuration(r.tracked, { useDays })}; corrected by ${signed(r.adjust, useDays)}`,
    }, `Edited ${signed(r.adjust, useDays)}`));
  }

  return h('li', { class: `time-row${r.running ? ' running' : ''}${r.total > 0 ? '' : ' zero'}` },
    h('span', { class: 'dot', style: r.running || r.total > 0 ? `background: var(--c-${color})` : '' }),
    h('span', { class: 'name' }, r.main ? icon('star') : null, h('span', { class: 'n', title: r.name }, r.name)),
    h('span', { class: 'total' }, formatDuration(r.total, { useDays })),
    h('button', {
      class: 'icon-btn edit', type: 'button',
      title: `Change the time in ${r.name}`, 'aria-label': `Change the time in ${r.name}`,
      onclick: () => { editing = r.id; render({ force: true }); },
    }, icon('pencil')),
    h('span', { class: 'sub' }, sub),
  );
}

// Inline form that replaces a row while its time is being changed.
function editor(r, stats) {
  const useDays = stats.counting.mode !== 'schedule';
  const { hours, minutes } = splitHoursMinutes(r.total);
  const error = h('span', { class: 'error', role: 'alert' });

  const hoursIn = h('input', {
    class: 'text-input num', type: 'number', min: '0', step: '1', inputmode: 'numeric',
    value: String(hours), 'aria-label': 'Hours',
  });
  const minutesIn = h('input', {
    class: 'text-input num', type: 'number', min: '0', max: '59', step: '1', inputmode: 'numeric',
    value: String(minutes), 'aria-label': 'Minutes',
  });

  const close = () => { editing = null; render({ force: true }); };

  // Save against fresh numbers: a running list keeps ticking while you type.
  const commit = async (wantedFor) => {
    error.textContent = '';
    for (const b of form.querySelectorAll('button')) b.disabled = true;
    try {
      const fresh = await cardStats(t);
      const now = fresh.status === 'ok' && fresh.rows.find((x) => x.id === r.id);
      if (!now) throw new Error('List is no longer tracked');
      const next = { ...fresh.adjustments };
      const wanted = wantedFor(now);
      if (wanted === null) delete next[r.id];
      else next[r.id] = adjustmentFor(wanted, now.tracked);
      await saveAdjustments(t, next);
      close();
    } catch (err) {
      console.warn(err);
      error.textContent = "Couldn't save. Check that you can edit this card and try again.";
      for (const b of form.querySelectorAll('button')) b.disabled = false;
      fit(t, root);
    }
  };

  const form = h('form', {
    class: 'edit-form',
    onsubmit: (e) => {
      e.preventDefault();
      const wanted = parseHoursMinutes(hoursIn.value, minutesIn.value);
      if (wanted === null) {
        error.textContent = 'Enter the time as hours and minutes, e.g. 3 h 20 m.';
        fit(t, root);
        return;
      }
      commit(() => wanted);
    },
    onkeydown: (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } },
  },
  h('div', { class: 'edit-head' },
    h('span', { class: 'n', title: r.name }, r.name),
    h('span', { class: 'muted' }, 'Total time in this list')),
  h('div', { class: 'edit-fields' },
    hoursIn, h('span', { class: 'unit' }, 'h'),
    minutesIn, h('span', { class: 'unit' }, 'm')),
  h('p', { class: 'hint' },
    `Trello's move history says ${formatDuration(r.tracked, { useDays })}.`,
    r.running ? ' The card is still here, so the clock keeps running from the time you set.' : ''),
  error,
  h('div', { class: 'edit-actions' },
    h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save'),
    h('button', { class: 'btn', type: 'button', onclick: close }, 'Cancel'),
    r.adjust
      ? h('button', { class: 'link reset', type: 'button', onclick: () => commit(() => null) }, 'Undo edit')
      : null));

  const li = h('li', { class: 'time-row editing' }, form);
  requestAnimationFrame(() => { hoursIn.focus(); hoursIn.select(); });
  return li;
}

async function render({ force = false } = {}) {
  if (editing && !force) return;
  let stats;
  try {
    stats = await cardStats(t);
  } catch (err) {
    console.warn(err);
    show(h('div', { class: 'empty' }, "Couldn't load the card's history from Trello. It will retry in a moment."));
    return;
  }

  if (stats.status === 'no-key') {
    show(h('div', { class: 'empty' }, 'Setup not finished: the Trello API key is missing in js/config.js.'));
    return;
  }
  if (stats.status === 'not-authorized') {
    show(h('div', { class: 'empty' },
      h('span', {}, 'Authorize List Timer once to see how long this card spent in each list.'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await authorize(t); render(); } catch (e) { console.warn(e); } } }, 'Authorize')));
    return;
  }
  if (!stats.rows.length) {
    show(h('div', { class: 'empty' },
      h('span', {}, 'No lists are being timed on this board yet.'),
      h('button', { class: 'btn', type: 'button', onclick: openSettings }, 'Choose lists')));
    return;
  }

  // Main lists first, then the rest, each in board order.
  const rows = [...stats.rows.filter((r) => r.main), ...stats.rows.filter((r) => !r.main)];
  const mode = stats.counting.mode === 'schedule'
    ? `Counting ${describeSchedule(stats.counting.schedule)}`
    : 'Counting 24/7';

  show(
    h('ul', { class: 'times' }, rows.map((r) => (r.id === editing ? editor(r, stats) : row(r, stats)))),
    h('div', { class: 'section-footer' },
      h('span', {}, mode),
      h('button', { class: 'link', type: 'button', onclick: openSettings }, 'Settings')),
  );
}

t.render(() => render());
setInterval(() => render(), 30000);
