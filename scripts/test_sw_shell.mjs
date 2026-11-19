#!/usr/bin/env node
// sw.js app-shell fetch strategy, run in a Node vm with a fake service worker scope, a fake clock and a fetch the test controls (no browser, no
// network): app code is network-first, but a stalled network (lie-fi) must not leave a blank screen when the cache is full. Run: node scripts/test_sw_shell.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(process.env.SW_FILE || path.join(here, '..', 'sw.js'), 'utf8');
let fail = 0;
const check = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { fail++; console.log('FAIL', name, '\n  got ', a, '\n  want', b); } };
const tick = () => new Promise(r => setImmediate(r));
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };
const K = 'https://app.example.test/scout/';

// cached: map of url -> body. A fetch call returns a promise the test settles by hand (net(i).resolve / net(i).reject).
function scope(cached = {}, opts = {}) {
  const L = {}, timers = [], puts = [], fetches = [], putGates = [];
  const self = { location: new URL(K + 'sw.js'), registration: { scope: K }, clients: { claim: async () => {} }, skipWaiting: async () => {}, addEventListener: (t, f) => { L[t] = f; } };
  const cache = { add: async () => {}, put: (r, resp) => { puts.push([r.url, resp.body]); return opts.slowPut ? new Promise(res => putGates.push(res)) : Promise.resolve(); } };
  const ctx = vm.createContext({
    self, URL, console,
    Response: class { constructor(b, o) { this.body = b; this.status = (o && o.status) || 200; } },
    caches: { open: async () => cache, keys: async () => [], match: async r => { const u = typeof r === 'string' ? new URL(r, K).href : r.url; return u in cached ? { body: cached[u], fromCache: true } : undefined; } },
    fetch: req => new Promise((resolve, reject) => { fetches.push({ url: req.url, resolve, reject }); }),
    setTimeout: (f, ms, ...a) => { const t = { f, ms, a, live: true }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.live = false; }
  });
  vm.runInContext(src, ctx);
  // Fire a fetch event; answered() says whether respondWith was called, state() what it settled to.
  const fire = (rel, over = {}) => {
    const req = { url: K + rel, method: 'GET', mode: 'cors', cache: 'default', ...over };
    const waits = []; let answer = null, done = false, value, err;
    L.fetch({ request: req, respondWith: p => { answer = Promise.resolve(p).then(v => { done = true; value = v; }, e => { done = true; err = e; }); }, waitUntil: p => waits.push(p) });
    return { answered: () => answer !== null, waits, state: () => ({ done, value: value && (value.body !== undefined ? value.body + (value.fromCache ? ' (cache)' : '') : value), status: value && value.status, err: err && String(err) }) };
  };
  const live = () => timers.filter(t => t.live);
  const fireTimers = async () => { live().forEach(t => { t.live = false; t.f(...t.a); }); await settle(); };
  const net = i => ({ resolve: body => fetches[i].resolve({ ok: true, type: 'basic', body, clone() { return this; } }), reject: () => fetches[i].reject(new Error('offline')) });
  return { fire, live, fireTimers, net, fetches, puts, putGates };
}

