// Pure trigger logic for the push Worker: which notifications exist, and which are due for one subscriber. No network, no storage, no clock
// of its own (callers pass `now`), so the tests run it with fixtures. Plan: docs/research/push-notifications-plan.md sections 4 and 14.

export const MIN = 60000;
export const HOUR = 3600000;
export const STALE_MS = 48 * HOUR;          // pipeline heartbeat older than this: nothing "new" is announced
export const MAX_SUBS = 300;                // enrolment cap (owner decision)
export const MAX_SCHEDULES = 5;             // pending Mega timers per subscriber

// Event types the app's feed produces (data/feed.json `type`). Defaults are the owner's picks; the rest are off until the person turns them on.
export const EVENT_TYPES = ['community-day', 'raid-hour', 'pokemon-spotlight-hour', 'pokemon-go-tour', 'max-battles', 'raid-day', 'max-mondays', 'season'];
export const DEFAULT_TYPES = ['community-day', 'raid-hour', 'pokemon-spotlight-hour', 'pokemon-go-tour', 'max-battles'];
const LEAD_MIN = { 'pokemon-go-tour': 1440, season: 1440 };   // everything else: 60 minutes
const ENDING_LEAD_MIN = 120;
// Mega timers carry a label from this fixed list, never free text. The time itself is the one the person logged in the app.
export const MEGA_LABELS = { 'rest-over': { title: 'Mega rest finished', body: 'A Mega Evolution can be used again.' } };
const CODE_RE = /^[A-Za-z0-9]{4,32}$/;

export function defaultPrefs() { return { promo: true, timedResearch: true, events: true, mega: true, ending: false, types: DEFAULT_TYPES.slice() }; }

// Whatever the client sent, reduced to known booleans and known event types.
export function cleanPrefs(p) {
  const d = defaultPrefs(), o = p && typeof p === 'object' ? p : {};
  ['promo', 'timedResearch', 'events', 'mega', 'ending'].forEach(k => { if (typeof o[k] === 'boolean') d[k] = o[k]; });
  if (Array.isArray(o.types)) d.types = EVENT_TYPES.filter(t => o.types.indexOf(t) >= 0);
  return d;
}

