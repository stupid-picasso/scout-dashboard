#!/usr/bin/env node
// Trigger logic of the push Worker (worker/src/logic.js) against fixtures and a fake clock: leads, dedupe, first-run seeding, stale-feed rule,
// time zones (including a clock change), verified-only promo codes, timed-research flag, event types, GBL window, Mega timers.
// No network, no storage. Run: node scripts/test_push_triggers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildItems, dueFor, cleanPrefs, defaultPrefs, localToUtc, validTz, pipelineFresh, updateFirstSeen, DEFAULT_TYPES, HOUR, MIN } from '../worker/src/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = n => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', n), 'utf8'));
const feed = fx('push_feed.json'), promo = fx('push_promo.json'), moves = fx('push_moves.json');
let fail = 0, n = 0;
const check = (name, got, want) => { n++; const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { fail++; console.log('FAIL', name, '\n  got ', a, '\n  want', b); } };
const iso = s => Date.parse(s);
const ids = list => list.map(i => i.id).sort();
const sub = (over) => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', prefs: defaultPrefs(), tz: 'America/New_York', createdAt: iso('2026-11-01T00:00:00Z'), schedules: [], ...over });
const data = { promo, feed, moves };
const due = (s, now, ctx, sent, d) => dueFor(s, buildItems(d || data, s.tz, now, ctx || { firstSeen: {}, fresh: true }), now, sent || {});

// ---- Time zones: feed times are wall-clock for the player's own region -------------------------------------------------------------
check('NY before the clock change (EDT, UTC-4)', new Date(localToUtc('2026-10-31T14:00:00.000', 'America/New_York')).toISOString(), '2026-10-31T18:00:00.000Z');
check('NY after the clock change (EST, UTC-5)', new Date(localToUtc('2026-11-01T14:00:00.000', 'America/New_York')).toISOString(), '2026-11-01T19:00:00.000Z');
check('NY spring forward day, after the jump', new Date(localToUtc('2026-03-08T14:00:00.000', 'America/New_York')).toISOString(), '2026-03-08T18:00:00.000Z');
check('Tokyo has no DST (UTC+9)', new Date(localToUtc('2026-11-21T14:00:00.000', 'Asia/Tokyo')).toISOString(), '2026-11-21T05:00:00.000Z');
check('Sydney in southern summer (UTC+11)', new Date(localToUtc('2026-11-21T14:00:00.000', 'Australia/Sydney')).toISOString(), '2026-11-21T03:00:00.000Z');
check('UTC', new Date(localToUtc('2026-11-21T14:00:00.000', 'UTC')).toISOString(), '2026-11-21T14:00:00.000Z');
check('a string with Z is already an instant (tour, GBL)', localToUtc('2027-02-18T16:00:00.000Z', 'America/New_York'), iso('2027-02-18T16:00:00Z'));
check('garbage is NaN', Number.isNaN(localToUtc('soon', 'UTC')), true);
check('zone validation', [validTz('Europe/Paris'), validTz('Mars/Base'), validTz(''), validTz('a'.repeat(80)), validTz(null), validTz('../etc')], [true, false, false, false, false, false]);

// ---- Community Day: 60 minutes ahead, in the subscriber's own zone, once ---------------------------------------------------------------
const cdNY = iso('2026-11-21T19:00:00Z') - HOUR;             // 14:00 EST minus an hour
check('CD in New York: not due a minute early', ids(due(sub(), cdNY - MIN)).filter(i => /november-communityday/.test(i)), []);
check('CD in New York: due at the lead', ids(due(sub(), cdNY)).filter(i => /november-communityday/.test(i)), ['evt:november-communityday2026:start']);
check('CD in New York: not due once it has started', ids(due(sub(), cdNY + HOUR)).filter(i => /^evt:november-communityday/.test(i)), []);
const cdTokyo = iso('2026-11-21T05:00:00Z') - HOUR;
check('CD in Tokyo is due at a different instant', [ids(due(sub({ tz: 'Asia/Tokyo' }), cdNY)).some(i => /november-communityday/.test(i)), ids(due(sub({ tz: 'Asia/Tokyo' }), cdTokyo)).some(i => /november-communityday/.test(i))], [false, true]);
check('dedupe: an id already sent is not due again', ids(due(sub(), cdNY, null, { 'evt:november-communityday2026:start': cdNY })).filter(i => /november-communityday/.test(i)), []);
const body = due(sub(), cdNY).find(i => /november-communityday/.test(i.id));
check('body names the local start time', body.body, 'Starts 2:00 PM');