{ // stalled network, cached copy exists: the cache is served after the timer, the network fetch still finishes and refreshes the cache
  const s = scope({ [K + 'support.js']: 'OLD' });
  const e = s.fire('support.js'); await settle();
  check('stalled: nothing answered before the timer', e.state().done, false);
  const t = s.live();
  check('stalled: one timer of about 3 s', [t.length, t[0] && t[0].ms >= 2500 && t[0].ms <= 4000], [1, true]);
  await s.fireTimers();
  check('stalled: the cached copy is served when the timer wins', e.state().value, 'OLD (cache)');
  s.net(0).resolve('NEW'); await settle();
  check('stalled: the late network response refreshes the cache', s.puts, [[K + 'support.js', 'NEW']]);
  check('stalled: the event is kept alive for the background refresh', e.waits.length >= 1, true);
}
{ // the worker must stay open until the late response is also written to the cache (a large file can take longer than the fetch itself)
  const s = scope({ [K + 'index.html']: 'OLD' }, { slowPut: true });
  const e = s.fire('index.html'); await settle(); await s.fireTimers();
  s.net(0).resolve('NEW'); await settle();
  let held = true; Promise.all(e.waits).then(() => { held = false; }); await settle();
  check('late refresh: waitUntil is still pending while the cache write is unfinished', [s.puts.length, held], [1, true]);
  s.putGates.forEach(g => g()); await settle();
  check('late refresh: waitUntil settles once the cache write is done', held, false);
}
{ // stalled network, nothing cached: keep waiting for the network
  const s = scope();
  const e = s.fire('support.js'); await settle(); await s.fireTimers();
  check('stalled, no cache: still waiting after the timer', e.state().done, false);
  s.net(0).resolve('NET'); await settle();
  check('stalled, no cache: the network response is served', e.state().value, 'NET');
}
{ // stalled, no cache, then the network fails: same offline answer as before (504 for code)
  const s = scope();
  const e = s.fire('support.js'); await settle(); await s.fireTimers(); s.net(0).reject(); await settle();
  check('stalled, no cache, then offline: 504', e.state().status, 504);
}
{ // fast network: network response served and the timer is cleared
  const s = scope({ [K + 'support.js']: 'OLD' });
  const e = s.fire('support.js'); await settle(); s.net(0).resolve('NEW'); await settle();
  check('fast network: network response wins', e.state().value, 'NEW');
  check('fast network: the timer is cleared', s.live().length, 0);
  check('fast network: cache refreshed', s.puts, [[K + 'support.js', 'NEW']]);
}
{ // offline (fetch rejects at once): cached copy, navigations fall back to index.html, otherwise 504
  const s = scope({ [K + 'support.js']: 'OLD', [K + 'index.html']: 'SHELL' });
  const a = s.fire('support.js'); await settle(); s.net(0).reject(); await settle();
  const b = s.fire('deep/link', { mode: 'navigate' }); await settle(); s.net(1).reject(); await settle();
  const c = s.fire('missing.json'); await settle(); s.net(2).reject(); await settle();
  check('offline: cached copy', a.state().value, 'OLD (cache)');
  check('offline: navigation gets index.html', b.state().value, 'SHELL (cache)');
  check('offline: unknown file is a 504', c.state().status, 504);
}
{ // a stalled navigation to some other page keeps waiting even though index.html is cached
  const s = scope({ [K + 'index.html']: 'SHELL' });
  const e = s.fire('Scout%20PWA%20Simulator.dc.html', { mode: 'navigate' }); await settle(); await s.fireTimers();
  check('stalled navigation to another page: no index.html substitution', e.state().done, false);
  s.net(0).resolve('SIM'); await settle();
  check('stalled navigation to another page: the network page is served', e.state().value, 'SIM');
  const q = s.fire('?utm=1', { mode: 'navigate' }); await settle(); await s.fireTimers();
  check('stalled navigation to the root with a query string: cached index.html', q.state().value, 'SHELL (cache)');
}
{ // a stalled navigation with only index.html cached shows the cached app shell
  const s = scope({ [K + 'index.html']: 'SHELL' });
  const e = s.fire('', { mode: 'navigate' }); await settle(); await s.fireTimers();
  check('stalled navigation: cached index.html is served', e.state().value, 'SHELL (cache)');
}
{ // the update check (fetch('sw.js', {cache:'no-store'})) must always reach the network, never the cache
  const s = scope({ [K + 'sw.js']: "const CACHE_NAME = 'scout-v1';" });
  const e = s.fire('sw.js', { cache: 'no-store' }); await settle();
  check('update check: no race timer is started', s.live().length, 0);
  await s.fireTimers();
  check('update check: a stalled network is not answered from cache', e.state().done, false);
  s.net(0).resolve("const CACHE_NAME = 'scout-v2';"); await settle();
  check('update check: the server copy is returned', e.state().value, "const CACHE_NAME = 'scout-v2';");
  const p = scope({ [K + 'sw.js']: 'OLD SW' });
  const q = p.fire('sw.js'); await settle(); await p.fireTimers();
  check('sw.js is never raced even without the no-store flag', [q.state().done, p.live().length], [false, 0]);
}
{ // sprites and icons stay cache-first with no timer; other origins and non-GET are left to the browser
  const s = scope({ [K + 'sprites/1.png']: 'PNG' });
  const a = s.fire('sprites/1.png'); await settle();
  check('sprite: cache first, network untouched', [a.state().value, s.fetches.length, s.live().length], ['PNG (cache)', 0, 0]);
  const b = s.fire('icons/icon-192.png'); await settle(); s.net(0).resolve('ICON'); await settle();
  check('icon not cached: fetched, no timer', [b.state().value, s.live().length], ['ICON', 0]);
  check('non-GET is not handled', s.fire('support.js', { method: 'POST' }).answered(), false);
  check('another origin is not handled', s.fire('x', { url: 'https://cdn.example/x.js' }).answered(), false);
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('sw shell tests passed');
