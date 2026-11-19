#!/usr/bin/env node
// sw.js push handlers, run in a Node vm with a fake service worker scope (no browser, no network): every push shows a notification whatever the
// payload is, and a notification click only ever opens the app's own origin. Run: node scripts/test_push_sw.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import kit from './lib/testkit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'sw.js'), 'utf8');
const t = kit.checker(), check = t.eq;

function scope(clientsList = [], over = {}) {
  const L = {}, shown = [], opened = [], focused = [], posted = [], subscribed = [];
  const self = {
    location: new URL('https://app.example.test/scout/sw.js'),
    registration: { scope: 'https://app.example.test/scout/', showNotification: async (t, o) => { if (over.showThrows) throw new Error('no'); shown.push([t, o]); }, pushManager: { subscribe: async o => { subscribed.push(o); } } },
    clients: { matchAll: async () => clientsList.map(c => ({ ...c, focus: async () => { focused.push(c.url); }, postMessage: m => posted.push(m) })), openWindow: async u => { opened.push(u); }, claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (t, f) => { L[t] = f; }
  };
  const ctx = vm.createContext({ self, URL, Response: class {}, caches: { open: async () => ({ add: async () => {}, put: async () => {} }), keys: async () => [], match: async () => undefined }, fetch: async () => ({}), console });
  vm.runInContext(src, ctx);
  return { L, shown, opened, focused, posted, subscribed };
}
// A push event: `data` is what event.data would hold ('none' = no data at all).
async function push(s, data) {
  const waits = [];
  const ev = { data: data === 'none' ? null : { json: () => JSON.parse(data), text: () => data }, waitUntil: p => waits.push(p) };
  s.L.push(ev); await Promise.all(waits);
  return s.shown.at(-1);
}
async function click(s, url, notif) {
  let closed = 0; const waits = [];
  s.L.notificationclick({ notification: { close: () => closed++, data: notif === undefined ? { url } : notif }, waitUntil: p => waits.push(p) });
  await Promise.all(waits); return closed;
}

{
  const s = scope();
  check('the handlers are registered', ['push', 'notificationclick', 'pushsubscriptionchange', 'fetch'].every(t => typeof s.L[t] === 'function'), true);
  const full = await push(s, JSON.stringify({ t: 'Community Day', b: 'Starts 2:00 PM', tag: 'evt:x:start', url: './' }));
  check('a normal push shows title, body, tag, icon and the app url', [full[0], full[1].body, full[1].tag, full[1].icon, full[1].data.url], ['Community Day', 'Starts 2:00 PM', 'evt:x:start', './icons/icon-192.png', 'https://app.example.test/scout/']);
  // Every one of these must still produce exactly one notification.
  const cases = { 'no data': 'none', 'empty string': '', 'not JSON': 'hello there', 'broken JSON': '{"t":', 'JSON null': 'null', 'JSON number': '42', 'JSON array': '[1,2]', 'JSON string': '"x"', 'wrong types': '{"t":5,"b":{},"tag":[],"url":7}', 'empty object': '{}', 'blank title': '{"t":"   "}' };
  for (const [name, data] of Object.entries(cases)) {
    const before = s.shown.length, r = await push(s, data);
    check('always shows a notification: ' + name, [s.shown.length - before, typeof r[0], r[0].length > 0, typeof r[1].body, r[1].tag], [1, 'string', true, 'string', undefined]);
  }
  check('fallback title and body', ((r) => [r[0], r[1].body])(await push(s, '{}')), ['Professor', 'Open the app to see what is new.']);
  check('a plain-text push is shown as the body', (await push(s, 'plain words'))[1].body, 'plain words');
  const long = await push(s, JSON.stringify({ t: 'T'.repeat(500), b: 'B'.repeat(900), tag: 'g'.repeat(300) }));
  check('long fields are cut', [long[0].length, long[1].body.length, long[1].tag.length], [120, 300, 100]);
  check('a cross-origin or script url is replaced by the app url', [
    (await push(s, '{"url":"https://evil.example/x"}'))[1].data.url, (await push(s, '{"url":"javascript:alert(1)"}'))[1].data.url, (await push(s, '{"url":"//evil.example/x"}'))[1].data.url, (await push(s, '{"url":"#today"}'))[1].data.url, (await push(s, '{"url":"?tab=today"}'))[1].data.url
  ], ['https://app.example.test/scout/', 'https://app.example.test/scout/', 'https://app.example.test/scout/', 'https://app.example.test/scout/#today', 'https://app.example.test/scout/?tab=today']);
}
{
  // the notification is requested through waitUntil, so the browser keeps the worker alive until it is shown
  const s = scope(); let waited = 0; const ev = { data: null, waitUntil: p => { waited++; return p; } }; s.L.push(ev);
  check('showNotification is handed to waitUntil', waited, 1);
}
{
  const open = scope([{ url: 'https://app.example.test/scout/index.html' }]);
  check('click: closes the notification and focuses an open window instead of a second one', [await click(open, './'), open.focused, open.opened], [1, ['https://app.example.test/scout/index.html'], []]);
  const none = scope([{ url: 'https://other.example/' }]);
  await click(none, './');
  check('click: no window of ours open, so the app url is opened', none.opened, ['https://app.example.test/scout/']);
  const evil = scope(); await click(evil, 'https://evil.example/phish');
  check('click: a cross-origin url never opens', evil.opened, ['https://app.example.test/scout/']);
  const js = scope(); await click(js, 'javascript:alert(1)');
  check('click: a script url never opens', js.opened, ['https://app.example.test/scout/']);
  const nodata = scope(); await click(nodata, undefined, null);
  check('click: a notification with no data opens the app', nodata.opened, ['https://app.example.test/scout/']);
  const same = scope(); await click(same, 'https://app.example.test/scout/#log');
  check('click: a same-origin url opens', same.opened, ['https://app.example.test/scout/#log']);
}
{
  const s = scope([{ url: 'https://app.example.test/scout/' }]);
  const waits = []; s.L.pushsubscriptionchange({ oldSubscription: { options: { userVisibleOnly: true, applicationServerKey: new Uint8Array([4]) } }, waitUntil: p => waits.push(p) }); await Promise.all(waits);
  check('subscription change: subscribes again with the same options and tells open windows to re-register', [s.subscribed.length, s.subscribed[0].userVisibleOnly, s.posted], [1, true, [{ type: 'push-resync' }]]);
  const s2 = scope(); const w2 = []; s2.L.pushsubscriptionchange({ oldSubscription: null, waitUntil: p => w2.push(p) }); await Promise.all(w2);
  check('subscription change without an old subscription does not throw', s2.subscribed.length, 0);
}

t.exit(t.fail ? t.fail + ' of ' + t.n + ' checks failed' : 'ok: ' + t.n + ' service worker checks passed');
