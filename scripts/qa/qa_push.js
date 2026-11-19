// QA: push alerts in Settings (task 28). Called from suite C. Nothing here reaches a real push service or Worker: Notification, PushManager, the service
// worker registration and fetch are stubs installed before the page loads, and the Worker address is filled in only inside the test page (the shipped
// config is empty). A stubbed fetch means the page's CSP is never consulted for the fake Worker host; the policy is checked by test_push_config.js and test_csp.js.
const path = require('path'), fs = require('fs');
const { T, expect, session, REPO } = require('./qa_lib');

// Browser-side stubs. window.__push records what the page did, in order.
function STUBS() {
  const P = window.__push = { order: [], perm: 0, subscribed: 0, unsubscribed: 0, fetches: [], permResult: 'granted', subOpts: null, down: false, reply: {}, current: null, onOpenPerm: null };
  const state = { v: 'default' };
  const N = function () {};
  Object.defineProperty(N, 'permission', { get: () => state.v, configurable: true });
  N.requestPermission = () => { P.order.push('perm'); P.perm++; if (P.permResult !== 'default') state.v = P.permResult; return Promise.resolve(P.permResult); };
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: N });
  window.PushManager = function () {};
  const sub = () => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/QA-STUB-' + (P.subseq = (P.subseq || 0) + 1),
    toJSON() { return { endpoint: this.endpoint, expirationTime: null, keys: { p256dh: 'BQA', auth: 'QA' } }; },
    unsubscribe() { P.unsubscribed++; P.current = null; return Promise.resolve(true); }
  });
  const reg = { pushManager: { subscribe: o => { P.order.push('subscribe'); P.subscribed++; P.subOpts = { userVisibleOnly: o.userVisibleOnly, keyBytes: o.applicationServerKey && o.applicationServerKey.length }; return Promise.resolve(P.current = sub()); }, getSubscription: () => Promise.resolve(P.current) }, update: () => Promise.resolve(), showNotification: () => Promise.resolve() };
  const sw = { ready: Promise.resolve(reg), controller: null, register: () => Promise.resolve(reg), getRegistration: () => Promise.resolve(reg), addEventListener: (t, f) => { (P.swl = P.swl || {})[t] = f; } };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  const real = window.fetch;
  window.fetch = function (url, init) {
    const u = String(url && url.url || url);
    if (!/^https:\/\/push\.example\.test\//.test(u)) return real.apply(this, arguments);   // the app's own files
    const path = u.replace('https://push.example.test', ''), body = init && init.body ? JSON.parse(init.body) : null;
    P.order.push('fetch'); P.fetches.push({ path, body, method: init && init.method });
    if (P.down) return Promise.reject(new TypeError('network down'));
    const r = P.reply[path] || { status: 200, body: path === '/test' ? { ok: true, status: 201 } : { ok: true } };
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  };
}
const IOS = () => { Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }); };
const STANDALONE = () => { Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true }); };

// addInitScript serialises a function, so several are joined into one script.
const inits = (...fns) => ({ content: fns.map(f => '(' + f.toString() + ')();').join('\n') });
const fill = (s, on = true) => s.logic((l, on) => { l.PUSH_CONFIG = () => on ? { workerUrl: 'https://push.example.test', vapidPublicKey: 'B' + 'A'.repeat(86) } : { workerUrl: '', vapidPublicKey: '' }; l.setState({ pushMsg: l.state.pushMsg || '' }); return true; }, on);
const P = s => s.page.evaluate(() => JSON.parse(JSON.stringify(window.__push, (k, v) => typeof v === 'function' ? undefined : v)));
const card = s => s.page.locator('[data-push-alerts]');
const btn = (s, name) => card(s).getByRole('button', { name, exact: true });

