// Push-alert Worker: a fetch handler for the app (/subscribe /unsubscribe /schedule /test) and a cron handler (every 15 minutes) that reads the
// public data files, works out what is due for each subscriber and sends Web Push. Everything is injectable (`deps`) so the tests run it in
// plain Node with a fake KV and a fake fetch; nothing here ever contacts a service unless deployed.
//
// Stored in KV (binding PUSH), nothing else: `index` { subs: { <id>: { endpoint, keys, prefs, tz, schedules, createdAt, seenAt } } } and
// `state` { seeded, firstSeen, sent, lastOk, cursor }. The id is a hash of the endpoint. No account id, no roster, no IP address.
import { sendPush, allowedPushHost, b64uDecode } from './webpush.js';
import { buildItems, dueFor, cleanPrefs, validTz, updateFirstSeen, pipelineFresh, MAX_SUBS, MAX_SCHEDULES, MEGA_LABELS, HOUR } from './logic.js';

export const SUBREQUEST_LIMIT = 50;          // Workers Free: subrequests per invocation. Every fetch and every KV call is counted against it, to be safe.
const RESERVE = 4;                           // kept back for: index re-read, index write, state write, one spare
const MAX_BODY = 4096;
const RETENTION_MS = 90 * 24 * HOUR;         // no successful send, no sync and no sign-up for 90 days: deleted
const SENT_KEEP_MS = 14 * 24 * HOUR;
const SENT_CAP = 60;
const FILES = ['promo_codes.json', 'feed.json', 'event_moves.json', 'feed_check.json'];
const defaultDeps = { now: () => Date.now(), fetch: (...a) => fetch(...a) };

const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...(headers || {}) } });

export async function subId(endpoint) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return Array.from(d.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const vapidOf = env => ({ publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT });
const loadIndex = async env => { const i = await env.PUSH.get('index', 'json'); return i && i.subs ? i : { subs: {} }; };

// ---- HTTP side -----------------------------------------------------------------------------------------------------------------
// Per-IP limiter: in this isolate's memory only (best effort, resets on restart). No address is ever written to KV or logged.
const hits = new Map();
function limited(ip, now) {
  if (hits.size > 5000) hits.clear();
  const h = hits.get(ip);
  if (!h || now - h.t > 10 * 60000) { hits.set(ip, { t: now, n: 1 }); return false; }
  return ++h.n > 60;
}
const lastTest = new Map();

export async function handleRequest(req, env, deps = defaultDeps) {
  const now = deps.now(), origin = req.headers.get('Origin'), ok = !!origin && origin === env.ALLOWED_ORIGIN;
  const cors = ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' } : {};
  if (req.method === 'OPTIONS') return new Response(null, { status: ok ? 204 : 403, headers: cors });
  const path = new URL(req.url).pathname;
  if (req.method !== 'POST' || ['/subscribe', '/unsubscribe', '/schedule', '/test'].indexOf(path) < 0) return json(404, { error: 'not found' }, cors);
  if (!ok) return json(403, { error: 'origin not allowed' });
  if (limited(req.headers.get('CF-Connecting-IP') || '-', now)) return json(429, { error: 'slow down' }, cors);
  if (Number(req.headers.get('Content-Length')) > MAX_BODY) return json(413, { error: 'too large' }, cors);
  const text = await req.text();
  if (text.length > MAX_BODY) return json(413, { error: 'too large' }, cors);
  let body; try { body = JSON.parse(text); } catch (e) { return json(400, { error: 'bad json' }, cors); }
  if (!body || typeof body !== 'object') return json(400, { error: 'bad body' }, cors);
  try {
    if (path === '/subscribe') return await subscribe(body, env, now, cors);
    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || endpoint.length > 512) return json(400, { error: 'bad endpoint' }, cors);
    const id = await subId(endpoint), idx = await loadIndex(env), sub = idx.subs[id];
    if (path === '/unsubscribe') { if (sub) { delete idx.subs[id]; await env.PUSH.put('index', JSON.stringify(idx)); } return json(200, { ok: true }, cors); }   // same answer either way
    if (!sub) return json(404, { error: 'not subscribed' }, cors);
    if (path === '/schedule') return await schedule(body, idx, id, env, now, cors);
    return await testPush(sub, id, idx, env, deps, now, cors);
  } catch (e) { return json(500, { error: 'server error' }, cors); }
}

