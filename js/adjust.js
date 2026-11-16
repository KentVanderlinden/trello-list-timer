// Manual corrections to a card's time per list, e.g. "I forgot to move it out of
// Working on it before going to bed". Stored on the card as { listId: ms } where
// ms is added to the time computed from Trello's move history (usually negative).
// Pure apart from loadAdjustments/saveAdjustments, which only call the Trello client.

const KEY = 'adjust';

// Keep only finite, non-zero, whole-ms numbers keyed by list id.
export function normalizeAdjustments(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw)) {
    const ms = Math.round(Number(v));
    if (id && Number.isFinite(ms) && ms !== 0) out[id] = ms;
  }
  return out;
}

// Total shown to the user: tracked time plus the correction, never below zero.
export function applyAdjustment(tracked, adjust) {
  return Math.max(0, tracked + (adjust || 0));
}

// Correction needed so the total becomes `wanted` right now.
export function adjustmentFor(wanted, tracked) {
  return Math.round(Math.max(0, wanted) - tracked);
}

// Hours + minutes typed in the editor -> ms, or null if it isn't a valid duration.
export function parseHoursMinutes(hours, minutes) {
  const hs = String(hours ?? '').trim();
  const ms = String(minutes ?? '').trim();
  if (!hs && !ms) return null;
  const h = hs ? Number(hs) : 0;
  const m = ms ? Number(ms) : 0;
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0) return null;
  return Math.round((h * 60 + m) * 60000);
}

// Whole hours and minutes, for pre-filling the editor.
export function splitHoursMinutes(ms) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  return { hours: Math.floor(totalMin / 60), minutes: totalMin % 60 };
}

export async function loadAdjustments(t) {
  try {
    return normalizeAdjustments(await t.get('card', 'shared', KEY));
  } catch {
    return {};
  }
}

export async function saveAdjustments(t, adjustments) {
  const clean = normalizeAdjustments(adjustments);
  if (!Object.keys(clean).length) return t.remove('card', 'shared', KEY);
  return t.set('card', 'shared', KEY, clean);
}
