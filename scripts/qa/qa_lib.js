// Shared helpers for the QA suites: test registry, fresh app sessions, navigation.
const fs = require('fs');
const path = require('path');
const pw = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright'));
const chromium = pw[process.env.QA_BROWSER || 'chromium'];
const REPO = path.join(__dirname, '..', '..');
const PAGE = 'file://' + path.join(REPO, 'index.html');
const results = [];
let current = null;

class Skip extends Error {}
const expect = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
const skip = msg => { throw new Skip(msg); };

async function T(id, area, name, fn, sev = 'normal') {
  const t0 = Date.now();
  const rec = { id, area, name, sev, status: 'pass', note: '', ms: 0 };
  try { const n = await fn(); if (typeof n === 'string') rec.note = n; }
  catch (e) { if (e instanceof Skip) { rec.status = 'skip'; rec.note = e.message; } else { rec.status = 'fail'; rec.note = String(e.message || e).split('\n')[0].slice(0, 300); } }
  rec.ms = Date.now() - t0; results.push(rec);
  process.stdout.write((rec.status === 'pass' ? '.' : rec.status === 'skip' ? 's' : 'F'));
  return rec;
}

let browser;
async function launch() {
  if (browser) return browser;
  const o = { args: ['--no-sandbox'] };
  if (process.env.PW_CHROMIUM) o.executablePath = process.env.PW_CHROMIUM;
  browser = await chromium.launch(o);
  return browser;
}
async function close() { if (browser) await browser.close(); }

