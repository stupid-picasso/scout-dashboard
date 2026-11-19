// Subscriber storage for the push Worker: one KV key per subscriber, `sub:<id>` (id = hash of the endpoint). The value is the whole record
// { endpoint, keys, prefs, tz, schedules, createdAt, seenAt } and is what the HTTP side reads. The same key also carries a compact copy of that
// record as KV *metadata* (written by the same put), so the cron learns every subscriber from ONE list call instead of one read each: the cron
// has only 50 subrequests per run, a read per subscriber would cut its sends to about half.
//
// Why one key each: a request changes only its own subscriber's key, so two requests for different subscribers can never overwrite each other
// (the old single `index` key was read, changed and written back whole). The only remaining read-modify-write is on one subscriber's own key
// (/schedule, a changed /subscribe, the cron pruning a finished timer); those come from one device and are rare. KV has no compare-and-set,
// so they are not made atomic.
//
// KV metadata is limited to 1024 bytes of JSON. toMeta() packs the record (prefs as bit masks, timers as [fireAt, label index]) and the worst
// record the Worker accepts (512 byte endpoint, every event type, five timers, the longest zone) is under 900 bytes; it throws above META_MAX
// instead of storing a truncated copy.
import { cleanPrefs, EVENT_TYPES, MEGA_LABELS } from './logic.js';

export const SUB_PREFIX = 'sub:';
export const META_MAX = 1000;
const FLAGS = ['promo', 'timedResearch', 'events', 'mega', 'ending'];
const LABELS = Object.keys(MEGA_LABELS);
const enc = new TextEncoder();

export const subKey = id => SUB_PREFIX + id;
export const idOfKey = key => key.slice(SUB_PREFIX.length);
export const byteLen = s => enc.encode(String(s)).length;

export function toMeta(rec) {
  const p = cleanPrefs(rec.prefs);
  let f = 0, t = 0;
  FLAGS.forEach((k, i) => { if (p[k]) f |= 1 << i; });
  EVENT_TYPES.forEach((k, i) => { if (p.types.indexOf(k) >= 0) t |= 1 << i; });
  const m = { e: rec.endpoint, k: rec.keys.p256dh, a: rec.keys.auth, f, t, z: rec.tz, c: rec.createdAt, s: rec.seenAt, m: (rec.schedules || []).map(x => [x.fireAt, LABELS.indexOf(x.label)]) };
  if (byteLen(JSON.stringify(m)) > META_MAX) throw new Error('metadata too large');
  return m;
}

// Back from the compact copy to a record; null for a copy that is missing or malformed (the caller skips that subscriber).
export function fromMeta(m) {
  if (!m || typeof m !== 'object' || typeof m.e !== 'string' || !Array.isArray(m.m)) return null;
  const prefs = {}; FLAGS.forEach((k, i) => { prefs[k] = !!(m.f & (1 << i)); });
  prefs.types = EVENT_TYPES.filter((k, i) => m.t & (1 << i));
  return { endpoint: m.e, keys: { p256dh: m.k, auth: m.a }, prefs, tz: m.z, schedules: m.m.filter(x => LABELS[x[1]]).map(x => ({ id: x[0] + ':' + LABELS[x[1]], fireAt: x[0], label: LABELS[x[1]] })), createdAt: m.c, seenAt: m.s };
}

export const getSub = (env, id) => env.PUSH.get(subKey(id), 'json');
export const putSub = (env, id, rec) => env.PUSH.put(subKey(id), JSON.stringify(rec), { metadata: toMeta(rec) });
export const delSub = (env, id) => env.PUSH.delete(subKey(id));

// How many subscribers exist, stopping as soon as `stopAt` is reached. One list call for up to 1,000 keys. Two sign-ups racing at the cap can
// both see room and both be stored (the cap can be exceeded by the number of requests in flight at that moment); that is accepted, since it
// cannot be made exact without a lock and a few extra subscribers over 300 do no harm.
export async function countSubs(env, stopAt) {
  let n = 0, cursor;
  for (let page = 0; page < 10; page++) {
    const r = await env.PUSH.list({ prefix: SUB_PREFIX, cursor });
    n += r.keys.length;
    if (n >= stopAt || r.list_complete) return n;
    cursor = r.cursor;
  }
  return n;
}