async function subscribe(body, env, now, cors) {
  const s = body.subscription, ep = s && s.endpoint, keys = s && s.keys;
  if (typeof ep !== 'string' || ep.length > 512 || !allowedPushHost(ep)) return json(400, { error: 'bad endpoint' }, cors);
  try {
    const p = b64uDecode(keys.p256dh), a = b64uDecode(keys.auth);
    if (p.length !== 65 || p[0] !== 4 || a.length !== 16) throw new Error('keys');
  } catch (e) { return json(400, { error: 'bad keys' }, cors); }
  if (!validTz(body.tz)) return json(400, { error: 'bad time zone' }, cors);
  const id = await subId(ep), idx = await loadIndex(env), old = idx.subs[id];
  if (!old && Object.keys(idx.subs).length >= MAX_SUBS) return json(503, { error: 'full' }, cors);
  const rec = { endpoint: ep, keys: { p256dh: keys.p256dh, auth: keys.auth }, prefs: cleanPrefs(body.prefs), tz: body.tz, schedules: old ? old.schedules : [], createdAt: old ? old.createdAt : now, seenAt: now };
  // An unchanged record is rewritten only about once a week (KV allows 1,000 writes a day on the free plan).
  if (old && now - (old.seenAt || 0) < 7 * 24 * HOUR && JSON.stringify({ ...rec, seenAt: 0 }) === JSON.stringify({ ...old, seenAt: 0 })) return json(200, { ok: true }, cors);
  idx.subs[id] = rec;
  await env.PUSH.put('index', JSON.stringify(idx));
  return json(200, { ok: true }, cors);
}

async function schedule(body, idx, id, env, now, cors) {
  if (!MEGA_LABELS[body.label]) return json(400, { error: 'bad label' }, cors);
  const at = body.fireAt;
  if (!Number.isInteger(at) || at <= now || at > now + 30 * 24 * HOUR) return json(400, { error: 'bad time' }, cors);
  const sub = idx.subs[id], sid = at + ':' + body.label;
  sub.schedules = (sub.schedules || []).filter(x => x.fireAt + 6 * HOUR > now);
  if (!sub.schedules.some(x => x.id === sid)) {
    if (sub.schedules.length >= MAX_SCHEDULES) return json(429, { error: 'too many timers' }, cors);
    sub.schedules.push({ id: sid, fireAt: at, label: body.label });
  }
  await env.PUSH.put('index', JSON.stringify(idx));
  return json(200, { ok: true, pending: sub.schedules.length }, cors);
}

// Sends one push to a subscription that is already stored (never to an address that arrives in this request).
async function testPush(sub, id, idx, env, deps, now, cors) {
  if (now - (lastTest.get(id) || 0) < 60000) return json(429, { error: 'wait a minute' }, cors);
  lastTest.set(id, now);
  const r = await sendPush(sub, { t: 'Test alert', b: 'Push alerts are working.', tag: 'test', url: './' }, { fetch: deps.fetch, vapid: vapidOf(env), now, ttl: 300 });
  if (r.status === 404 || r.status === 410) { delete idx.subs[id]; await env.PUSH.put('index', JSON.stringify(idx)); return json(200, { ok: false, gone: true }, cors); }
  return json(200, { ok: r.status >= 200 && r.status < 300, status: r.status }, cors);
}

// ---- Cron side -----------------------------------------------------------------------------------------------------------------
class Budget {
  constructor(max) { this.max = max; this.used = 0; }
  left() { return this.max - this.used; }
  take() { if (this.used >= this.max) throw new Error('subrequest budget spent'); this.used++; }
}