// ---- Event types: defaults on, the rest off until chosen -------------------------------------------------------------------------
const all = buildItems(data, 'UTC', iso('2026-11-18T00:00:00Z'), { firstSeen: {}, fresh: true });
check('the feed types that are not notification types (event, raid-battles) never produce an item', all.some(i => /dynamax-trails|minior-showers|cresselia|mega-banette/.test(i.id)), false);
const rd = iso('2026-11-28T14:00:00Z') - HOUR;
check('raid-day is off by default', ids(due(sub({ tz: 'UTC' }), rd)).filter(i => /raid-day|super-mega/.test(i)), []);
check('raid-day on when chosen', ids(due(sub({ tz: 'UTC', prefs: cleanPrefs({ types: DEFAULT_TYPES.concat('raid-day') }) }), rd)).filter(i => /super-mega/.test(i)), ['evt:clefable-super-mega-raid-day-2026:start']);
check('season is off by default', ids(due(sub({ tz: 'UTC' }), iso('2026-12-01T10:00:00Z') - 24 * HOUR)).filter(i => /season/.test(i)), []);
check('go-tour uses a 24 hour lead (feed time is an instant)', ids(due(sub({ tz: 'UTC' }), iso('2027-02-18T16:00:00Z') - 24 * HOUR)).filter(i => /kaohsiung/.test(i)), ['evt:pokemon-go-tour-alola-kaohsiung-2027:start']);
check('events master toggle off silences events, moves and GBL', ids(due(sub({ tz: 'UTC', prefs: cleanPrefs({ events: false }) }), cdNY)).length, 0);
const endNow = iso('2026-11-21T17:00:00Z') - 2 * HOUR;       // CD ends 17:00 local (UTC here)
check('event-ending-soon is off by default', ids(due(sub({ tz: 'UTC' }), iso('2026-11-21T15:30:00Z'))).filter(i => /:end/.test(i)), []);
check('event-ending-soon on when chosen', ids(due(sub({ tz: 'UTC', prefs: cleanPrefs({ ending: true }) }), iso('2026-11-21T15:30:00Z'))).filter(i => /november-communityday/.test(i) && /:end/.test(i)), ['evt:november-communityday2026:end']);
void endNow;

// ---- Event moves and GBL week ----------------------------------------------------------------------------------------------------
const mvStart = localToUtc('2026-11-21T14:00:00.000', 'America/New_York');
check('event move: due at the event start, not before', [ids(due(sub(), mvStart - MIN)).some(i => /^mv:/.test(i)), ids(due(sub(), mvStart)).some(i => /^mv:/.test(i))], [false, true]);
check('event move: gone an hour after the start', ids(due(sub(), mvStart + HOUR + MIN)).some(i => /^mv:/.test(i)), false);
const gbl = iso('2026-11-18T21:00:00Z');
check('GBL week: due at the boundary', ids(due(sub(), gbl + MIN)).filter(i => /^gbl:/.test(i)), ['gbl:2026-11-18T21:00:00.000Z']);
check('GBL week: a week that started 3 hours ago is not announced (first run after deploy)', ids(due(sub(), gbl + 3 * HOUR)).filter(i => /^gbl:/.test(i)), []);

// ---- Promo codes: verified only, first sight, seeding, stale feed -----------------------------------------------------------------------
const now = iso('2026-11-18T12:00:00Z');
const state = {};
check('first run seeds without announcing', [updateFirstSeen(state, promo, true, now), state.seeded, Object.values(state.firstSeen).every(v => v === 0)], [true, true, true]);
check('seeded codes are never announced', ids(due(sub(), now, { firstSeen: state.firstSeen, fresh: true })).filter(i => /^promo:/.test(i)), []);
const promo2 = { ...promo, codes: promo.codes.concat([{ code: 'FAKENEWCODE01', name: 'Fake new item', rewards: [], expires: null, expired: false, verified: true, kind: 'standard' }, { code: 'FAKENEWUNVER1', name: 'x', rewards: [], expires: null, expired: false, verified: false, kind: 'standard' }, { code: 'FAKENEWTR0001', name: 'Fake research', rewards: ['Timed Research'], expires: null, expired: false, verified: true, kind: 'timed_research' }]) };
const t1 = now + 30 * MIN;
check('a new code is recorded at first sight', updateFirstSeen(state, promo2, true, t1), true);
check('only the verified new codes are announced; the unverified one never', ids(due(sub(), t1, { firstSeen: state.firstSeen, fresh: true }, {}, { ...data, promo: promo2 })).filter(i => /^promo:/.test(i)), ['promo:FAKENEWCODE01', 'promo:FAKENEWTR0001']);
check('a subscriber who joined after first sight does not get that code', ids(due(sub({ createdAt: t1 + MIN }), t1 + 2 * MIN, { firstSeen: state.firstSeen, fresh: true }, {}, { ...data, promo: promo2 })).filter(i => /^promo:/.test(i)), []);
check('timed research has its own toggle', ids(due(sub({ prefs: cleanPrefs({ timedResearch: false }) }), t1, { firstSeen: state.firstSeen, fresh: true }, {}, { ...data, promo: promo2 })).filter(i => /^promo:/.test(i)), ['promo:FAKENEWCODE01']);
check('promo toggle off keeps timed research', ids(due(sub({ prefs: cleanPrefs({ promo: false }) }), t1, { firstSeen: state.firstSeen, fresh: true }, {}, { ...data, promo: promo2 })).filter(i => /^promo:/.test(i)), ['promo:FAKENEWTR0001']);
check('hostile code text is never turned into an item', buildItems({ promo: { codes: [{ code: 'x" onclick="y', verified: true, expired: false }, { code: 'AB', verified: true }] } }, 'UTC', now, { firstSeen: { 'x" onclick="y': 5 }, fresh: true }).length, 0);
const exp = iso('2026-11-20T23:59:00Z');   // FAKEVERIFIED1 expires 2026-11-20 end of day (UTC here)
check('expiring code: reminder 24 h before the end of its last day', [ids(due(sub({ tz: 'UTC' }), exp - 25 * HOUR)).includes('promoexp:FAKEVERIFIED1'), ids(due(sub({ tz: 'UTC' }), exp - 23 * HOUR)).includes('promoexp:FAKEVERIFIED1'), ids(due(sub({ tz: 'UTC' }), exp + MIN)).includes('promoexp:FAKEVERIFIED1')], [false, true, false]);
check('expired and unverified codes never get an expiry reminder', ids(due(sub({ tz: 'UTC' }), iso('2026-11-02T00:00:00Z'))).some(i => /FAKEEXPIRED1|FAKEUNVERIFD1/.test(i)), false);

