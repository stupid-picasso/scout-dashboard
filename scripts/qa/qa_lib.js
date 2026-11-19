// Shared helpers for the QA suites: test registry, fresh app sessions, navigation.
const fs = require('fs');
const path = require('path');
const { serveRepo } = require('../lib/testkit');
const pw = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'));
const chromium = pw[process.env.QA_BROWSER || 'chromium'];
const REPO = path.join(__dirname, '..', '..');
const PAGE = 'file://' + path.join(REPO, 'index.html');
const IS_WEBKIT = (process.env.QA_BROWSER || 'chromium') === 'webkit';
const results = [];
let current = null;

class Skip extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const skip = msg => { throw new Skip(msg); };

async function T(id, area, name, fn, sev = 'normal') {
  if (process.env.QA_ONLY && !new RegExp(process.env.QA_ONLY).test(id)) return null;   // QA_ONLY=SYNC-0[5-9]|DATA runs just those tests
  if (process.env.QA_SKIP && new RegExp(process.env.QA_SKIP).test(id)) return null;   // QA_SKIP=^AXE leaves those out (the opposite of QA_ONLY)
  const t0 = Date.now();
  const rec = { id, area, name, sev, status: 'pass', note: '', ms: 0 };
  try { const n = await fn(); if (typeof n === 'string') rec.note = n; }
  catch (e) { if (e instanceof Skip) { rec.status = 'skip'; rec.note = e.message; } else { rec.status = 'fail'; rec.note = String(e.message || e).split('\n')[0].slice(0, +process.env.QA_NOTE || 300); } }
  rec.ms = Date.now() - t0; results.push(rec);
  process.stdout.write((rec.status === 'pass' ? '.' : rec.status === 'skip' ? 's' : 'F'));
  return rec;
}

// The app's component logic object (state, setState and every method), found by climbing the React fibers of any element. withLogic runs
// fn(logic, arg) in the page and returns its result; null when the app has not mounted. fn and arg must be serialisable like page.evaluate's.
const findLogic = () => {
  for (const e of document.querySelectorAll('*')) {
    const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue;
    for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.setState) return f.stateNode.logic;
  }
  return null;
};
async function withLogic(page, fn, arg) {
  const h = await page.evaluateHandle(findLogic);
  try { return (await h.evaluate(l => !!l)) ? await h.evaluate(fn, arg) : null; } finally { await h.dispose(); }
}

let browser;
async function launch() {
  if (browser) return browser;
  const o = {};
  if ((process.env.QA_BROWSER || 'chromium') === 'chromium') o.args = ['--no-sandbox'];   // WebKit rejects Chromium flags and fails to launch
  if (process.env.PW_CHROMIUM) o.executablePath = process.env.PW_CHROMIUM;
  browser = await chromium.launch(o);
  return browser;
}
async function close() { if (browser) await browser.close(); if (server) server.close(); }

// WebKit refuses every fetch() from a file:// page ("access control checks") and reports each one as a page error, even when the app catches it.
// Chromium lets the same fetch fail quietly, so the suites were written against that. For WebKit the app is served from the repo over
// http://127.0.0.1, which is how it is really used, and the data/*.json feeds are aborted by default so a test sees the same "no feed
// yet" start as under Chromium (a test that wants a feed passes opts.feed / opts.promo, which are routed after this default and win).
let server, serverBase;
async function webBase() {
  if (serverBase) return serverBase;
  server = await serveRepo({ noStore: true }); server.unref();
  return (serverBase = 'http://127.0.0.1:' + server.address().port + '/');
}