// A fresh, isolated app session. opts: csv (path), feed (object|false), width/height,
// types (inject typeTable), offline, init (fn run before load)
async function session(opts = {}) {
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: opts.width || 430, height: opts.height || 932 }, hasTouch: opts.touch !== false, deviceScaleFactor: 2, colorScheme: opts.colorScheme || 'dark' });
  await ctx.addInitScript(() => { window.__noImportGate = true; });   // tests feed synthetic reads; IMPCHK-01 turns the import gate on
  if (!opts.sentenceCase) await ctx.addInitScript(() => { window.__keepCaps = true; });   // tests read the source wording; CASE-01 turns the display layer on
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  if (opts.feed !== undefined) {
    await page.route('**/data/feed.json*', r => opts.feed ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.feed) }) : r.abort());
  }
  await page.route('**/data/feed_check.json*', r => r.abort());
  // QA runs signed-out of a cloud that is not there: with real network access Firebase would load and its signed-out callback empties the roster mid-test.
  if (opts.cloud) {
    // A tiny in-memory stand-in for Firebase Auth + Firestore, backed by opts.cloud.store (shared between sessions to model two devices).
    const C = opts.cloud; C.store = C.store || {}; C.writes = C.writes || [];
    await page.exposeFunction('__fsGet', p => C.store[p] === undefined ? null : JSON.parse(JSON.stringify(C.store[p])));
    await page.exposeFunction('__fsSet', (p, data, merge) => {
      if (C.failWrites) return { error: 'permission-denied (QA)' };
      const cur = merge && C.store[p] ? C.store[p] : {};
      const next = { ...cur };
      Object.keys(data).forEach(k => { if (data[k] && data[k].__del) delete next[k]; else next[k] = data[k]; });
      C.store[p] = next; C.writes.push({ p, bytes: JSON.stringify(next).length, keys: Object.keys(data) });
      return { ok: true };
    });
    await page.route(/gstatic\.com\/firebasejs\/.*firebase-app-compat/, r => r.fulfill({ contentType: 'application/javascript', body: `(function(){
      const listeners = {};
      const del = { __del: true };
      function ref(path) { return { path, collection: c => ref(path + '/' + c), doc: d => ref(path + '/' + d),
        get: async () => { const d = await window.__fsGet(path); return { exists: d !== null, data: () => d }; },
        add: async data => { const r = await window.__fsSet(path + '/' + Math.random().toString(36).slice(2), data, false); return r; },
        set: async (data, o) => { const r = await window.__fsSet(path, JSON.parse(JSON.stringify(data, (k, v) => (v && v.__del) ? { __del: true } : v)), !!(o && o.merge)); if (r && r.error) throw new Error(r.error);
          (listeners[path] || []).forEach(cb => window.__fsGet(path).then(d => cb({ exists: d !== null, data: () => d, metadata: { hasPendingWrites: false } }))); },
        onSnapshot: (cb, err) => { (listeners[path] = listeners[path] || []).push(cb); window.__fsGet(path).then(d => cb({ exists: d !== null, data: () => d, metadata: { hasPendingWrites: false } })); return () => { listeners[path] = (listeners[path] || []).filter(x => x !== cb); }; },
        orderBy: () => ref(path), limit: () => ref(path) }; }
      const fs = () => ({ collection: c => ref(c) });
      fs.FieldValue = { delete: () => del };
      const auth = { currentUser: null, onAuthStateChanged(cb) { setTimeout(() => { auth.currentUser = { uid: 'qa-user', email: 'qa@example.test' }; cb(auth.currentUser); }, 30); }, signOut() { auth.currentUser = null; }, signInWithEmailAndPassword: async () => {}, createUserWithEmailAndPassword: async () => {} };
      window.firebase = { apps: [], initializeApp() { const a = {}; window.firebase.apps.push(a); return a; }, auth: () => auth, firestore: fs };
    })();` }));
    await page.route(/gstatic\.com\/firebasejs\/.*firebase-(auth|firestore)-compat/, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route(/(googleapis\.com|firebaseio\.com|firebaseapp\.com|jsdelivr\.net)/, r => r.abort());
  } else
  await page.route(/(gstatic\.com|googleapis\.com|firebaseio\.com|firebaseapp\.com|jsdelivr\.net)/, r => r.abort());
  if (opts.offline) await ctx.setOffline(true);
  const t0 = Date.now();
  await page.goto(opts.url || PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.length > 100, null, { timeout: 15000 }).catch(() => {});
  // PvPoke tiers change every week; pin them so a data refresh cannot move the expected results of these tests.
  if (opts.pinTiers !== false) {
    try {
      const pins = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'pvp_tiers_pinned.json'), 'utf8'));
      await page.evaluate(p => { const M = window.PokemonMechanics; if (!M) return; [['great', 'PVP_TIER_GREAT'], ['ultra', 'PVP_TIER_ULTRA']].forEach(([k, n]) => { const t = M[n]; if (!t) return; Object.keys(p[k]).forEach(sp => { if (t[sp]) Object.assign(t[sp], p[k][sp]); }); }); }, pins);
    } catch (e) { console.error("pinTiers failed:", e.message); }
  }
  const s = { ctx, page, errors, logs, loadMs: Date.now() - t0 };
  // Tab bar: Today / Roster / PvP / Raid, then More (Home, Recs, Intel, Attack, Log).
  const BAR = { TODAY: 'Today', HOME: 'Home', ROSTER: 'Roster', PVP: 'PvP', RECS: 'Recs' };
  const MORE = { RAID: 'Raid counters', BULK: 'Bulk update', INTEL: 'Collection intel', ATTACK: 'Attackers', LOG: 'Progress log', TOOLS: 'Rename & search' };
  s.go = async label => {
    if (MORE[label]) { await page.getByText('More', { exact: true }).last().click(); await page.waitForTimeout(350); await page.getByText(MORE[label], { exact: true }).last().click(); await page.waitForTimeout(600); return; }
    const t = page.getByText(BAR[label] || label, { exact: true }).last(); await t.scrollIntoViewIfNeeded().catch(() => {}); await t.click(); await page.waitForTimeout(500);
  };
  s.text = () => page.evaluate(() => document.body.innerText);
  // Importing over an existing roster asks first; tests that just want the data in confirm it.
  s.load = async (csv, opts = {}) => {
    await page.setInputFiles('input[type=file][accept=".csv"]', csv); await page.waitForTimeout(700);
    if (opts.noConfirm) return;
    const b = page.getByText('REPLACE', { exact: true }); if (await b.count()) { await b.first().click(); await page.waitForTimeout(500); }
  };
  s.state = () => page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.state) return JSON.parse(JSON.stringify(f.stateNode.logic.state, (kk, v) => (typeof v === 'function' ? undefined : v))); } return null; });
  s.set = patch => page.evaluate(p => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.setState) { f.stateNode.logic.setState(p); return true; } } return false; }, patch);
  s.call = (method, ...args) => page.evaluate(([mth, a]) => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic[mth]) return f.stateNode.logic[mth](...a); } return undefined; }, [method, args]);
  s.close = () => ctx.close();
  return s;
}
module.exports = { T, expect, skip, session, launch, close, results, REPO, PAGE };