export async function runTick(env, deps = defaultDeps) {
  const now = deps.now(), b = new Budget(SUBREQUEST_LIMIT), vapid = vapidOf(env);
  const base = String(env.DATA_BASE || '').replace(/\/?$/, '/');
  const kvGet = async k => { b.take(); return env.PUSH.get(k, 'json'); };
  const kvPut = async (k, v) => { b.take(); return env.PUSH.put(k, JSON.stringify(v)); };
  const getData = async f => { try { b.take(); const r = await deps.fetch(base + f); return r && r.ok ? await r.json() : null; } catch (e) { return null; } };
  const out = { sent: 0, dead: 0, failed: 0, fresh: false, used: 0 };

  const [promo, feed, moves, check] = await Promise.all(FILES.map(getData));
  const index = await kvGet('index'), saved = await kvGet('state');
  const subs = (index && index.subs) || {};
  const state = { seeded: false, firstSeen: {}, sent: {}, lastOk: {}, cursor: 0, ...(saved || {}) };
  const before = JSON.stringify(state);
  out.fresh = pipelineFresh(check, now);
  updateFirstSeen(state, promo, out.fresh, now);

  const ids = Object.keys(subs), dead = new Set(), cleanup = {}, backoff = new Set(), memo = new Map(), jwtCache = new Map();
  const start = ids.length ? (state.cursor || 0) % ids.length : 0;
  let sendsLeft = b.left() - RESERVE, next = 0;
  for (let k = 0; k < ids.length; k++) {
    const pos = (start + k) % ids.length, id = ids[pos], sub = subs[id];
    if (sendsLeft <= 0) { next = pos; break; }
    try {
      if (now - Math.max(sub.createdAt || 0, sub.seenAt || 0, state.lastOk[id] || 0) > RETENTION_MS) { dead.add(id); continue; }
      const tz = validTz(sub.tz) ? sub.tz : 'UTC';
      if (!memo.has(tz)) memo.set(tz, buildItems({ promo, feed, moves }, tz, now, { firstSeen: state.firstSeen, fresh: out.fresh }));
      const sent = state.sent[id] = state.sent[id] || {};
      if ((sub.schedules || []).some(x => x.fireAt + 6 * HOUR < now)) cleanup[id] = true;
      const origin = new URL(sub.endpoint).origin;
      for (const it of dueFor(sub, memo.get(tz), now, sent)) {
        if (sendsLeft <= 0) break;
        if (backoff.has(origin)) break;
        b.take(); sendsLeft--;
        const r = await sendPush(sub, { t: it.title, b: it.body, tag: it.id, url: './' }, { fetch: deps.fetch, vapid, now, jwtCache, ttl: it.ttl });
        if (r.status >= 200 && r.status < 300) { sent[it.id] = now; state.lastOk[id] = now; out.sent++; if (it.cat === 'mega') cleanup[id] = true; }
        else if (r.status === 404 || r.status === 410) { dead.add(id); break; }                       // the push service says this subscription is gone
        else { out.failed++; if (r.status === 429) backoff.add(origin); break; }                       // retried next tick while the item is still in its window
      }
    } catch (e) { out.failed++; }
  }
  state.cursor = next;

  // Tidy the state: forget sends older than two weeks, cap the list, drop subscribers that no longer exist.
  Object.keys(state.sent).forEach(id => {
    if (!subs[id] || dead.has(id)) { delete state.sent[id]; return; }
    const keep = Object.entries(state.sent[id]).filter(([, t]) => now - t < SENT_KEEP_MS).sort((a, c) => c[1] - a[1]).slice(0, SENT_CAP);
    state.sent[id] = Object.fromEntries(keep);
  });
  Object.keys(state.lastOk).forEach(id => { if (!subs[id] || dead.has(id)) delete state.lastOk[id]; });

  // The subscriber list changes only for a dead subscription, a finished Mega timer or retention. Re-read it just before writing, so a sign-up
  // that arrived during this run is not lost.
  if (dead.size || Object.keys(cleanup).length) {
    try {
      const fresh = await kvGet('index');
      if (fresh && fresh.subs) {
        dead.forEach(id => { delete fresh.subs[id]; });
        Object.keys(cleanup).forEach(id => { const s = fresh.subs[id]; if (s) s.schedules = (s.schedules || []).filter(x => x.fireAt + 6 * HOUR >= now && !(state.sent[id] && state.sent[id]['mega:' + x.id])); });
        await kvPut('index', fresh);
      }
    } catch (e) { out.failed++; }
  }
  out.dead = dead.size;
  if (JSON.stringify(state) !== before) { try { await kvPut('state', state); } catch (e) { out.failed++; } }
  out.used = b.used;
  return out;
}

export default {
  fetch(req, env) { return handleRequest(req, env, defaultDeps); },
  scheduled(event, env, ctx) { ctx.waitUntil(runTick(env, defaultDeps)); }
};
