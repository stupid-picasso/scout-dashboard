#!/usr/bin/env node
// Push Worker (worker/src): crypto, HTTP endpoints and the cron tick, run in plain Node with an in-memory KV and a fake fetch. The fake fetch throws
// on any URL that was not registered, so nothing can reach a real push service, Cloudflare or anything else. Every key pair is generated at run time
// and never written to disk; the one fixed vector is the public example of RFC 8291 section 5 (fetched from rfc-editor.org), which holds throw-away keys.
// Run: node scripts/test_push_worker.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodeCrypto from 'node:crypto';
import { b64uEncode, b64uDecode, encryptPayload, vapidHeader, sendPush, allowedPushHost } from '../worker/src/webpush.js';
import worker, { handleRequest, runTick, subId, SUBREQUEST_LIMIT } from '../worker/src/index.js';
import { HOUR, MIN, MAX_SUBS, defaultPrefs } from '../worker/src/logic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = n => JSON.parse(fs.readFileSync(path.join(here, 'fixtures', n), 'utf8'));
const FEED = fx('push_feed.json'), PROMO = fx('push_promo.json'), MOVES = fx('push_moves.json');
let fail = 0, n = 0;
const check = (name, got, want) => { n++; const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { fail++; console.log('FAIL', name, '\n  got ', a, '\n  want', b); } };
const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder(), dec = new TextDecoder();

// ---- Recipients (a browser's side) -----------------------------------------------------------------------------------------------------
async function recipient(i) {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await subtle.exportKey('raw', kp.publicKey));
  const auth = nodeCrypto.randomBytes(16);
  return { endpoint: 'https://fcm.googleapis.com/fcm/send/QA' + i + '-' + b64uEncode(nodeCrypto.randomBytes(9)), keys: { p256dh: b64uEncode(pub), auth: b64uEncode(auth) }, priv: kp.privateKey, pub, auth };
}
// Independent decryptor (node:crypto's HKDF, not the Worker's code) for aes128gcm, RFC 8188 / 8291.
async function decrypt(body, r) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = Buffer.from(await subtle.deriveBits({ name: 'ECDH', public: asKey }, r.priv, 256));
  const hk = (s, ikm, info, len) => Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, s, info, len));
  const prk = hk(r.auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), Buffer.from(r.pub), Buffer.from(asPub)]), 32);
  const cek = hk(salt, prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16), nonce = hk(salt, prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(Buffer.from(ct.slice(ct.length - 16)));
  const plain = Buffer.concat([d.update(Buffer.from(ct.slice(0, ct.length - 16))), d.final()]);
  let end = plain.length - 1; while (end > 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('missing padding delimiter');
  return plain.slice(0, end).toString('utf8');
}

// ---- Crypto ----------------------------------------------------------------------------------------------------------------------------
// RFC 8291 section 5 / appendix A (public example values).
{
  const jwkOf = async (priv, pub) => { const p = b64uDecode(pub); return { kty: 'EC', crv: 'P-256', d: priv, x: b64uEncode(p.slice(1, 33)), y: b64uEncode(p.slice(33)), ext: true }; };
  const asPub = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const jwk = await jwkOf('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', asPub);
  const serverKeys = { privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']), publicKey: await subtle.importKey('jwk', { ...jwk, d: undefined }, { name: 'ECDH', namedCurve: 'P-256' }, true, []) };
  const body = await encryptPayload('When I grow up, I want to be a watermelon', 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', 'BTBZMqHH6r4Tts7J_aSIgg', { serverKeys, salt: b64uDecode('DGv6ra1nlYgDCS1FRnbzlw') });
  check('RFC 8291 section 5 example: the exact message body', b64uEncode(body), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
}
const rcp = await recipient(0);
{
  const text = JSON.stringify({ t: 'Community Day', b: 'Starts 2:00 PM é✓', tag: 'x', url: './' });
  const body = await encryptPayload(text, rcp.keys.p256dh, rcp.keys.auth);
  check('round trip with an independent decryptor', await decrypt(body, rcp), text);
  check('header: record size 4096, key id length 65', [new DataView(body.buffer, body.byteOffset).getUint32(16), body[20]], [4096, 65]);
  let big = ''; try { await encryptPayload('x'.repeat(4000), rcp.keys.p256dh, rcp.keys.auth); } catch (e) { big = e.message; }
  check('an oversize payload is refused', big, 'payload too large');
  let bad = ''; try { await encryptPayload('x', 'AAAA', rcp.keys.auth); } catch (e) { bad = e.message; }
  check('bad subscription keys are refused', bad, 'bad subscription keys');
}

// VAPID: keys in the format `web-push generate-vapid-keys` prints (65-byte public point, 32-byte private scalar, base64url), made here at run time.
const sk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const sjwk = await subtle.exportKey('jwk', sk.privateKey);
const VAPID_PUBLIC = b64uEncode(Buffer.concat([Buffer.from([4]), b64uDecode(sjwk.x), b64uDecode(sjwk.y)])), VAPID_PRIVATE = sjwk.d;
const vapid = { publicKey: VAPID_PUBLIC, privateKey: VAPID_PRIVATE, subject: 'mailto:owner@example.invalid' };
{
  const NOW = Date.parse('2026-11-18T12:00:00Z');
  const cache = new Map();
  const h = await vapidHeader(rcp.endpoint, vapid, NOW, cache);
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(h);
  check('VAPID header shape', !!m, true);
  const claims = JSON.parse(dec.decode(b64uDecode(m[2]))), head = JSON.parse(dec.decode(b64uDecode(m[1])));
  const ok = await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, sk.publicKey, b64uDecode(m[3]), enc.encode(m[1] + '.' + m[2]));
  check('VAPID JWT signature verifies against the public key (raw r||s, 64 bytes)', [ok, b64uDecode(m[3]).length, head, m[4] === VAPID_PUBLIC], [true, 64, { typ: 'JWT', alg: 'ES256' }, true]);
  check('VAPID claims: audience is the push service origin, expiry within 24 h, subject set', [claims.aud, claims.exp - NOW / 1000 <= 86400 && claims.exp > NOW / 1000, claims.sub], ['https://fcm.googleapis.com', true, vapid.subject]);
  check('one signature per push-service origin per tick (cached)', (await vapidHeader('https://fcm.googleapis.com/fcm/send/other', vapid, NOW, cache)) === h, true);
  const wrongPub = b64uEncode(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 1)]));
  let ek = ''; try { await vapidHeader(rcp.endpoint, { ...vapid, publicKey: wrongPub }, NOW); } catch (e) { ek = 'threw'; }
  check('a public key that does not match the private scalar is refused (import fails)', ek, 'threw');
}
check('push host allow-list', [
  'https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QWxs', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x',
  'http://fcm.googleapis.com/x', 'https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x', 'https://127.0.0.1/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'not a url', 'https://push.apple.com.evil.example/'
].map(allowedPushHost), [true, true, true, true, false, false, false, false, false, false, false, false]);

