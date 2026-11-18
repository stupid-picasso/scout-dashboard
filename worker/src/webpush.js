// Web Push sender with Web Crypto only (no dependencies): VAPID (RFC 8292, ES256) and message encryption (RFC 8291, aes128gcm).
// Works in a Worker and in plain Node (the tests). No key is stored here: the private key arrives through the environment.

const enc = new TextEncoder();

export function b64uEncode(bytes) {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64uDecode(str) {
  if (typeof str !== 'string' || /[^A-Za-z0-9_-]/.test(str)) throw new Error('bad base64url');
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// ---- VAPID -------------------------------------------------------------------------------------------------------------------
// The keys are the pair `npx web-push generate-vapid-keys` prints: the public key is the 65-byte uncompressed point and the private key
// the 32-byte scalar, both base64url. Web Crypto cannot import a raw private scalar, so a JWK is built from the scalar and the point.
const signKeys = new Map();
async function signingKey(publicKey, privateKey) {
  const id = publicKey + '|' + privateKey;
  if (signKeys.has(id)) return signKeys.get(id);
  const pub = b64uDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed point');
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33)), ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  signKeys.set(id, key);
  return key;
}

// Authorization header for one push service. `cache` (a Map) lets one tick sign once per push-service origin.
export async function vapidHeader(endpoint, vapid, nowMs, cache) {
  const aud = new URL(endpoint).origin;
  let jwt = cache && cache.get(aud);
  if (!jwt) {
    const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const claims = b64uEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(nowMs / 1000) + 12 * 3600, sub: vapid.subject })));
    const key = await signingKey(vapid.publicKey, vapid.privateKey);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + claims)));   // raw r||s, as ES256 wants
    jwt = head + '.' + claims + '.' + b64uEncode(sig);
    if (cache) cache.set(aud, jwt);
  }
  return 'vapid t=' + jwt + ', k=' + vapid.publicKey;
}

// ---- Message encryption (aes128gcm, one record) -------------------------------------------------------------------------------
// `opts.serverKeys` / `opts.salt` exist only so a test can pin them; production leaves them out and gets fresh random values.
export async function encryptPayload(plain, p256dh, auth, opts = {}) {
  const uaPub = b64uDecode(p256dh), authSecret = b64uDecode(auth);
  if (uaPub.length !== 65 || uaPub[0] !== 4 || authSecret.length !== 16) throw new Error('bad subscription keys');
  const body = typeof plain === 'string' ? enc.encode(plain) : plain;
  if (body.length > 3993) throw new Error('payload too large');   // 4096-byte record minus 16 tag, 1 delimiter, 86 header
  const eph = opts.serverKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdf(authSecret, secret, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(body, new Uint8Array([2]))));
  const head = new Uint8Array(21); head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = 65;
  return concat(head, asPub, ct);
}

// ---- Send ----------------------------------------------------------------------------------------------------------------------
// -> { status, retryAfter } ; never throws for a push-service answer. status 0 = network or key error (message in `error`).
export async function sendPush(sub, payload, o) {
  try {
    const body = await encryptPayload(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
    const res = await o.fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await vapidHeader(sub.endpoint, o.vapid, o.now, o.jwtCache),
        'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        TTL: String(o.ttl || 3600), Urgency: 'normal'
      },
      body
    });
    const ra = Number(res.headers && res.headers.get && res.headers.get('Retry-After'));
    return { status: res.status, retryAfter: Number.isFinite(ra) ? ra : 0 };
  } catch (e) {
    return { status: 0, retryAfter: 0, error: String(e && e.message || e).slice(0, 80) };
  }
}

// Push services the browsers use. Anything else is refused at /subscribe so the Worker cannot be pointed at other hosts.
export function allowedPushHost(endpoint) {
  let u;
  try { u = new URL(endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return false;
  const h = u.hostname;
  return h === 'fcm.googleapis.com' || h === 'web.push.apple.com' || /^[a-z0-9-]+\.push\.apple\.com$/.test(h) ||
    /^[a-z0-9.-]+\.push\.services\.mozilla\.com$/.test(h) || /^[a-z0-9.-]+\.notify\.windows\.com$/.test(h);
}