// Stale pipeline: nothing "new", reminders still go out. The heartbeat is feed_check.json, not the data files' own fetchedAt.
check('heartbeat: 6 hours old is fresh', pipelineFresh({ checkedAt: '2026-11-18T06:00:00Z' }, now), true);
check('heartbeat: 3 days old is stale', pipelineFresh({ checkedAt: '2026-11-15T06:00:00Z' }, now), false);
check('heartbeat: missing or unreadable is stale', [pipelineFresh(null, now), pipelineFresh({}, now), pipelineFresh({ checkedAt: 'x' }, now)], [false, false, false]);
check('a data file whose own fetchedAt is old does not make a healthy pipeline stale', pipelineFresh({ checkedAt: '2026-11-18T06:00:00Z' }, now) && promo.fetchedAt < '2026-11-18', true);
const st2 = { seeded: true, firstSeen: {} };
check('stale: first sight is not recorded, so nothing is lost on recovery', [updateFirstSeen(st2, promo2, false, t1), Object.keys(st2.firstSeen).length], [false, 0]);
check('stale: no new-code announcement', ids(due(sub(), t1, { firstSeen: { FAKENEWCODE01: t1 }, fresh: false }, {}, { ...data, promo: promo2 })).filter(i => /^promo:/.test(i)), []);
check('stale: event reminders still go out', ids(due(sub(), cdNY, { firstSeen: {}, fresh: false })).some(i => /november-communityday/.test(i)), true);
check('first run happens even when the pipeline looks stale (seed only)', (() => { const s = {}; updateFirstSeen(s, promo, false, now); return s.seeded === true && Object.values(s.firstSeen).every(v => v === 0); })(), true);
check('a code that left the list is forgotten', (() => { const s = { seeded: true, firstSeen: { GONECODE0001: 5, FAKEVERIFIED1: 0 } }; updateFirstSeen(s, promo, true, now); return Object.keys(s.firstSeen).sort(); })(), ['FAKEEXPIRED1', 'FAKETIMEDRES1', 'FAKEUNVERIFD1', 'FAKEVERIFIED1']);

// ---- Mega timers: the person's own time, fixed labels, mega toggle -------------------------------------------------------------------
const fire = iso('2026-11-19T10:00:00Z');
const ms = sub({ schedules: [{ id: fire + ':rest-over', fireAt: fire, label: 'rest-over' }, { id: '1:made-up', fireAt: fire, label: 'made-up' }] });
check('Mega timer: due at its time, not before; unknown label ignored', [ids(due(ms, fire - MIN)).filter(i => /^mega:/.test(i)), ids(due(ms, fire)).filter(i => /^mega:/.test(i))], [[], ['mega:' + fire + ':rest-over']]);
check('Mega timer: dropped six hours after its time', ids(due(ms, fire + 6 * HOUR + MIN)).some(i => /^mega:/.test(i)), false);
check('Mega timer: mega toggle off', ids(due({ ...ms, prefs: cleanPrefs({ mega: false }) }, fire)).some(i => /^mega:/.test(i)), false);

// ---- Prefs ---------------------------------------------------------------------------------------------------------------------------------
check('prefs: junk falls back to defaults', cleanPrefs({ promo: 'yes', types: ['community-day', 'nope', 7], extra: 1 }), { ...defaultPrefs(), types: ['community-day'] });
check('prefs: defaults match the owner decision', defaultPrefs().types, ['community-day', 'raid-hour', 'pokemon-spotlight-hour', 'pokemon-go-tour', 'max-battles']);
check('prefs: null', cleanPrefs(null), defaultPrefs());

console.log(fail ? fail + ' of ' + n + ' checks failed' : 'ok: ' + n + ' trigger checks passed');
process.exit(fail ? 1 : 0);