// ---- Fakes -----------------------------------------------------------------------------------------------------------------------------
const ORIGIN = 'https://app.example.test', BASE = 'https://data.example.test/data/';
function fakeKv() {
  const m = new Map(), c = { get: 0, put: 0 };
  return { m, c, async get(k, t) { c.get++; const v = m.get(k); return v === undefined ? null : (t === 'json' ? JSON.parse(v) : v); }, async put(k, v) { c.put++; m.set(k, String(v)); } };
}
function world(over) {
  const w = { now: Date.parse('2026-11-18T12:00:00Z'), files: { 'promo_codes.json': PROMO, 'feed.json': FEED, 'event_moves.json': MOVES, 'feed_check.json': { checkedAt: '2026-11-18T07:35:19Z', status: 'ok' } }, push: new Map(), pushStatus: {}, calls: [], pushed: [], kv: fakeKv(), ...over };
  w.fetch = async (url, init) => {
    w.calls.push(url);
    if (url.startsWith(BASE)) { const f = url.slice(BASE.length); if (!(f in w.files) || w.files[f] === null) return new Response('no', { status: 404 }); if (w.files[f] === 'THROW') throw new Error('network'); return new Response(JSON.stringify(w.files[f]), { status: 200 }); }
    const r = w.push.get(url);
    if (!r) throw new Error('unregistered URL: ' + url);                           // nothing outside the fakes can be reached
    const st = w.pushStatus[url] !== undefined ? w.pushStatus[url] : (w.pushStatus['*'] || 201);
    if (st === 'THROW') throw new Error('network');
    const payload = await decrypt(new Uint8Array(await new Response(init.body).arrayBuffer()), r);
    w.pushed.push({ url, payload: JSON.parse(payload), headers: init.headers, status: st });
    return new Response(null, { status: st, headers: st === 429 ? { 'Retry-After': '120' } : {} });
  };
  w.env = { PUSH: w.kv, ALLOWED_ORIGIN: ORIGIN, DATA_BASE: BASE, VAPID_PUBLIC_KEY: VAPID_PUBLIC, VAPID_PRIVATE_KEY: VAPID_PRIVATE, VAPID_SUBJECT: vapid.subject };
  w.deps = { now: () => w.now, fetch: w.fetch };
  w.req = (p, body, o = {}) => {
    const headers = { 'CF-Connecting-IP': o.ip || '203.0.113.1' }, origin = o.origin === undefined ? ORIGIN : o.origin, m = o.method || 'POST';
    if (origin) headers.Origin = origin;
    return handleRequest(new Request('https://worker.example.test' + p, { method: m, headers, body: m === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined }), w.env, w.deps);
  };
  w.addSub = async (r, extra = {}) => { const idx = JSON.parse(w.kv.m.get('index') || '{"subs":{}}'); idx.subs[await subId(r.endpoint)] = { endpoint: r.endpoint, keys: r.keys, prefs: defaultPrefs(), tz: 'UTC', schedules: [], createdAt: Date.parse('2026-11-01T00:00:00Z'), seenAt: Date.parse('2026-11-17T00:00:00Z'), ...extra }; w.kv.m.set('index', JSON.stringify(idx)); w.push.set(r.endpoint, r); };
  w.index = () => JSON.parse(w.kv.m.get('index') || '{"subs":{}}');
  w.state = () => JSON.parse(w.kv.m.get('state') || 'null');
  return w;
}
const tick = w => runTick(w.env, w.deps);
const CD13 = Date.parse('2026-11-21T13:00:00Z');   // Community Day 14:00 in UTC minus the 60 minute lead