// Touch input for the gesture tests. Chromium takes real touch events through the browser's input pipeline (CDP). WebKit has no CDP and no
// way to create a touch from Playwright, so the same touchstart / touchmove / touchend are dispatched on the element under the first
// point, with the touch lists the app's handlers read. Same assertion, same handlers; only the delivery differs.
async function touch(s) {
  if (!IS_WEBKIT) {
    const cdp = await s.ctx.newCDPSession(s.page); const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
    return { native: true, start: (x, y) => send('touchStart', [[x, y]]), move: (x, y) => send('touchMove', [[x, y]]), end: () => send('touchEnd', []) };
  }
  const fire = (type, x, y) => s.page.evaluate(([t, px, py]) => {
    const w = window; if (t === 'touchstart') w.__qaTouchTarget = document.elementFromPoint(px, py) || document.body;
    const target = w.__qaTouchTarget; const pt = { identifier: 1, target, clientX: px, clientY: py, pageX: px + w.scrollX, pageY: py + w.scrollY, screenX: px, screenY: py, radiusX: 1, radiusY: 1, force: 1 };
    const e = new Event(t, { bubbles: true, cancelable: true, composed: true });
    const list = t === 'touchend' ? [] : [pt]; Object.defineProperty(e, 'touches', { value: list }); Object.defineProperty(e, 'targetTouches', { value: list }); Object.defineProperty(e, 'changedTouches', { value: [pt] });
    target.dispatchEvent(e);
  }, [type, x, y]);
  let last = [0, 0];
  return { native: false, start: (x, y) => { last = [x, y]; return fire('touchstart', x, y); }, move: (x, y) => { last = [x, y]; return fire('touchmove', x, y); }, end: () => fire('touchend', last[0], last[1]) };
}

// ---- In-memory stand-in for Firebase Auth + Cloud Firestore ---------------------------------------------------------------
// Backed by C.store (path -> document), shared between sessions to model two devices. It enforces the same allow-list as
// firestore.rules (read from that file, so the two cannot drift), refuses other users' paths and writes to gameData/sprites,
// and counts every read, write, delete and byte per collection in C.stats. Nothing here talks to the real Firebase project.
function rulesLists() {
  const t = fs.readFileSync(path.join(REPO, 'firestore.rules'), 'utf8').replace(/\/\/.*$/gm, '');
  const list = name => { const m = t.match(new RegExp('function ' + name + '\\(\\)\\s*\\{([\\s\\S]*?)\\}')); return m ? (m[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)) : []; };
  const sn = t.match(/match \/snapshots\/\{id\}[\s\S]*?hasOnly\(\[([^\]]*)\]/);
  return { allowed: list('allowedKeysList'), scrub: list('scrubKeysList'), snapKeys: sn ? (sn[1].match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)) : [] };
}
const colOf = p => { const g = p.split('/'); return g.length >= 4 ? g[2] : g[0]; };
function statsFor(C, p) { C.stats = C.stats || {}; return (C.stats[colOf(p)] = C.stats[colOf(p)] || { reads: 0, writes: 0, deletes: 0, bytesRead: 0, bytesWritten: 0 }); }
const isDelMark = v => v && typeof v === 'object' && v.__del;
const isStamp = v => v && typeof v === 'object' && v.__ts === true;

function cloudDecide(C, op, p, data) {   // returns '' when allowed, else the reason
  const u = C.user; const g = p.split('/'); const rl = C.rules = C.rules || rulesLists();
  if (!u) return 'not signed in';
  const verified = u.emailVerified === true || ['google.com', 'github.com'].indexOf(u.provider) >= 0;
  if (g[0] === 'gameData' || g[0] === 'sprites') return op === 'read' ? '' : g[0] + ' is read-only';
  if (g[0] !== 'scoutUsers' || g.length < 2) return 'no rule for ' + g[0];
  if (g[1] !== u.uid) return 'not the owner of ' + p;
  if (g.length === 2) {
    if (op === 'read' || op === 'delete') return '';
    if (!verified) return 'unverified identity';
    const exists = C.store[p] !== undefined;
    const keys = Object.keys(data);
    if (!exists) {
      const bad = keys.filter(k => !isDelMark(data[k]) && rl.allowed.indexOf(k) < 0);
      if (bad.length) return 'create with keys outside the allow-list: ' + bad.join(',');
      if (!isStamp(data.updatedAt)) return 'updatedAt is not a server timestamp';
      return '';
    }
    for (const k of keys) {
      if (isDelMark(data[k])) { if (rl.allowed.indexOf(k) < 0 && rl.scrub.indexOf(k) < 0) return 'delete of unlisted key ' + k; }
      else if (rl.scrub.indexOf(k) >= 0) { if (JSON.stringify(C.store[p][k]) !== JSON.stringify(data[k])) return 'credential field ' + k + ' may only be deleted'; }
      else if (rl.allowed.indexOf(k) < 0) return 'update with key outside the allow-list: ' + k;
    }
    if (keys.indexOf('updatedAt') >= 0 && !isStamp(data.updatedAt)) return 'updatedAt is not a server timestamp';
    return '';
  }
  if (g.length === 4 && g[2] === 'snapshots') {
    if (op === 'read' || op === 'delete') return '';
    if (!verified) return 'unverified identity';
    if (C.store[p] !== undefined) return 'snapshots are immutable';
    if (!/^[0-9]{13}$/.test(g[3])) return 'snapshot id is not 13 digits';
    const bad = Object.keys(data).filter(k => rl.snapKeys.indexOf(k) < 0);
    return bad.length ? 'snapshot keys outside the allow-list: ' + bad.join(',') : '';
  }
  return 'no rule for ' + p;
}

