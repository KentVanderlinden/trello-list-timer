// "Time in lists" section on the back of a card: every tracked list with its total.

import { badgeColor } from './config.js';
import { cardStats } from './stats.js';
import { formatDuration, describeSchedule } from './time.js';
import { connect, h, icon, authorize, fit } from './ui.js';

const t = connect();
const root = document.getElementById('root');

const openSettings = () => t.popup({ title: 'List Timer settings', url: './settings.html', height: 480 });

function show(...children) {
  root.replaceChildren(...children);
  fit(t, root);
}

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

  return h('li', { class: `time-row${r.running ? ' running' : ''}${r.total > 0 ? '' : ' zero'}` },
    h('span', { class: 'dot', style: r.running || r.total > 0 ? `background: var(--c-${color})` : '' }),
    h('span', { class: 'name' }, r.main ? icon('star') : null, h('span', { class: 'n', title: r.name }, r.name)),
    h('span', { class: 'total' }, formatDuration(r.total, { useDays })),
    h('span', { class: 'sub' }, sub),
  );
}

async function render() {
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
    h('ul', { class: 'times' }, rows.map((r) => row(r, stats))),
    h('div', { class: 'section-footer' },
      h('span', {}, mode),
      h('button', { class: 'link', type: 'button', onclick: openSettings }, 'Settings')),
  );
}

t.render(render);
setInterval(render, 30000);
