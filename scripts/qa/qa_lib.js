// Shared helpers for the QA suites: test registry, fresh app sessions, navigation.
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
  const ctx = await b.newContext({ viewport: { width: opts.width || 430, height: opts.height || 932 }, hasTouch: opts.touch !== false, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  if (opts.feed !== undefined) {
    await page.route('**/data/feed.json*', r => opts.feed ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(opts.feed) }) : r.abort());
  }
  await page.route('**/data/feed_check.json*', r => r.abort());
  if (opts.offline) await ctx.setOffline(true);
  const t0 = Date.now();
  await page.goto(opts.url || PAGE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.length > 100, null, { timeout: 15000 }).catch(() => {});
  const s = { ctx, page, errors, logs, loadMs: Date.now() - t0 };
  // Tab bar: Today / Roster / PvP / Raid, then More (Home, Recs, Intel, Attack, Log).
  const BAR = { TODAY: 'Today', ROSTER: 'Roster', PVP: 'PvP', RAID: 'Raid' };
  const MORE = { HOME: 'Home & settings', RECS: 'Recommendations', INTEL: 'Collection intel', ATTACK: 'Attackers', LOG: 'Progress log' };
  s.go = async label => {
    if (MORE[label]) { await page.getByText('More', { exact: true }).last().click(); await page.waitForTimeout(350); await page.getByText(MORE[label], { exact: true }).last().click(); await page.waitForTimeout(600); return; }
    const t = page.getByText(BAR[label] || label, { exact: true }).last(); await t.scrollIntoViewIfNeeded().catch(() => {}); await t.click(); await page.waitForTimeout(500);
  };
  s.text = () => page.evaluate(() => document.body.innerText);
  s.load = async csv => { await page.setInputFiles('input[type=file][accept=".csv"]', csv); await page.waitForTimeout(900); };
  s.state = () => page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.state) return JSON.parse(JSON.stringify(f.stateNode.logic.state, (kk, v) => (typeof v === 'function' ? undefined : v))); } return null; });
  s.set = patch => page.evaluate(p => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.setState) { f.stateNode.logic.setState(p); return true; } } return false; }, patch);
  s.call = (method, ...args) => page.evaluate(([mth, a]) => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic[mth]) return f.stateNode.logic[mth](...a); } return undefined; }, [method, args]);
  s.close = () => ctx.close();
  return s;
}
module.exports = { T, expect, skip, session, launch, close, results, REPO, PAGE };
