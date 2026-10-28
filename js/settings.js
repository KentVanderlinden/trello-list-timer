// Settings popup: choose tracked/main lists, badge look, and when time counts.

import { loadConfig, saveConfig, COLORS, isKeyConfigured, badgeColor } from './config.js';
import { isAuthorized } from './history.js';
import { WEEK_ORDER, DAY_LABELS, describeSchedule } from './time.js';
import { connect, h, icon, authorize, fit } from './ui.js';

const t = connect();
const root = document.getElementById('root');
const listsEl = document.getElementById('lists');
const daysEl = document.getElementById('days');
const tzEl = document.getElementById('tz');
const scheduleEl = document.getElementById('schedule');
const modeHint = document.getElementById('mode-hint');
const toast = document.getElementById('toast');

let config;
let lists = [];

// ---------- Saving ----------

let saveTimer;
let toastTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveConfig(t, config, lists.map((l) => l.id));
      toast.textContent = 'Saved ✓';
    } catch (err) {
      console.error(err);
      toast.textContent = 'Could not save, please try again';
    }
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }, 250);
}

function listCfg(id) {
  if (!config.lists[id]) config.lists[id] = { tracked: false };
  return config.lists[id];
}

// ---------- Banner (authorize / setup) ----------

async function renderBanner() {
  const el = document.getElementById('banner');
  el.replaceChildren();
  if (!isKeyConfigured()) {
    el.append(h('div', { class: 'banner warning' },
      h('div', {}, h('strong', {}, 'Almost there. '), 'Add your Trello API key to ', h('code', {}, 'js/config.js'), ' to start timing.')));
    return;
  }
  if (await isAuthorized(t)) return;
  el.append(h('div', { class: 'banner' },
    h('div', {}, 'List Timer needs read access to see when cards moved. You only do this once.'),
    h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: async () => { try { await authorize(t); renderBanner(); } catch (e) { console.warn(e); } },
    }, 'Authorize'),
  ));
  fit(t, root);
}

// ---------- Lists ----------

function badgePreview(id, name) {
  const c = config.lists[id];
  const color = badgeColor(config, id);
  const b = h('span', { class: 'badge colored', style: `background: var(--c-${color})` },
    icon('timer'), `${c.label || name} · 2h 15m`);
  return h('div', { class: 'preview' }, 'Preview', b);
}

function renderLists() {
  listsEl.replaceChildren();
  if (!lists.length) {
    listsEl.append(h('li', { class: 'empty' }, 'This board has no lists yet.'));
    return;
  }
  for (const list of lists) {
    const c = config.lists[list.id] || {};
    const tracked = !!c.tracked;
    const main = tracked && !!c.main;

    const toggle = h('label', { class: 'switch', title: tracked ? 'Stop tracking' : 'Track this list' },
      h('input', {
        type: 'checkbox', checked: tracked, 'aria-label': `Track ${list.name}`,
        onchange: (e) => {
          const lc = listCfg(list.id);
          lc.tracked = e.target.checked;
          if (!lc.tracked) lc.main = false;
          // First tracked list becomes main automatically: most people want to see something.
          else if (!Object.values(config.lists).some((x) => x.main)) lc.main = true;
          save(); renderLists();
        },
      }),
      h('span', { class: 'slider' }));

    const star = h('button', {
      type: 'button', class: 'star', disabled: !tracked,
      'aria-pressed': String(main),
      title: main ? 'Shown on the card front. Click to only show inside the card' : 'Show this time on the card front',
      onclick: () => { const lc = listCfg(list.id); lc.main = !lc.main; save(); renderLists(); },
    }, icon(main ? 'star' : 'starOutline'), 'Main');

    const li = h('li', { class: `list-item${tracked ? ' is-tracked' : ''}${main ? ' is-main' : ''}` },
      h('div', { class: 'list-row' }, toggle, h('span', { class: 'list-name', title: list.name }, list.name), star));

    if (main) {
      const previewSlot = h('div', {}, badgePreview(list.id, list.name));
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Badge color' },
        COLORS.map((color) => h('button', {
          type: 'button', class: 'swatch', role: 'radio', title: color,
          'aria-label': color, 'aria-checked': String(badgeColor(config, list.id) === color),
          style: `background: var(--c-${color})`,
          onclick: () => { listCfg(list.id).color = color; save(); renderLists(); },
        })));
      const label = h('input', {
        class: 'text-input', type: 'text', maxlength: '24', value: c.label || '',
        placeholder: list.name, 'aria-label': 'Badge label',
        oninput: (e) => {
          listCfg(list.id).label = e.target.value.trim();
          previewSlot.replaceChildren(badgePreview(list.id, list.name));
          save();
        },
      });
      li.append(h('div', { class: 'list-extra' },
        h('span', { class: 'field-label' }, 'Badge label'), label,
        h('span', { class: 'field-label' }, 'Color while in this list'), swatches,
        previewSlot));
    }
    listsEl.append(li);
  }
  fit(t, root);
}

// ---------- Counting mode & schedule ----------

function renderMode() {
  for (const b of document.querySelectorAll('.segmented button')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === config.mode));
  }
  const scheduled = config.mode === 'schedule';
  scheduleEl.hidden = !scheduled;
  modeHint.textContent = scheduled
    ? `Only counts ${describeSchedule(config.schedule)}. Time outside these hours is skipped.`
    : 'Counts every minute a card sits in a tracked list, nights and weekends included.';
  fit(t, root);
}

function renderTimeZones() {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { /* old browser */ }
  if (!zones.includes(config.schedule.tz)) zones.unshift(config.schedule.tz);
  tzEl.replaceChildren(...zones.map((z) => h('option', { value: z, selected: z === config.schedule.tz }, z.replace(/_/g, ' '))));
}

function renderDays() {
  daysEl.replaceChildren();
  for (const key of WEEK_ORDER) {
    const d = config.schedule.days[key];
    const onChange = () => { save(); renderMode(); };
    const from = h('input', { type: 'time', value: d.from, disabled: !d.on, 'aria-label': `${DAY_LABELS[key]} from`, onchange: (e) => { d.from = e.target.value || '00:00'; onChange(); } });
    const to = h('input', { type: 'time', value: d.to, disabled: !d.on, 'aria-label': `${DAY_LABELS[key]} until`, onchange: (e) => { d.to = e.target.value || '00:00'; onChange(); } });
    const row = h('div', { class: `day${d.on ? '' : ' off'}` },
      h('label', {},
        h('input', { type: 'checkbox', checked: d.on, onchange: (e) => { d.on = e.target.checked; renderDays(); onChange(); } }),
        DAY_LABELS[key]),
      from, h('span', { class: 'dash' }, '–'), to);
    daysEl.append(row);
  }
}

document.querySelectorAll('.segmented button').forEach((b) => b.addEventListener('click', () => {
  config.mode = b.dataset.mode;
  save(); renderMode();
}));
tzEl.addEventListener('change', () => { config.schedule.tz = tzEl.value; save(); });
document.getElementById('copy-mon').addEventListener('click', () => {
  const mon = config.schedule.days.mon;
  for (const k of ['tue', 'wed', 'thu', 'fri']) config.schedule.days[k] = { ...mon };
  renderDays(); save(); renderMode();
});

// ---------- Boot ----------

async function init() {
  [config, lists] = await Promise.all([loadConfig(t), t.lists('id', 'name')]);
  renderLists();
  renderMode();
  renderTimeZones();
  renderDays();
  await renderBanner();
  fit(t, root);
}

init();