// ---- Time zones ------------------------------------------------------------------------------------------------------------------
const fmts = new Map();
function dtf(tz, kind) {
  const k = tz + '|' + kind;
  let f = fmts.get(k);
  if (!f) {
    f = kind === 'parts'
      ? new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      : new Intl.DateTimeFormat('en-US', kind === 'day' ? { timeZone: tz, weekday: 'short', hour: 'numeric', minute: '2-digit' } : { timeZone: tz, hour: 'numeric', minute: '2-digit' });
    fmts.set(k, f);
  }
  return f;
}
export function validTz(tz) {
  if (typeof tz !== 'string' || tz.length < 1 || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try { dtf(tz, 'parts'); return true; } catch (e) { return false; }
}
function offsetAt(tz, ms) {
  const p = {};
  for (const x of dtf(tz, 'parts').formatToParts(new Date(ms))) p[x.type] = +x.value;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}
// Feed event times carry no zone: they are the wall-clock time of the player's own region ("2026-11-21T14:00:00.000"). A string with Z or an
// offset (the GBL weeks) is already an instant. -> epoch ms, NaN when unreadable.
export function localToUtc(str, tz) {
  if (typeof str !== 'string') return NaN;
  if (/(Z|[+-]\d\d:?\d\d)$/.test(str)) return Date.parse(str);
  const m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?/.exec(str);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  const first = wall - offsetAt(tz, wall);
  return wall - offsetAt(tz, first);          // second pass settles the offset when the date is next to a clock change
}
export function clock(ms, tz, withDay) { return dtf(tz, withDay ? 'day' : 'time').format(new Date(ms)); }

// ---- Feed health ---------------------------------------------------------------------------------------------------------------
// data/feed_check.json is rewritten by every run of the refresh workflow, changed data or not, so its `checkedAt` is the heartbeat. (The
// `fetchedAt` of the data files only moves when the data changes, so it would call a healthy pipeline stale.)
export function pipelineFresh(check, now) {
  const t = check && typeof check.checkedAt === 'string' ? Date.parse(check.checkedAt) : NaN;
  return Number.isFinite(t) && now - t <= STALE_MS && t <= now + HOUR;
}

// First-sight bookkeeping for promo codes. firstSeen[code] = when this Worker first saw it; 0 = already there when it started (never announced).
// Returns true when `firstSeen` changed.
export function updateFirstSeen(state, promo, fresh, now) {
  if (!promo || !Array.isArray(promo.codes)) return false;
  const codes = promo.codes.filter(c => c && CODE_RE.test(String(c.code))).map(c => c.code);
  state.firstSeen = state.firstSeen || {};
  const fs = state.firstSeen; let changed = false;
  if (!state.seeded) { codes.forEach(c => { fs[c] = 0; }); state.seeded = true; return true; }   // first run: seed, announce nothing
  if (fresh) codes.forEach(c => { if (fs[c] === undefined) { fs[c] = now; changed = true; } });  // a dead pipeline records nothing, so nothing is lost when it recovers
  Object.keys(fs).forEach(c => { if (codes.indexOf(c) < 0) { delete fs[c]; changed = true; } });
  return changed;
}

// ---- The notifications that exist for one time zone ---------------------------------------------------------------------------------
// -> [{ id, cat, type, at, until, title, body, ttl, minCreated? }]. `at` = when to send, `until` = last moment it is still worth sending.
export function buildItems(data, tz, now, ctx) {
  const out = [];
  const firstSeen = (ctx && ctx.firstSeen) || {}, fresh = !!(ctx && ctx.fresh);
  const promo = data && data.promo, feed = data && data.feed, moves = data && data.moves;
  if (promo && Array.isArray(promo.codes)) promo.codes.forEach(c => {
    if (!c || c.verified !== true || c.expired || !CODE_RE.test(String(c.code))) return;      // verified codes only (owner decision)
    const cat = c.kind === 'timed_research' ? 'tr' : 'promo';
    const end = typeof c.expires === 'string' ? localToUtc(c.expires + 'T23:59:00', tz) : NaN;
    const name = String(c.name || '').slice(0, 80);
    if (fresh && firstSeen[c.code] > 0) {
      out.push({ id: 'promo:' + c.code, cat, at: firstSeen[c.code], until: Math.min(Number.isFinite(end) ? end : Infinity, firstSeen[c.code] + 3 * 24 * HOUR), minCreated: firstSeen[c.code],
        title: cat === 'tr' ? 'New Timed Research code' : 'New promo code', body: (name && name !== c.code ? name + ': ' : '') + c.code, ttl: 86400 });
    }
    if (Number.isFinite(end)) out.push({ id: 'promoexp:' + c.code, cat, at: end - 24 * HOUR, until: end, title: 'Promo code ends soon', body: c.code + ' ends ' + clock(end, tz, true), ttl: 3600 });
  });
  if (feed && Array.isArray(feed.events)) feed.events.forEach(e => {
    if (!e || typeof e.id !== 'string' || EVENT_TYPES.indexOf(e.type) < 0) return;
    const st = localToUtc(e.start, tz), en = localToUtc(e.end, tz), name = String(e.name || 'Event').slice(0, 80);
    const lead = (LEAD_MIN[e.type] || 60) * MIN;
    if (Number.isFinite(st)) out.push({ id: 'evt:' + e.id + ':start', cat: 'event', type: e.type, at: st - lead, until: st, title: name, body: 'Starts ' + clock(st, tz, lead >= 24 * HOUR), ttl: 3600 });
    if (Number.isFinite(en)) out.push({ id: 'evt:' + e.id + ':end', cat: 'end', type: e.type, at: en - ENDING_LEAD_MIN * MIN, until: en, title: name + ' ends soon', body: 'Ends ' + clock(en, tz, false), ttl: 3600 });
  });
  if (moves && Array.isArray(moves.moves)) moves.moves.forEach(m => {
    if (!m || typeof m.eventId !== 'string' || typeof m.species !== 'string') return;
    const st = localToUtc(m.start, tz);
    if (Number.isFinite(st)) out.push({ id: 'mv:' + m.eventId + ':' + m.species, cat: 'move', type: m.type, at: st, until: st + HOUR, title: 'Event move: ' + m.species.slice(0, 40),
      body: String(m.sentence || (m.to ? m.species + ' to ' + m.to + ' knows ' + m.move : m.move) || '').slice(0, 160), ttl: 3600 });
  });
  if (feed && Array.isArray(feed.gbl)) feed.gbl.forEach(g => {
    const st = g && localToUtc(g.start, tz);                                                    // GBL entries carry Z
    if (Number.isFinite(st)) out.push({ id: 'gbl:' + g.start, cat: 'gbl', at: st, until: st + 2 * HOUR, title: 'New GO Battle League week', body: String(g.season || '').slice(0, 60), ttl: 3600 });
  });
  return out;
}

// The user's own Mega timers (time and fixed label chosen in the app).
export function megaItems(sub, now) {
  const out = [];
  (sub.schedules || []).forEach(s => {
    const lab = s && MEGA_LABELS[s.label];
    if (lab && Number.isFinite(s.fireAt)) out.push({ id: 'mega:' + s.id, cat: 'mega', at: s.fireAt, until: s.fireAt + 6 * HOUR, title: lab.title, body: lab.body, ttl: 3600 });
  });
  return out;
}

function wanted(it, prefs) {
  switch (it.cat) {
    case 'promo': return prefs.promo;
    case 'tr': return prefs.timedResearch;
    case 'event': case 'move': return prefs.events && prefs.types.indexOf(it.type) >= 0;
    case 'end': return prefs.events && prefs.ending && prefs.types.indexOf(it.type) >= 0;
    case 'gbl': return prefs.events;
    case 'mega': return prefs.mega;
    default: return false;
  }
}

// Items due for one subscriber right now, oldest first. `sent` = { id: sentAtMs } for this subscriber.
export function dueFor(sub, items, now, sent) {
  const prefs = cleanPrefs(sub.prefs);
  return items.concat(megaItems(sub, now))
    .filter(it => it.at <= now && now < it.until && !(sent && sent[it.id]) && wanted(it, prefs) && !(it.minCreated !== undefined && !(it.minCreated > sub.createdAt)))
    .sort((a, b) => a.at - b.at);
}