async function installCloud(page, C) {
  C.store = C.store || {}; C.writes = C.writes || []; C.denied = C.denied || []; C.stats = C.stats || {};
  C.authUsers = C.authUsers || {};
  // The stand-in serves its own script bodies for the three Firebase files, which could never match the real files' SRI hashes: the harness
  // records the integrity value the app asks for (window.__sriSeen) and then drops it so the stand-in can run. SYNC-13 checks what was asked.
  await page.addInitScript(() => {
    window.__sriSeen = [];
    const d = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'integrity');
    Object.defineProperty(HTMLScriptElement.prototype, 'integrity', { configurable: true, get() { return ''; }, set(v) { window.__sriSeen.push({ el: this, integrity: v }); } });
  });
  if (C.user === undefined) C.user = { uid: 'qa-user', email: 'qa@example.test', provider: 'google.com', emailVerified: true };
  if (C.user) C.authUsers[C.user.uid] = C.user;
  const deny = (op, p, why) => { C.denied.push({ op, p, why }); return { error: 'Missing or insufficient permissions. (' + why + ')', code: 'permission-denied' }; };
  const view = d => d === undefined ? null : JSON.parse(JSON.stringify(d));
  const read = (p, n) => { const st = statsFor(C, p); st.reads += n; };
  await page.exposeFunction('__fsAuthInit', () => C.user || null);
  await page.exposeFunction('__fsAuthSet', u => { C.user = u; if (u) C.authUsers[u.uid] = u; return true; });
  await page.exposeFunction('__fsAuthDelete', () => {
    if (C.requireRecentLogin) return { error: 'This operation is sensitive and requires recent authentication.', code: 'auth/requires-recent-login' };
    if (C.user) { (C.log = C.log || []).push(['deleteUser', C.user.uid]); delete C.authUsers[C.user.uid]; (C.deletedUsers = C.deletedUsers || []).push(C.user.uid); C.user = null; }
    return { ok: true };
  });
  // ---- Sign-in providers (popup), several accounts, linking. Tests script what the next popup does through C.popups:
  //   { account: { uid, email, displayName, emailVerified } }                          the popup succeeds as that account
  //   { error: { code, email?, account? } }                                            a named error; with account the error carries a credential for that identity
  // An empty queue means the person closed the popup. C.popupLog records every popup that was opened; C.linkFail is a one-shot error code for the next link.
  // C.identityOwner maps 'provider:identity uid' to the Auth uid that owns it, which is how credential-already-in-use is told.
  C.popups = C.popups || []; C.popupLog = C.popupLog || []; C.identityOwner = C.identityOwner || {};
  const own = (prov, a) => { C.identityOwner[prov + ':' + a.uid] = C.identityOwner[prov + ':' + a.uid] || a.uid; };
  const merge = (prov, a) => {   // the Auth user for an identity: the existing one when the uid is known, else a new one
    const cur = C.authUsers[a.uid] || {};
    const providers = Array.from(new Set([...(cur.providers || (cur.provider ? [cur.provider] : [])), prov]));
    return { emailVerified: true, ...cur, ...a, provider: cur.provider || prov, providers };
  };
  await page.exposeFunction('__fsPopup', (kind, prov) => {
    C.popupLog.push({ kind, prov });
    const nx = C.popups.shift();
    if (!nx) return { error: { code: 'auth/popup-closed-by-user', message: 'The popup has been closed by the user before finalizing the operation.' } };
    return JSON.parse(JSON.stringify(nx));
  });
  await page.exposeFunction('__fsSignInIdentity', (prov, a) => {   // popup or credential sign-in as an identity
    const owner = C.identityOwner[prov + ':' + a.uid];
    const uid = owner || a.uid;
    const u = merge(prov, { ...a, uid });
    own(prov, { uid });
    C.authUsers[uid] = u; C.user = u; return { user: u };
  });
  await page.exposeFunction('__fsEmail', (mode, email, pw) => {
    const em = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return { error: 'The email address is badly formatted.', code: 'auth/invalid-email' };
    const found = Object.values(C.authUsers).find(x => String(x.email || '').toLowerCase() === em && x.password !== undefined);
    if (mode === 'signup') {
      if (found) return { error: 'The email address is already in use.', code: 'auth/email-already-in-use' };
      if (String(pw || '').length < 6) return { error: 'Password should be at least 6 characters.', code: 'auth/weak-password' };
      const u = { uid: 'pw-' + (Object.keys(C.authUsers).length + 1), email: em, password: pw, provider: 'password', providers: ['password'], emailVerified: false };
      C.authUsers[u.uid] = u; C.user = u; return { user: u };
    }
    if (!found || found.password !== pw) return { error: 'The supplied auth credential is incorrect.', code: 'auth/invalid-credential' };
    C.user = found; return { user: found };
  });
  await page.exposeFunction('__fsLink', (prov, a) => {
    if (!C.user) return { error: 'No signed-in user.', code: 'auth/no-current-user' };
    if (C.linkFail) { const code = C.linkFail; C.linkFail = null; return { error: 'link refused (' + code + ')', code }; }
    const cur = C.authUsers[C.user.uid] || C.user;
    if ((cur.providers || [cur.provider]).indexOf(prov) >= 0) return { error: 'User can only be linked to one identity for the given provider.', code: 'auth/provider-already-linked' };
    const owner = C.identityOwner[prov + ':' + a.uid];
    if (owner && owner !== cur.uid) return { error: 'This credential is already associated with a different user account.', code: 'auth/credential-already-in-use' };
    const taken = Object.values(C.authUsers).find(x => x.uid !== cur.uid && a.email && String(x.email || '').toLowerCase() === String(a.email).toLowerCase() && x.password !== undefined);
    if (taken) return { error: 'The email address is already in use by another account.', code: 'auth/email-already-in-use' };
    const next = { ...cur, providers: [...(cur.providers || [cur.provider]), prov], email: cur.email || a.email || cur.email, displayName: cur.displayName || a.displayName };
    own(prov, { uid: a.uid }); C.identityOwner[prov + ':' + a.uid] = cur.uid;
    C.authUsers[cur.uid] = next; C.user = next; (C.log = C.log || []).push(['link', cur.uid, prov]);
    return { user: next };
  });
  await page.exposeFunction('__fsAuthTime', () => (C.authTime !== undefined ? C.authTime : Date.now()));
  await page.exposeFunction('__fsGet', (p, kind) => {
    const why = cloudDecide(C, 'read', p, {}); if (why) return deny('read', p, why);
    const d = C.store[p]; const st = statsFor(C, p); st.reads += 1; if (d !== undefined) st.bytesRead += JSON.stringify(d).length;
    return { data: view(d) };
  });
  await page.exposeFunction('__fsList', (p, order, desc, lim) => {
    const why = cloudDecide(C, 'read', p + '/x', {}); if (why) return deny('read', p, why);
    const pre = p + '/';
    let rows = Object.keys(C.store).filter(k => k.startsWith(pre) && k.slice(pre.length).indexOf('/') < 0).map(k => ({ id: k.slice(pre.length), data: view(C.store[k]) }));
    if (order) rows.sort((a, b) => (a.data[order] > b.data[order] ? 1 : a.data[order] < b.data[order] ? -1 : 0) * (desc ? -1 : 1));
    if (lim) rows = rows.slice(0, lim);
    const st = statsFor(C, p + '/x'); st.reads += Math.max(1, rows.length); rows.forEach(r => { st.bytesRead += JSON.stringify(r.data).length; });
    return { rows };
  });
  await page.exposeFunction('__fsSet', async (p, data, merge) => {
    if (C.delaySnapMs && /\/snapshots\//.test(p)) await new Promise(r => setTimeout(r, C.delaySnapMs));   // a slow snapshot write, to test races with delete
    if (C.delayMetaMs && !/\/snapshots\//.test(p)) await new Promise(r => setTimeout(r, C.delayMetaMs));   // a slow user-document write, to test races with delete
    if (C.failWrites) return C.failWrites === 'quota' ? { error: 'Quota exceeded.', code: 'resource-exhausted' } : { error: 'permission-denied (QA)', code: 'permission-denied' };
    const why = cloudDecide(C, 'write', p, data); if (why) return deny('write', p, why);
    const cur = merge && C.store[p] ? C.store[p] : {};
    const next = { ...cur };
    Object.keys(data).forEach(k => { if (isDelMark(data[k])) delete next[k]; else if (isStamp(data[k])) next[k] = { __tsval: Date.now() }; else next[k] = data[k]; });
    C.store[p] = next; (C.log = C.log || []).push(['set', p]); const bytes = JSON.stringify(next).length;
    const st = statsFor(C, p); st.writes += 1; st.bytesWritten += JSON.stringify(data).length;
    C.writes.push({ p, bytes, keys: Object.keys(data) });
    return { ok: true };
  });
  await page.exposeFunction('__fsDelete', async p => {
    if (C.delayDocDeleteMs && !/\/snapshots\//.test(p)) await new Promise(r => setTimeout(r, C.delayDocDeleteMs));   // a slow user-document delete
    // C.failSnapDeleteAfter = n: the (n+1)th snapshot delete is refused, to test a delete that fails half-way.
    if (C.failSnapDeleteAfter !== undefined && /\/snapshots\//.test(p)) { if ((C.snapDeletesSeen = (C.snapDeletesSeen || 0) + 1) > C.failSnapDeleteAfter) return { error: 'unavailable (QA)', code: 'unavailable' }; }
    const why = cloudDecide(C, 'delete', p, {}); if (why) return deny('delete', p, why);
    delete C.store[p]; (C.log = C.log || []).push(['delete', p]); statsFor(C, p).deletes += 1; return { ok: true };
  });
  await page.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat/, r => r.fulfill({ contentType: 'application/javascript', body: `(function(){
    const listeners = {};
    const del = { __del: true }, stampMark = { __ts: true };
    class Timestamp { constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; } toMillis() { return this._ms; } toDate() { return new Date(this._ms); } }
    const rev = d => d === null ? null : JSON.parse(JSON.stringify(d), (k, v) => (v && typeof v === 'object' && v.__tsval !== undefined) ? new Timestamp(v.__tsval) : v);
    const wire = o => JSON.parse(JSON.stringify(o, (k, v) => (v && v.__del) ? { __del: true } : (v && v.__ts) ? { __ts: true } : v));
    const fail = r => { const e = new Error(r.error); e.code = r.code; return e; };
    const snapOf = (path, d) => ({ id: path.split('/').pop(), exists: d !== null, data: () => rev(d), metadata: { hasPendingWrites: false }, ref: ref(path) });
    const notify = path => (listeners[path] || []).slice().forEach(cb => window.__fsGet(path).then(r => { if (!r.error) cb(snapOf(path, r.data)); }));
    window.__fsListeners = () => Object.keys(listeners).reduce((n, k) => n + listeners[k].length, 0);
    function query(path, o) { return { path, o,
      orderBy: (f, dir) => query(path, { ...o, order: f, desc: dir === 'desc' }), limit: n => query(path, { ...o, lim: n }),
      get: async () => { const r = await window.__fsList(path, o.order || '', !!o.desc, o.lim || 0); if (r.error) throw fail(r); const docs = r.rows.map(x => snapOf(path + '/' + x.id, x.data)); return { docs, empty: !docs.length, size: docs.length, forEach: f => docs.forEach(f) }; } }; }
    function ref(path) { const isDoc = path.split('/').length % 2 === 0;
      if (!isDoc) return { path, doc: d => ref(path + '/' + d), orderBy: (f, dir) => query(path, { order: f, desc: dir === 'desc' }).orderBy(f, dir), limit: n => query(path, { lim: n }), get: () => query(path, {}).get(),
        add: async data => { const r = await window.__fsSet(path + '/' + Math.random().toString(36).slice(2), wire(data), false); if (r.error) throw fail(r); } };
      return { path, id: path.split('/').pop(), collection: c => ref(path + '/' + c),
        get: async () => { const r = await window.__fsGet(path); if (r.error) throw fail(r); return snapOf(path, r.data); },
        set: async (data, o) => { const r = await window.__fsSet(path, wire(data), !!(o && o.merge)); if (r.error) throw fail(r);
          // A listener hears a write again only when the server filled something in (a server timestamp): otherwise the local echo equals the confirmed data and is not billed.
          if (JSON.stringify(wire(data)).indexOf('"__ts":true') >= 0) notify(path); },
        delete: async () => { const r = await window.__fsDelete(path); if (r.error) throw fail(r); notify(path); },
        onSnapshot: (cb, err) => { (listeners[path] = listeners[path] || []).push(cb); window.__fsGet(path).then(r => { if (r.error) { if (err) err(fail(r)); } else cb(snapOf(path, r.data)); }); return () => { listeners[path] = (listeners[path] || []).filter(x => x !== cb); }; } }; }
    const fs = () => ({ collection: c => ref(c) });
    fs.FieldValue = { delete: () => del, serverTimestamp: () => stampMark };
    const authCbs = [];
    const provs = u => u.providers || [u.provider];
    const mk = u => u && ({ uid: u.uid, email: u.email || null, displayName: u.displayName || null, emailVerified: u.emailVerified === true,
      providerData: provs(u).map(p => ({ providerId: p, uid: (p === 'password' ? u.email : (u.identity || u.uid) + '-' + p), email: u.email || null, displayName: u.displayName || null })),
      getIdTokenResult: async () => ({ authTime: new Date(await window.__fsAuthTime()).toISOString() }),
      delete: async () => { const r = await window.__fsAuthDelete(); if (r.error) throw fail(r); auth.currentUser = null; authCbs.forEach(cb => cb(null)); },
      // Linking never changes the uid and does not fire the auth-state callbacks (as in the real SDK); the current user object is refreshed.
      linkWithPopup: async provider => { rec(provider); const r = await window.__fsPopup('link', provider.providerId); if (r.error) throw popupErr(r.error, provider); const l = await window.__fsLink(provider.providerId, r.account); if (l.error) throw fail(l); auth.currentUser = mk(l.user); return { user: auth.currentUser }; },
      linkWithCredential: async cred => { const l = await window.__fsLink(cred.providerId, cred.__acct); if (l.error) throw fail(l); auth.currentUser = mk(l.user); return { user: auth.currentUser }; } });
    const rec = p => { (window.__qaProviders = window.__qaProviders || []).push({ providerId: p.providerId, scopes: p.scopes.slice(), params: { ...p.params } }); };
    const popupErr = (e, provider) => { const x = new Error(e.message || e.code); x.code = e.code; if (e.email) x.email = e.email; if (e.account) x.credential = { providerId: provider.providerId, __acct: e.account }; return x; };
    const setUser = u => { auth.currentUser = mk(u); authCbs.forEach(cb => cb(auth.currentUser)); return { user: auth.currentUser }; };
    class Provider { constructor(id) { this.providerId = id; this.scopes = []; this.params = {}; } addScope(s) { this.scopes.push(s); return this; } setCustomParameters(o) { this.params = { ...this.params, ...o }; return this; } }
    const auth = { currentUser: null,
      onAuthStateChanged(cb) { authCbs.push(cb); setTimeout(async () => { const u = await window.__fsAuthInit(); auth.currentUser = mk(u); cb(auth.currentUser); }, 30); },
      async signOut() { auth.currentUser = null; await window.__fsAuthSet(null); authCbs.forEach(cb => cb(null)); },
      async signInWithPopup(provider) { rec(provider); const r = await window.__fsPopup('signin', provider.providerId); if (r.error) throw popupErr(r.error, provider); const s = await window.__fsSignInIdentity(provider.providerId, r.account); return setUser(s.user); },
      async signInWithCredential(cred) { const s = await window.__fsSignInIdentity(cred.providerId, cred.__acct); return setUser(s.user); },
      signInWithRedirect: () => { window.__qaRedirectCalls = (window.__qaRedirectCalls || 0) + 1; return Promise.reject(new Error('redirect sign-in must not be used')); },
      async signInWithEmailAndPassword(email, pw) { const r = await window.__fsEmail('signin', email, pw); if (r.error) throw fail(r); return setUser(r.user); },
      async createUserWithEmailAndPassword(email, pw) { const r = await window.__fsEmail('signup', email, pw); if (r.error) throw fail(r); return setUser(r.user); } };
    auth.GoogleAuthProvider = class extends Provider { constructor() { super('google.com'); } };
    auth.GithubAuthProvider = class extends Provider { constructor() { super('github.com'); } };
    window.__qaAuth = { async signIn(u) { await window.__fsAuthSet(u); auth.currentUser = mk(u); authCbs.forEach(cb => cb(auth.currentUser)); }, signOut: () => auth.signOut() };
    const authFn = () => auth; authFn.GoogleAuthProvider = auth.GoogleAuthProvider; authFn.GithubAuthProvider = auth.GithubAuthProvider;
    window.firebase = { apps: [], initializeApp() { const a = {}; window.firebase.apps.push(a); return a; }, auth: authFn, firestore: fs };
  })();` }));
  await page.route(/gstatic\.com\/firebasejs\/.*firebase-(auth|firestore)-compat/, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route(/(googleapis\.com|firebaseio\.com|firebaseapp\.com|jsdelivr\.net)/, r => r.abort());
}

// A fresh, isolated app session. opts: csv (path), feed (object|false), width/height,
// types (inject typeTable), offline, init (fn run before load)
async function session(opts = {}) {
  const b = await launch();
  const base = IS_WEBKIT && !opts.url ? await webBase() : '';
  const ctx = await b.newContext({ viewport: { width: opts.width || 430, height: opts.height || 932 }, hasTouch: opts.touch !== false, deviceScaleFactor: 2, colorScheme: opts.colorScheme || 'dark', ...(base || opts.blockServiceWorkers ? { serviceWorkers: 'block' } : {}) });
  await ctx.addInitScript(() => { window.__noImportGate = true; });
  if (!opts.firstRun) await ctx.addInitScript(() => { window.__noFirstRun = true; });   // the first-run page covers the app; Task 3's FIRSTRUN tests turn it on with session({ firstRun: true })
  if (opts.init) await ctx.addInitScript(opts.init);
  if (!opts.collapsedTail) await ctx.addInitScript(() => { window.__todayTailOpen = true; });   // the long tail of Today is collapsed for users; most tests read it, the UI suite turns this off to see the default   // tests feed synthetic reads; IMPCHK-01 turns the import gate on
  if (!opts.sentenceCase) await ctx.addInitScript(() => { window.__keepCaps = true; });   // tests read the source wording; CASE-01 turns the display layer on
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  if (base) await page.route(/\/data\/[^/?]+\.json/, r => r.abort());
  if (opts.feed !== undefined) {
    await page.route('**/data/feed.json*', r => opts.feed ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.feed) }) : r.abort());
  }
  if (opts.promo !== undefined) {
    await page.route('**/data/promo_codes.json*', r => opts.promo ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.promo) }) : r.abort());
  }
  await page.route('**/data/feed_check.json*', r => r.abort());
  // QA runs signed-out of a cloud that is not there: with real network access Firebase would load and its signed-out callback empties the roster mid-test.
  if (opts.cloud) {
    await installCloud(page, opts.cloud);
  } else
  await page.route(/(gstatic\.com|googleapis\.com|firebaseio\.com|firebaseapp\.com|jsdelivr\.net)/, r => r.abort());
  if (opts.offline) await ctx.setOffline(true);
  const t0 = Date.now();
  await page.goto(opts.url || (base ? base + 'index.html' : PAGE), { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.length > 100, null, { timeout: 15000 }).catch(() => {});
  // PvPoke tiers change every week; pin them so a data refresh cannot move the expected results of these tests.
  if (opts.pinTiers !== false) {
    try {
      const pins = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pvp_tiers_pinned.json'), 'utf8'));
      await page.evaluate(p => { const M = window.PokemonMechanics; if (!M) return; [['great', 'PVP_TIER_GREAT'], ['ultra', 'PVP_TIER_ULTRA']].forEach(([k, n]) => { const t = M[n]; if (!t) return; Object.keys(p[k]).forEach(sp => { if (t[sp]) Object.assign(t[sp], p[k][sp]); }); }); }, pins);
    } catch (e) { console.error("pinTiers failed:", e.message); }
  }
  const s = { ctx, page, errors, logs, loadMs: Date.now() - t0 };
  // Tab bar: Today / Roster / PvP / Recs, then More (Settings = HOME, Raid, Intel, Attack, Log...).
  const BAR = { TODAY: 'Today', ROSTER: 'Roster', PVP: 'PvP', RECS: 'Recs' };
  const MORE = { HOME: 'Settings', RAID: 'Raid counters', BULK: 'Bulk update', INTEL: 'Collection intel', ATTACK: 'Attackers', LOG: 'Progress log', TOOLS: 'Rename & search', BESTIV: 'Best IV', DITTO: 'Ditto ranking', KEEP: 'Keeper review' };
  s.go = async label => {
    if (MORE[label]) { await page.getByText('More', { exact: true }).last().click(); await page.waitForTimeout(350); await page.locator('[role=menuitem][aria-label="' + MORE[label] + '"]').last().click(); await page.waitForTimeout(600); return; }
    const t = page.getByText(BAR[label] || label, { exact: true }).last(); await t.scrollIntoViewIfNeeded().catch(() => {}); await t.click(); await page.waitForTimeout(500);
  };
  s.text = () => page.evaluate(() => document.body.innerText);
  // Importing over an existing roster asks first; tests that just want the data in confirm it.
  s.load = async (csv, opts = {}) => {
    await page.setInputFiles('input[type=file][accept=".csv"]', csv); await page.waitForTimeout(700);
    if (opts.noConfirm) return;
    const b = page.getByText('REPLACE', { exact: true }); if (await b.count()) { await b.first().click(); await page.waitForTimeout(500); }
  };
  s.logic = (fn, arg) => withLogic(page, fn, arg);
  s.state = () => s.logic(l => JSON.parse(JSON.stringify(l.state, (kk, v) => (typeof v === 'function' ? undefined : v))));
  s.set = async patch => (await s.logic((l, p) => { l.setState(p); return true; }, patch)) === true;
  s.call = (method, ...args) => s.logic((l, [mth, a]) => (l[mth] ? l[mth](...a) : undefined), [method, args]);
  s.close = () => ctx.close();
  return s;
}
module.exports = { T, expect, skip, session, launch, close, results, REPO, PAGE, IS_WEBKIT, touch, withLogic };