// ---- HTTP endpoints ---------------------------------------------------------------------------------------------------------------------
{
  const w = world(), r = await recipient(1); w.push.set(r.endpoint, r);
  const good = { subscription: { endpoint: r.endpoint, keys: r.keys }, prefs: { events: false }, tz: 'Europe/Paris' };
  check('OPTIONS preflight from the page origin', await w.req('/subscribe', '', { method: 'OPTIONS' }).then(x => [x.status, x.headers.get('Access-Control-Allow-Origin'), x.headers.get('Access-Control-Allow-Methods')]), [204, ORIGIN, 'POST, OPTIONS']);
  check('OPTIONS from another origin is refused', (await w.req('/subscribe', '', { method: 'OPTIONS', origin: 'https://evil.example' })).status, 403);
  check('POST from another origin is refused and writes nothing', [(await w.req('/subscribe', good, { origin: 'https://evil.example' })).status, w.kv.c.put], [403, 0]);
  check('POST without an Origin header is refused', (await w.req('/subscribe', good, { origin: '' })).status, 403);
  check('GET and unknown paths are 404', [(await w.req('/subscribe', '', { method: 'GET' })).status, (await w.req('/nope', {})).status], [404, 404]);
  check('bad JSON is 400', (await w.req('/subscribe', '{nope')).status, 400);
  check('oversize body is 413', (await w.req('/subscribe', { pad: 'x'.repeat(5000) })).status, 413);
  check('endpoint on an unknown host is 400', (await w.req('/subscribe', { ...good, subscription: { endpoint: 'https://evil.example/x', keys: r.keys } })).status, 400);
  check('bad keys are 400', (await w.req('/subscribe', { ...good, subscription: { endpoint: r.endpoint, keys: { p256dh: 'AAAA', auth: r.keys.auth } } })).status, 400);
  check('missing keys are 400, not a crash', (await w.req('/subscribe', { ...good, subscription: { endpoint: r.endpoint } })).status, 400);
  check('bad time zone is 400', (await w.req('/subscribe', { ...good, tz: 'Mars/Base' })).status, 400);
  const ok = await w.req('/subscribe', good);
  const idx = w.index(), id = await subId(r.endpoint);
  check('subscribe stores a sanitised record', [ok.status, ok.headers.get('Access-Control-Allow-Origin'), Object.keys(idx.subs).length, idx.subs[id].tz, idx.subs[id].prefs.events, idx.subs[id].prefs.promo, idx.subs[id].createdAt], [200, ORIGIN, 1, 'Europe/Paris', false, true, w.now]);
  check('nothing that identifies the person is stored: no IP address in KV', [...w.kv.m.values()].some(v => v.includes('203.0.113.1')), false);
  const puts = w.kv.c.put; await w.req('/subscribe', good);
  check('an unchanged re-subscribe does not rewrite the list', w.kv.c.put, puts);
  w.now += 8 * 24 * HOUR; await w.req('/subscribe', good);
  check('...but it is refreshed after a week (keeps the 90 day clock honest)', [w.kv.c.put, w.index().subs[id].seenAt, w.index().subs[id].createdAt], [puts + 1, w.now, Date.parse('2026-11-18T12:00:00Z')]);
  w.now = Date.parse('2026-11-18T12:00:00Z');

  // /test sends only to a stored subscription
  const stranger = await recipient(2); w.push.set(stranger.endpoint, stranger);
  const before = w.pushed.length;
  check('/test for an endpoint that was never subscribed is 404 and sends nothing', [(await w.req('/test', { endpoint: stranger.endpoint })).status, w.pushed.length], [404, before]);
  const t1 = await w.req('/test', { endpoint: r.endpoint }); const tj = await t1.json();
  check('/test sends one push to the stored subscription', [t1.status, tj.ok, w.pushed.length - before, w.pushed.at(-1).payload.t, w.pushed.at(-1).headers.TTL], [200, true, 1, 'Test alert', '300']);
  check('/test is limited to once a minute', (await w.req('/test', { endpoint: r.endpoint })).status, 429);
  w.now += 61000; w.pushStatus[r.endpoint] = 410;
  const t3 = await (await w.req('/test', { endpoint: r.endpoint })).json();
  check('/test on a dead subscription (410) removes it', [t3.gone, Object.keys(w.index().subs).length], [true, 0]);

  // /schedule: fixed labels, future only, at most 5
  await w.req('/subscribe', good); const at = w.now + 3 * HOUR;
  check('schedule: unknown label, past time and far future are 400', [(await w.req('/schedule', { endpoint: r.endpoint, fireAt: at, label: 'free text' })).status, (await w.req('/schedule', { endpoint: r.endpoint, fireAt: w.now - 1, label: 'rest-over' })).status, (await w.req('/schedule', { endpoint: r.endpoint, fireAt: w.now + 40 * 24 * HOUR, label: 'rest-over' })).status], [400, 400, 400]);
  check('schedule: not subscribed is 404', (await w.req('/schedule', { endpoint: stranger.endpoint, fireAt: at, label: 'rest-over' })).status, 404);
  const codes = []; for (let i = 0; i < 7; i++) codes.push((await w.req('/schedule', { endpoint: r.endpoint, fireAt: at + i * HOUR, label: 'rest-over' })).status);
  check('schedule: five pending, the sixth is refused; the same timer twice counts once', [codes, (await w.req('/schedule', { endpoint: r.endpoint, fireAt: at, label: 'rest-over' })).status, w.index().subs[id].schedules.length], [[200, 200, 200, 200, 200, 429, 429], 200, 5]);
  check('unsubscribe removes the record; unknown endpoints answer the same', [(await w.req('/unsubscribe', { endpoint: r.endpoint })).status, Object.keys(w.index().subs).length, (await w.req('/unsubscribe', { endpoint: r.endpoint })).status], [200, 0, 200]);
  const lim = []; for (let i = 0; i < 70; i++) lim.push((await w.req('/unsubscribe', { endpoint: r.endpoint }, { ip: '198.51.100.9' })).status);
  check('per-IP limit answers 429 after 60 requests (memory only)', [lim[59], lim[60]], [200, 429]);
}

