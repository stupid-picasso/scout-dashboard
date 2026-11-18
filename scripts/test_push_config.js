#!/usr/bin/env node
// Guard for the push Worker address (static, no browser). The address lives in PUSH_CONFIG() in the source; it is empty until the owner deploys the
// Worker. This checks: the default is empty and the page's policy then carries no extra host; a filled address becomes exactly one connect-src entry
// (never a wildcard, a path or http); a bad address stops the build; the built pages agree with the source; wrangler.toml holds placeholders only.
// Run: node scripts/test_push_config.js
const fs = require('fs'), path = require('path');
const pc = require('./push_config');
const ROOT = path.join(__dirname, '..');
let fail = 0, n = 0;
const check = (name, got, want) => { n++; const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { fail++; console.log('FAIL', name, '\n  got ', a, '\n  want', b); } };
const connect = html => { const m = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/); const d = m && m[1].split(';').map(x => x.trim()).find(x => x.startsWith('connect-src ')); return d || null; };

const src = fs.readFileSync(pc.DC, 'utf8');
const cfg = pc.readConfig(src);
check('PUSH_CONFIG is found in the source (single quotes, one line)', !!cfg, true);
const EMPTY = !cfg.workerUrl && !cfg.vapidPublicKey;
if (!process.env.PUSH_CONFIG_FILLED) check('shipped default: both values empty, so the app says "Not set up yet" and does no network work', cfg, { workerUrl: '', vapidPublicKey: '' });

// The reader
check('empty address adds nothing', pc.connectSrc(''), pc.CONNECT_BASE);
check('a workers.dev address becomes exactly one origin', pc.connectSrc('https://professor-push.example-owner.workers.dev'), pc.CONNECT_BASE + ' https://professor-push.example-owner.workers.dev');
check('a trailing slash is dropped', pc.connectSrc('https://professor-push.example-owner.workers.dev/'), pc.CONNECT_BASE + ' https://professor-push.example-owner.workers.dev');
for (const bad of ['http://w.example.workers.dev', 'https://*.workers.dev', 'https://w.example.workers.dev/path', 'https://w.example.workers.dev?x=1', 'https:', '*', 'w.example.workers.dev', 'https://', 'https://a b.workers.dev', 'https://u:p@w.example.workers.dev', 'https://w..workers.dev', "https://w.workers.dev; script-src *"]) {
  let threw = false; try { pc.connectSrc(bad); } catch (e) { threw = true; }
  check('an unusable address stops the build: ' + bad, threw, true);
}
check('every directive the base list has is kept when the address is added', pc.connectSrc('https://w.example.workers.dev').split(' ').slice(0, -1).join(' '), pc.CONNECT_BASE);
check('the base list has no wildcard except the Google API sub-domain pattern', pc.CONNECT_BASE.split(/\s+/).filter(t => /\*|^https?:$/.test(t)), ['https://*.googleapis.com']);

// The built pages agree with the source
const want = pc.connectSrc(cfg.workerUrl);
for (const f of ['index.html', 'Scout Dashboard.html', 'Scout Dashboard Standalone.dc.html', 'Scout Dashboard.dc.html']) {
  const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
  check(f + ': connect-src is the base list plus the configured Worker origin, nothing else', connect(t), want);
}
const tokens = (connect(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')) || '').split(/\s+/).slice(1);
check('index.html connect-src has no bare wildcard, https: or http:', tokens.filter(x => x === '*' || x === 'https:' || x === 'http:'), []);
check('while the address is empty, no workers.dev host is allowed', EMPTY ? tokens.some(x => /workers\.dev|\.example/.test(x)) : null, EMPTY ? false : null);
if (!EMPTY) {
  check('a filled address comes with a public key of 65 bytes (base64url, 87 characters)', /^[A-Za-z0-9_-]{87}$/.test(cfg.vapidPublicKey), true);
  check('a filled address appears exactly once in connect-src', tokens.filter(x => x === pc.workerOrigin(cfg.workerUrl)).length, 1);
}

// The app only calls the Worker through pushPost, which refuses to run while the config is empty.
check('pushPost is the only place the app fetches the Worker URL', (src.match(/PUSH_CONFIG\(\)\.workerUrl/g) || []).length, 1);
check('pushPost and pushReady read the config, and pushReady is checked first', /async pushPost\(path, body\) \{\s*if \(!this\.pushReady\(\)\) return null;/.test(src), true);

// wrangler.toml: placeholders only
const w = fs.readFileSync(path.join(ROOT, 'worker', 'wrangler.toml'), 'utf8');
check('wrangler.toml: every value is a placeholder', [/id = "REPLACE_/.test(w), /ALLOWED_ORIGIN = "https:\/\/REPLACE-/.test(w), /DATA_BASE = "https:\/\/REPLACE-/.test(w), /VAPID_PUBLIC_KEY = "REPLACE_/.test(w)], [true, true, true, true]);
check('wrangler.toml: no secret is named with a value, no real workers.dev address, no 32-hex KV id', [/VAPID_PRIVATE_KEY\s*=/.test(w), /workers\.dev/.test(w), /[0-9a-f]{32}/.test(w)], [false, false, false]);
check('wrangler.toml: cron every 15 minutes', /crons = \["\*\/15 \* \* \* \*"\]/.test(w), true);

console.log(fail ? fail + ' of ' + n + ' checks failed' : 'ok: ' + n + ' push config checks passed');
process.exit(fail ? 1 : 0);