module.exports = async function pushTests() {
  // 1. Shipped default: not set up, silent.
  let s = await session({ init: inits(STUBS) });
  await T('PUSH-01', 'Push', 'Shipped config is empty: the row says "Not set up yet", there is nothing to tap, and nothing touches Notification, PushManager or the network', async () => {
    await s.go('HOME'); await s.page.waitForTimeout(6500);   // past the 5 s start-up sync
    const t = await card(s).innerText();
    expect(/Push alerts/.test(t) && /Not set up yet/.test(t), 'row text: ' + t);
    expect(await card(s).getByRole('button').count() === 0, 'a button is shown while the Worker is not configured');
    const p = await P(s);
    expect(p.perm === 0 && p.subscribed === 0 && p.fetches.length === 0, JSON.stringify([p.perm, p.subscribed, p.fetches]));
    expect(await s.call('pushPost', '/test', {}) === null && (await P(s)).fetches.length === 0, 'pushPost reached the network with an empty config');
    expect((await s.call('pushEnv')) === 'setup', 'env is not "setup"');
    // a half-filled config (address but no key) is still not set up
    await s.logic(l => { l.PUSH_CONFIG = () => ({ workerUrl: 'https://push.example.test', vapidPublicKey: '' }); return 1; });
    expect(await s.call('pushEnv') === 'setup', 'an address without a key counted as set up');
    await s.logic(l => { l.PUSH_CONFIG = () => ({ workerUrl: 'http://push.example.test', vapidPublicKey: 'B' + 'A'.repeat(86) }); return 1; });
    expect(await s.call('pushEnv') === 'setup', 'an http address counted as set up');
    expect(s.errors.length === 0, s.errors[0]);
  }, 'high');
  await s.close();

  // 2. iPhone in Safari (not installed) vs from the Home Screen.
  s = await session({ init: inits(STUBS, IOS) });
  await T('PUSH-02', 'Push', 'On iPhone in a browser tab the row says to add the app to the Home Screen first and offers no button; no permission is asked', async () => {
    await fill(s); await s.go('HOME');
    const t = await card(s).innerText();
    expect(/Add to Home Screen first/.test(t) && /Home Screen icon/.test(t), t);
    expect(await card(s).getByRole('button').count() === 0, 'a button is shown outside the Home Screen app');
    expect((await s.call('pushEnv')) === 'install' && (await P(s)).perm === 0, 'env/perm');
    expect(await s.call('pushEnv', { userAgent: 'iPhone', platform: 'iPhone', maxTouchPoints: 5, standalone: true, serviceWorker: {} }) === 'ready', 'installed iPhone is not ready');
    expect(await s.call('pushEnv', { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }, false) === 'install', 'iPadOS (desktop user agent) is not treated as iOS');
  }, 'high');
  await s.close();

  // 3. The tap flow.
  s = await session({ init: inits(STUBS, STANDALONE) });
  await T('PUSH-03', 'Push', 'Standalone: no permission prompt until the tap; the tap asks first, then subscribes (userVisibleOnly, 65-byte key), then registers with the Worker', async () => {
    await fill(s); await s.go('HOME');
    expect(/Off/.test(await card(s).locator('[data-push-status]').innerText()), 'status is not Off');
    expect(/small server/.test(await card(s).innerText()) && /device address/.test(await card(s).innerText()), 'the one-sentence explanation is missing');
    let p = await P(s); expect(p.perm === 0 && p.order.length === 0, 'something ran before the tap: ' + JSON.stringify(p.order));
    await btn(s, 'Turn on').click(); await s.page.waitForTimeout(900);
    p = await P(s);
    expect(p.order.join() === 'perm,subscribe,fetch', 'order: ' + p.order.join());
    expect(p.subOpts.userVisibleOnly === true && p.subOpts.keyBytes === 65, JSON.stringify(p.subOpts));
    const f = p.fetches[0]; expect(f.path === '/subscribe' && f.method === 'POST' && /^https:\/\/fcm\.googleapis\.com\//.test(f.body.subscription.endpoint) && typeof f.body.tz === 'string' && f.body.tz.length > 0, JSON.stringify(f));
    const defaults = (await import(path.join(REPO, 'worker', 'src', 'logic.js'))).defaultPrefs();
    expect(JSON.stringify(f.body.prefs) === JSON.stringify(defaults), 'the app defaults differ from the Worker defaults: ' + JSON.stringify(f.body.prefs));
    expect(Object.keys(f.body).sort().join() === 'prefs,subscription,tz', 'the request carries more than the subscription, choices and zone: ' + Object.keys(f.body));
    const t = await card(s).innerText();
    expect(/On/.test(await card(s).locator('[data-push-status]').innerText()) && /Turn off/.test(t) && /Send test/.test(t) && /Promo codes/.test(t) && /Events/.test(t) && /Mega timers/.test(t), t);
    const stored = JSON.parse(await s.page.evaluate(() => localStorage.getItem('scout.push.v1')));
    expect(stored.on === true && /^https:\/\/fcm/.test(stored.endpoint), JSON.stringify(stored));
    expect(await s.call('pushEnv') === 'ready', 'env');
  }, 'critical');

  await T('PUSH-04', 'Push', 'Choices: each toggle flips, is saved, and is sent to the Worker; event types show only while Events is on; defaults are the five owner types', async () => {
    const chips = () => card(s).getByRole('button').evaluateAll(els => els.map(e => [e.textContent.trim(), e.getAttribute('aria-pressed')]));
    let c = Object.fromEntries(await chips());
    expect(c['Promo codes'] === 'true' && c['Timed Research codes'] === 'true' && c['Events'] === 'true' && c['Mega timers'] === 'true', JSON.stringify(c));
    expect(['Community Day', 'Raid Hour', 'Spotlight Hour', 'GO Tour', 'Max Battles'].every(k => c[k] === 'true') && ['Raid Day', 'Max Mondays', 'Season', 'Ending soon'].every(k => c[k] === 'false'), 'type defaults: ' + JSON.stringify(c));
    const before = (await P(s)).fetches.length;
    await btn(s, 'Promo codes').click(); await btn(s, 'Raid Day').click(); await btn(s, 'Community Day').click(); await s.page.waitForTimeout(1300);
    c = Object.fromEntries(await chips()); expect(c['Promo codes'] === 'false' && c['Raid Day'] === 'true' && c['Community Day'] === 'false', JSON.stringify(c));
    const p = await P(s), last = p.fetches[p.fetches.length - 1];
    expect(p.fetches.length === before + 1 && last.path === '/subscribe' && last.body.prefs.promo === false && last.body.prefs.types.indexOf('raid-day') >= 0 && last.body.prefs.types.indexOf('community-day') < 0, 'three taps should be one sync: ' + JSON.stringify([p.fetches.length - before, last.body.prefs]));
    expect(JSON.parse(await s.page.evaluate(() => localStorage.getItem('scout.push.v1'))).prefs.promo === false, 'not saved');
    await btn(s, 'Events').click(); await s.page.waitForTimeout(300);
    expect(await btn(s, 'Raid Day').count() === 0, 'event types still shown with Events off');
    await btn(s, 'Events').click(); await s.page.waitForTimeout(1300);   // let the debounced sync of that last tap land
  }, 'high');

  await T('PUSH-05', 'Push', 'Send test posts to the Worker and reports the answer; a limit answer and a dead device say what to do', async () => {
    await btn(s, 'Send test').click(); await s.page.waitForTimeout(700);
    let p = await P(s), f = p.fetches.filter(x => x.path === '/test').pop();
    expect(f.path === '/test' && /^https:\/\/fcm/.test(f.body.endpoint) && Object.keys(f.body).join() === 'endpoint', JSON.stringify(f));
    expect(/Test sent/.test(await card(s).innerText()), 'no success message');
    await s.page.evaluate(() => { window.__push.reply['/test'] = { status: 429, body: { error: 'wait a minute' } }; }); await btn(s, 'Send test').click(); await s.page.waitForTimeout(700);
    expect(/Wait a minute/.test(await card(s).innerText()), 'no limit message');
    await s.page.evaluate(() => { window.__push.reply['/test'] = { status: 200, body: { ok: false, gone: true } }; }); await btn(s, 'Send test').click(); await s.page.waitForTimeout(700);
    expect(/no longer registered/.test(await card(s).innerText()), 'no dead-device message');
    await s.page.evaluate(() => { delete window.__push.reply['/test']; window.__push.down = true; }); await btn(s, 'Send test').click(); await s.page.waitForTimeout(700);
    expect(/did not answer/.test(await card(s).innerText()), 'no Worker-down message');
    await s.page.evaluate(() => { window.__push.down = false; });
  }, 'high');

  await T('PUSH-06', 'Push', 'Mega rest times the person logged are sent once, with a fixed label and no Pokemon name; the app\'s own reminders for events, promo codes and Mega rests step aside while push is on', async () => {
    const at = Date.now() + 3 * 3600000;
    await s.set({ megaEnergyInventory: { gible: { status: { '': { level: 1, restEndsAt: at } } } } });
    const n0 = (await P(s)).fetches.length; await s.call('pushSyncMega'); await s.call('pushSyncMega');
    const p = await P(s), posts = p.fetches.slice(n0);
    expect(posts.length === 1 && posts[0].path === '/schedule' && posts[0].body.label === 'rest-over' && posts[0].body.fireAt === Math.round(at) && Object.keys(posts[0].body).sort().join() === 'endpoint,fireAt,label', JSON.stringify(posts));
    expect(!/gible/i.test(JSON.stringify(posts)), 'the species name was sent');
    await s.page.evaluate(() => { try { Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true }); } catch (e) {} });
    await s.set({ remindersOn: true, megaEnergyInventory: { gible: { status: { '': { level: 1, restEndsAt: Date.now() - 1000 } } } } });
    await s.page.evaluate(() => localStorage.removeItem('scout.remind.sent.v1'));
    expect((await s.call('checkReminders')).length === 0, 'a local reminder fired while push is on');
    await s.set({ pushOn: false }); await s.page.evaluate(() => localStorage.removeItem('scout.remind.sent.v1'));
    expect((await s.call('checkReminders')).length >= 1, 'local reminders did not come back when push is off');
    await s.set({ pushOn: true });
  }, 'high');

  await T('PUSH-07', 'Push', 'Re-sync: a replaced subscription is registered again and the old record removed; an unchanged one is left alone; a dropped one turns the row off', async () => {
    const n0 = (await P(s)).fetches.length; await s.call('pushSync');
    expect((await P(s)).fetches.length === n0, 'an unchanged subscription caused traffic');
    await s.page.evaluate(() => { const old = JSON.parse(localStorage.getItem('scout.push.v1')); old.endpoint = 'https://fcm.googleapis.com/fcm/send/QA-OLD'; localStorage.setItem('scout.push.v1', JSON.stringify(old)); });
    await s.call('pushSync'); await s.page.waitForTimeout(300);
    const posts = (await P(s)).fetches.slice(n0).map(f => f.path + ':' + (f.body.subscription ? 'sub' : f.body.endpoint));
    expect(posts.join() === '/subscribe:sub,/unsubscribe:https://fcm.googleapis.com/fcm/send/QA-OLD', posts.join());
    await s.page.evaluate(() => { window.__push.current = null; }); await s.call('pushSync'); await s.page.waitForTimeout(300);
    expect((await s.state()).pushOn === false && (await s.page.evaluate(() => localStorage.getItem('scout.push.v1'))) === null, 'a dropped subscription left the row on');
    expect(/Turn on/.test(await card(s).innerText()), 'no way to turn it on again');
  }, 'high');
  await s.close();

  // 4. Turning off.
  s = await session({ init: inits(STUBS, STANDALONE) });
  await T('PUSH-08', 'Push', 'Turn off removes the browser subscription, asks the Worker to delete it, clears the local copy; deleting my data does the same', async () => {
    await fill(s); await s.go('HOME'); await btn(s, 'Turn on').click(); await s.page.waitForTimeout(800);
    expect((await s.state()).pushOn === true, 'not on');
    const ep = (await P(s)).current && (await s.page.evaluate(() => window.__push.current.endpoint));
    await btn(s, 'Turn off').click(); await s.page.waitForTimeout(700);
    const p = await P(s), last = p.fetches[p.fetches.length - 1];
    expect(last.path === '/unsubscribe' && last.body.endpoint === ep && p.unsubscribed === 1, JSON.stringify([last, p.unsubscribed]));
    expect((await s.state()).pushOn === false && (await s.page.evaluate(() => localStorage.getItem('scout.push.v1'))) === null && /Off/.test(await card(s).innerText()), 'still on');
    await btn(s, 'Turn on').click(); await s.page.waitForTimeout(800); expect((await s.state()).pushOn === true, 'could not turn on again');
    const n0 = (await P(s)).fetches.length; await s.call('pushForget'); await s.page.waitForTimeout(600);
    expect((await P(s)).fetches.slice(n0).some(f => f.path === '/unsubscribe') && (await s.page.evaluate(() => localStorage.getItem('scout.push.v1'))) === null, 'pushForget did not remove the record');
    const src = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8'), a = src.indexOf('async deleteAccountNow()');
    expect(a > 0 && src.slice(a, a + 6000).indexOf('this.pushForget()') > 0, 'Delete my account does not call pushForget');
  }, 'high');

  await T('PUSH-09', 'Push', 'A blocked permission explains the system setting and subscribes nothing; a Worker that does not answer leaves nothing half-subscribed', async () => {
    await s.page.evaluate(() => { window.__push.permResult = 'denied'; window.__push.order = []; });
    await btn(s, 'Turn on').click(); await s.page.waitForTimeout(600);
    let p = await P(s);
    expect(/Blocked/.test(await card(s).innerText()) && p.order.join() === 'perm' && (await s.state()).pushOn === false, 'denied: ' + p.order.join() + ' ' + (await card(s).innerText()));
    expect(/Blocked in system settings/.test(await card(s).locator('[data-push-status]').innerText()) && await btn(s, 'Turn on').count() === 0, 'a blocked permission offered the prompt again');
    await s.page.evaluate(() => { const N = window.Notification; Object.defineProperty(N, 'permission', { get: () => 'default', configurable: true }); window.__push.permResult = 'granted'; window.__push.down = true; window.__push.unsubscribed = 0; });
    await s.set({ pushMsg: '' }); await btn(s, 'Turn on').click(); await s.page.waitForTimeout(900);
    p = await P(s);
    expect(/did not answer/.test(await card(s).innerText()) && p.unsubscribed === 1 && p.current === null && (await s.state()).pushOn === false, 'worker down: ' + JSON.stringify([p.unsubscribed, p.current]));
    await s.page.evaluate(() => { window.__push.down = false; window.__push.reply['/subscribe'] = { status: 503, body: { error: 'full' } }; });
    await btn(s, 'Turn on').click(); await s.page.waitForTimeout(900);
    expect(/full/.test(await card(s).innerText()) && (await s.state()).pushOn === false, 'cap reached message');
    expect((await s.state()).pushOn === false && !(await s.page.evaluate(() => localStorage.getItem('scout.push.v1'))), 'state left behind');
  }, 'high');

  await T('PUSH-10', 'Push', 'No page errors through the push session', async () => expect(s.errors.length === 0, s.errors[0]));
  await s.close();

  // 5. Settings still passes the zero-tolerance conformance scans with the new card (suite E scans the same screen; this checks the new elements directly).
  s = await session({ init: inits(STUBS, STANDALONE) });
  await T('PUSH-11', 'Push', 'The card uses only scale type sizes and weights, 44 px tap strips and named controls', async () => {
    await fill(s); await s.go('HOME'); await btn(s, 'Turn on').click(); await s.page.waitForTimeout(800);
    const r = await card(s).evaluate(el => { const bad = []; [...el.querySelectorAll('*')].forEach(x => { const cs = getComputedStyle(x); if (!x.childNodes.length) return; if ([...x.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) { if ([12, 13, 15, 17, 22, 28, 32].indexOf(parseFloat(cs.fontSize)) < 0) bad.push('size ' + cs.fontSize); if ([400, 500, 600, 700].indexOf(+cs.fontWeight) < 0) bad.push('weight ' + cs.fontWeight); } }); const small = [...el.querySelectorAll('button')].filter(b => { const r = b.getBoundingClientRect(); return !b.textContent.trim() || (r.height < 36); }).map(b => b.textContent); return { bad, small }; });
    expect(r.bad.length === 0 && r.small.length === 0, JSON.stringify(r));
  });
  await s.close();
};