// Enrolment cap
{
  const w = world(); const r = await recipient(3);
  const idx = { subs: {} }; for (let i = 0; i < MAX_SUBS; i++) idx.subs['s' + i] = { endpoint: 'https://fcm.googleapis.com/fcm/send/' + i, keys: r.keys, prefs: defaultPrefs(), tz: 'UTC', schedules: [], createdAt: 1, seenAt: w.now };
  w.kv.m.set('index', JSON.stringify(idx));
  const full = await w.req('/subscribe', { subscription: { endpoint: r.endpoint, keys: r.keys }, tz: 'UTC' });
  check('enrolment cap: the 301st subscriber is refused', [full.status, Object.keys(w.index().subs).length], [503, 300]);
  const r2 = await recipient(4), cur = w.index(); cur.subs[await subId(r2.endpoint)] = cur.subs.s0; delete cur.subs.s0; w.kv.m.set('index', JSON.stringify(cur));
  const existing = await w.req('/subscribe', { subscription: { endpoint: r2.endpoint, keys: r2.keys }, tz: 'UTC', prefs: { mega: false } });
  check('...while an existing subscriber can still change settings', [existing.status, w.index().subs[await subId(r2.endpoint)].prefs.mega], [200, false]);
}

// ---- The cron tick ----------------------------------------------------------------------------------------------------------------------
// First run seeds; a new code is announced once; unverified never; dedupe over ticks.
{
  const w = world(), r = await recipient(10); await w.addSub(r, { createdAt: w.now - 1000 });
  const t0 = await tick(w);
  check('first run: seeds the promo list and sends nothing', [t0.sent, w.pushed.length, w.state().seeded, Object.values(w.state().firstSeen).every(v => v === 0)], [0, 0, true, true]);
  const promo2 = { ...PROMO, codes: PROMO.codes.concat([{ code: 'FAKENEWCODE01', name: 'Fake new item', rewards: [], expires: null, expired: false, verified: true, kind: 'standard' }, { code: 'FAKENEWUNVER1', name: 'x', rewards: [], expires: null, expired: false, verified: false, kind: 'standard' }, { code: 'FAKENEWTR0001', name: 'Fake research', rewards: ['Timed Research'], expires: null, expired: false, verified: true, kind: 'timed_research' }]) };
  w.files['promo_codes.json'] = promo2; w.now += 15 * MIN;
  const t1 = await tick(w);
  check('a new verified code and a new timed-research code are sent; the unverified one is not', [t1.sent, w.pushed.map(p => p.payload.t + ' | ' + p.payload.b).sort()], [2, ['New Timed Research code | Fake research: FAKENEWTR0001', 'New promo code | Fake new item: FAKENEWCODE01']]);
  check('payload carries the dedupe tag and a same-origin url', w.pushed.map(p => [p.payload.tag, p.payload.url]).sort(), [['promo:FAKENEWCODE01', './'], ['promo:FAKENEWTR0001', './']]);
  check('push headers: aes128gcm, TTL 86400 for promo, vapid auth', [w.pushed[0].headers['Content-Encoding'], w.pushed[0].headers.TTL, /^vapid t=/.test(w.pushed[0].headers.Authorization)], ['aes128gcm', '86400', true]);
  const before = w.pushed.length; w.now += 15 * MIN; await tick(w);
  check('dedupe: the next tick sends nothing again', w.pushed.length, before);
  // a restart of the Worker (state is only in KV) does not repeat either
  w.now += 15 * MIN; await runTick(w.env, w.deps);
  check('dedupe survives in KV across ticks', w.pushed.length, before);
}
// Stale pipeline heartbeat
{
  const w = world({ files: undefined }); w.files = { 'promo_codes.json': PROMO, 'feed.json': FEED, 'event_moves.json': MOVES, 'feed_check.json': { checkedAt: '2026-11-14T07:35:19Z' } };
  const r = await recipient(11); await w.addSub(r, { createdAt: w.now - 1000 }); await tick(w);
  const promo2 = { ...PROMO, codes: PROMO.codes.concat([{ code: 'FAKENEWCODE01', name: 'Fake new item', rewards: [], expires: null, expired: false, verified: true, kind: 'standard' }]) };
  w.files['promo_codes.json'] = promo2; w.now += 15 * MIN; const t = await tick(w);
  check('stale heartbeat (4 days): no new-code push, fresh=false', [t.fresh, w.pushed.length], [false, 0]);
  w.now = CD13; await tick(w);
  check('stale heartbeat: an event reminder still goes out', w.pushed.some(p => p.payload.tag === 'evt:november-communityday2026:start'), true);
  w.files['feed_check.json'] = { checkedAt: new Date(w.now).toISOString() }; w.now += 15 * MIN; await tick(w);
  check('pipeline recovers: the code is recorded now and announced then', w.pushed.some(p => p.payload.tag === 'promo:FAKENEWCODE01'), true);
}
// Time zones through the tick (feed times are local wall-clock)
{
  const w = world(), a = await recipient(12), b = await recipient(13);
  await w.addSub(a, { tz: 'UTC' }); await w.addSub(b, { tz: 'Asia/Tokyo' });
  w.now = CD13; await tick(w);   // 13:00Z: lead opens for UTC, not for Tokyo (14:00 JST is 05:00Z)
  check('only the UTC subscriber gets the Community Day alert at 13:00Z', w.pushed.filter(p => p.payload.tag === 'evt:november-communityday2026:start').map(p => p.url), [a.endpoint]);
  check('the body says the start time in that subscriber\'s clock', w.pushed.find(p => p.url === a.endpoint && /^evt:november-communityday2026:start/.test(p.payload.tag)).payload.b, 'Starts 2:00 PM');
}
// 404/410 clean up; 429 backs off; thrown fetch and bad subscribers do not abort the tick
{
  const w = world(), good = await recipient(14), gone = await recipient(15), gone2 = await recipient(16), slow = await recipient(17);
  for (const r of [good, gone, gone2, slow]) await w.addSub(r);
  w.pushStatus[gone.endpoint] = 410; w.pushStatus[gone2.endpoint] = 404;
  const idx0 = w.index(); idx0.subs.broken = { endpoint: 'not a url', keys: good.keys, prefs: defaultPrefs(), tz: 'UTC', schedules: [], createdAt: 1, seenAt: w.now }; w.kv.m.set('index', JSON.stringify(idx0));
  w.now = CD13; const t = await tick(w);
  check('410 and 404 delete the subscription (list and state); the others are served; a broken record does not abort the tick', [t.dead, Object.keys(w.index().subs).length, w.pushed.filter(p => p.status < 300 && /^evt:november-communityday2026:start/.test(p.payload.tag)).map(p => p.url).sort(), Object.keys(w.state().sent).includes(await subId(gone.endpoint))], [2, 3, [good.endpoint, slow.endpoint].sort(), false]);
  // 429: stop sending to that push service for the rest of the tick, keep the item for next time
  const w2 = world(), s1 = await recipient(18), s2 = await recipient(19);
  await w2.addSub(s1); await w2.addSub(s2); w2.pushStatus['*'] = 429; w2.now = CD13; const t2 = await tick(w2);
  check('429: one attempt, then that push service is left alone for this tick; nothing is marked sent', [w2.pushed.length, t2.failed >= 1, Object.keys(w2.state().sent[await subId(s1.endpoint)] || {}).length], [1, true, 0]);
  w2.pushStatus['*'] = 201; w2.now += 15 * MIN; await tick(w2);
  check('the next tick retries and succeeds (item still in its window)', w2.pushed.filter(p => p.status < 300 && /^evt:november-communityday2026:start/.test(p.payload.tag)).length, 2);
  // network error on push, and on data files
  const w3 = world(), s3 = await recipient(20); await w3.addSub(s3); w3.pushStatus['*'] = 'THROW'; w3.now = CD13; const t3 = await tick(w3);
  check('a thrown push fetch is a failure, not a crash; nothing marked sent', [t3.failed >= 1, t3.sent, Object.keys(w3.state().sent[await subId(s3.endpoint)] || {}).length], [true, 0, 0]);
  const w4 = world(), s4 = await recipient(21); await w4.addSub(s4); w4.files['feed.json'] = 'THROW'; w4.files['promo_codes.json'] = null; w4.now = CD13;
  const t4 = await tick(w4);
  check('data files that fail to load do not break the tick (no feed: nothing due)', [t4.sent, w4.pushed.length], [0, 0]);
}
// Retention
{
  const w = world(), old = await recipient(22), live = await recipient(23);
  await w.addSub(old, { createdAt: w.now - 91 * 24 * HOUR, seenAt: w.now - 91 * 24 * HOUR }); await w.addSub(live, { createdAt: w.now - 91 * 24 * HOUR, seenAt: w.now - 2 * 24 * HOUR });
  const t = await tick(w);
  check('90 day retention: idle subscriber deleted, recently seen one kept', [t.dead, Object.keys(w.index().subs).length, w.index().subs[await subId(live.endpoint)] !== undefined], [1, 1, true]);
}
// Mega timer: sent once at its time, then dropped from the list
{
  const w = world(), r = await recipient(24); const fire = w.now + 2 * HOUR;
  await w.addSub(r, { schedules: [{ id: fire + ':rest-over', fireAt: fire, label: 'rest-over' }] });
  await tick(w); check('Mega timer: nothing before its time', w.pushed.length, 0);
  w.now = fire + MIN; await tick(w);
  check('Mega timer: sent at its time with the fixed text', w.pushed.map(p => [p.payload.t, p.payload.b]), [['Mega rest finished', 'A Mega Evolution can be used again.']]);
  check('Mega timer: dropped from the subscriber after it fired', w.index().subs[await subId(r.endpoint)].schedules, []);
  w.now += 15 * MIN; await tick(w); check('Mega timer: not sent twice', w.pushed.length, 1);
}
// Budget: 300 subscribers all due at once. Every fetch and KV call counts.
{
  const w = world(), recs = []; for (let i = 0; i < 300; i++) recs.push(await recipient(100 + i));
  const idx = { subs: {} }; for (const r of recs) { idx.subs[await subId(r.endpoint)] = { endpoint: r.endpoint, keys: r.keys, prefs: defaultPrefs(), tz: 'UTC', schedules: [], createdAt: Date.parse('2026-11-01T00:00:00Z'), seenAt: Date.parse('2026-11-17T00:00:00Z') }; w.push.set(r.endpoint, r); }
  w.kv.m.set('index', JSON.stringify(idx)); w.now = CD13;
  const per = [], served = new Map();
  for (let k = 0; k < 4; k++) {   // ticks at 13:00, 13:15, 13:30, 13:45; the event starts at 14:00
    const f0 = w.calls.length, kv0 = w.kv.c.get + w.kv.c.put, p0 = w.pushed.length;
    const t = await tick(w);
    const used = (w.calls.length - f0) + (w.kv.c.get + w.kv.c.put - kv0);
    per.push({ used, sends: w.pushed.length - p0, reported: t.used });
    w.pushed.slice(p0).filter(p => /^evt:november-communityday2026:start/.test(p.payload.tag)).forEach(p => served.set(p.url, (served.get(p.url) || 0) + 1));
    w.now += 15 * MIN;
  }
  check('budget: every tick stays within 50 subrequests (fetches + KV calls), the tick\'s own count agrees', per.every(p => p.used <= SUBREQUEST_LIMIT && p.reported === p.used), true);
  check('budget: a tick sends at most 40 pushes', per.every(p => p.sends <= 40 && p.sends >= 30), true);
  check('rotation: nobody is served twice, so the cursor moves on (no subscriber starves behind the first)', [[...served.values()].every(c => c === 1), served.size >= 120], [true, true]);
  console.log('  info: 300 subscribers due at once: ' + per.map(p => p.sends + ' sends/' + p.used + ' calls').join(', ') + '; ' + served.size + ' reached before the 60 minute lead ran out');
  // keep ticking past the lead: nobody is served after the event started
  const late = w.pushed.length; w.now = Date.parse('2026-11-21T14:05:00Z'); await tick(w);
  check('after the event has started, the start alert is no longer sent', w.pushed.slice(late).filter(p => /^evt:november-communityday2026:start/.test(p.payload.tag)).length, 0);
}
// scheduled() wiring
{
  const w = world(); let waited = null; await worker.scheduled({}, w.env, { waitUntil: p => { waited = p; } });
  check('scheduled() hands the tick to waitUntil', typeof waited?.then, 'function');
}

console.log(fail ? fail + ' of ' + n + ' checks failed' : 'ok: ' + n + ' worker checks passed');
process.exit(fail ? 1 : 0);
