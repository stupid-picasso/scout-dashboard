// QA suite D: automated accessibility (axe-core) on every screen. Fails on serious/critical issues.
const fs = require('fs'), path = require('path');
const { T, expect, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const AXE = fs.readFileSync(path.join(REPO, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const SCREENS = ['TODAY', 'ROSTER', 'PVP', 'RAID', 'HOME', 'RECS', 'INTEL', 'ATTACK', 'LOG'];

module.exports = async function suiteD() {
  const s = await session({ feed: false });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(2500);
  const all = {};
  for (const scr of SCREENS) {
    await T('AXE-' + scr, 'Accessibility', `axe-core: no serious or critical violations on ${scr}`, async () => {
      await s.go(scr); await s.page.waitForTimeout(800);
      await s.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE);
      const res = await s.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help })));
      all[scr] = res;
      const bad = res.filter(v => v.impact === 'serious' || v.impact === 'critical');
      expect(bad.length === 0, bad.map(v => `${v.id}(${v.n})`).join(', '));
      return res.length + ' lower-impact issues: ' + res.map(v => v.id).join(',');
    }, 'high');
  }
  const axeNow = async () => { await s.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE); return s.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.nodes.length + ')')); };
  await T('AXE-MORE', 'Accessibility', 'axe-core: the More menu is clean', async () => { await s.go('TODAY'); await s.page.getByText('More', { exact: true }).last().click(); await s.page.waitForTimeout(500); const bad = await axeNow(); await s.page.mouse.click(215, 120); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('AXE-DETAIL', 'Accessibility', 'axe-core: the detail sheet (with the Mega card) is clean', async () => { await s.go('ROSTER'); const st = await s.state(); const mon = st.roster.find(p => p.name === 'Beedrill'); await s.page.evaluate(m => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.openDetail) { f.stateNode.logic.openDetail(m); return; } } }, mon); await s.page.waitForTimeout(900); const bad = await axeNow(); await s.call('closeDetail'); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('AXE-SELECT', 'Accessibility', 'axe-core: roster select mode with a selection and the bulk bar is clean', async () => { await s.go('ROSTER'); await s.page.getByRole('button', { name: 'Select', exact: true }).click(); await s.page.locator('[data-swipe-row]').nth(0).click(); await s.page.waitForTimeout(400); const bad = await axeNow(); await s.page.getByRole('button', { name: 'Done', exact: true }).click(); expect(bad.length === 0, bad.join(',')); }, 'high');
  await T('KEY-01', 'Accessibility', 'Keyboard only: Tab reaches the tab bar and Enter switches screens', async () => { await s.go('TODAY'); await s.page.evaluate(() => document.activeElement && document.activeElement.blur()); let hit = false; for (let i = 0; i < 80 && !hit; i++) { await s.page.keyboard.press('Tab'); hit = await s.page.evaluate(() => (document.activeElement.getAttribute('aria-label') || '') === 'Roster'); } expect(hit, 'never reached the Roster tab'); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(500); expect(/POK[ÉE]MON|Pok[ée]mon/.test(await s.text()) && /Sort/.test(await s.text())); }, 'high');
  await T('KEY-02', 'Accessibility', 'Keyboard only: a roster row opens its detail with Enter and Escape-free close works', async () => { await s.go('ROSTER'); const row = s.page.locator('[data-swipe-row]').first(); await row.focus(); await s.page.keyboard.press('Enter'); await s.page.waitForTimeout(700); expect(/POWER UP|APPRAISAL|EVOLUTION|MEGA/i.test(await s.text())); await s.call('closeDetail'); });
  await T('KEY-03', 'Accessibility', 'Every control on the tab bar and header has an accessible name', async () => { const n = await s.page.evaluate(() => [...document.querySelectorAll('header button, header label, nav button')].filter(b => !(b.getAttribute('aria-label') || b.innerText || '').trim()).length); expect(n === 0, n + ' unnamed controls'); });
  fs.writeFileSync(process.env.QA_AXE_OUT || '/tmp/qa/axe.json', JSON.stringify(all, null, 1));
  await s.close();
  // Light theme: same checks, on every tab, with the display layer (sentence case) switched on.
  const sl = await session({ feed: false, colorScheme: 'light', sentenceCase: true });
  await sl.load(QA); await sl.call('recalculateAllRanks'); await sl.page.waitForTimeout(2500);
  await T('THEME-01', 'Theme', 'The header sun button cycles Auto, Light, Dark; the phone setting drives Auto and the choice is remembered', async () => {
    const th = () => sl.page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, ls: localStorage.getItem('scout.theme'), label: (document.querySelector('header button[aria-label^="Theme"]') || {}).ariaLabel }));
    const tap = async () => { await sl.page.locator('header button[aria-label^="Theme"]').click(); await sl.page.waitForTimeout(250); return th(); };
    await sl.call('setThemePref', 'auto'); await sl.page.waitForTimeout(250);
    let t = await th();
    expect(t.attr === null && /238, 245, 234/.test(t.bg) && /Auto/.test(t.label), 'auto in a light phone is light: ' + JSON.stringify(t));
    t = await tap(); expect(t.attr === 'light' && /Light/.test(t.label) && t.ls === 'light', 'first tap is Light: ' + JSON.stringify(t));
    expect(/Theme: Light/.test(await sl.text()), 'a note says which mode it landed on');
    t = await tap(); expect(t.attr === 'dark' && /12, 27, 31/.test(t.bg) && /Dark/.test(t.label) && t.ls === 'dark', 'second tap is Dark: ' + JSON.stringify(t));
    t = await tap(); expect(t.attr === null && t.ls === 'auto' && /Auto/.test(t.label), 'third tap is Auto again: ' + JSON.stringify(t));
  }, 'high');
  await T('CASE-01', 'Theme', 'Labels written in capitals are shown in sentence case, acronyms kept', async () => {
    await sl.go('HOME'); await sl.page.waitForTimeout(900);
    const t = await sl.text();
    expect(/Refresh everything/.test(t) && /Power up/.test(t) && !/POWER UP/.test(t) && !/REFRESH EVERYTHING/.test(t), 'Home labels: ' + t.slice(0, 300));
    await sl.go('RAID'); await sl.page.waitForTimeout(700);
    const r = await sl.text();
    expect(/Boss types \(pick up to 2\)/.test(r) && /Raid counters/.test(r) && /Fire/.test(r) && !/BOSS TYPES/.test(r), 'Raid labels');
    await sl.go('ROSTER'); await sl.page.waitForTimeout(700);
    const o = await sl.text();
    expect(/CP/.test(o) && /\bPvP ready\b/.test(o), 'CP stays capitalised, PvP is PvP');
  }, 'high');
  for (const scr of SCREENS) {
    await T('AXE-LIGHT-' + scr, 'Accessibility', `axe-core (light theme): no serious or critical violations on ${scr}`, async () => {
      await sl.go(scr); await sl.page.waitForTimeout(800);
      await sl.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE);
      const res = await sl.page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.nodes.length + ')'));
      expect(res.length === 0, res.join(', '));
    }, 'high');
  }
  await sl.close();

  // ------------------------------------------------------------------ CLOUD SYNC against an in-memory Firebase stand-in
  const cloud = { store: {}, writes: [] };
  let c1 = await session({ feed: false, cloud });
  await c1.page.waitForTimeout(1500);
  await T('SYNC-01', 'Cloud', 'Signed in: an import is written to the cloud document once, under the 1 MiB limit, and shows as saved or loaded, never an error', async () => {
    await c1.load(QA); await c1.page.waitForTimeout(3500);
    for (let i = 0; i < 20 && !/^(saved|loaded)/.test((await c1.state()).syncStatus || ''); i++) await c1.page.waitForTimeout(500);
    const st = await c1.state(); const doc = cloud.store['scoutUsers/qa-user'];
    expect(st.cloudUser && st.cloudUser.uid === 'qa-user', 'not signed in');
    expect(doc && cloud.writes.length >= 1, 'nothing written');
    expect(cloud.writes.every(w => w.bytes < 1048576), 'a write was over 1 MiB');
    expect(!/error|TOO BIG/.test(st.syncStatus || ''), 'status: ' + st.syncStatus);
    expect(cloud.denied.length === 0, 'the stand-in (same allow-list as firestore.rules) refused: ' + JSON.stringify(cloud.denied[0]));
  }, 'high');
  await T('SYNC-02', 'Cloud', 'A second device signing in to the same account gets the same Pokemon', async () => {
    const n1 = ((await c1.state()).roster || []).length;
    const c2 = await session({ feed: false, cloud }); await c2.page.waitForTimeout(2500);
    const st2 = await c2.state();
    expect(n1 > 0 && (st2.roster || []).length === n1, 'device 1 ' + n1 + ' vs device 2 ' + (st2.roster || []).length);
    expect(c2.errors.length === 0, c2.errors[0]);
    await c2.close();
  }, 'high');
  await T('SYNC-03', 'Cloud', 'API keys and the GitHub token never reach the cloud document, its snapshots or the device copy, also in private mode', async () => {
    const SECRET = /AIzaQAKEY|ghp_QAKEY|qa-endpoint\.example/;
    await c1.set({ geminiKeys: ['AIzaQAKEY111111111111111111111111111'], geminiKey: 'AIzaQAKEY111111111111111111111111111', githubToken: 'ghp_QAKEY', apiEndpoint: 'https://qa-endpoint.example/v1' });
    await c1.call('pushCloud'); await c1.page.waitForTimeout(1500);
    await c1.call('autoSnapshot', 'manual', { force: true }); await c1.page.waitForTimeout(1200);
    expect(Object.keys(cloud.store).some(k => /\/snapshots\//.test(k)), 'no snapshot was written to test against');
    const txt = JSON.stringify(cloud.store || {});
    expect(!SECRET.test(txt), 'a secret was written to the cloud (document or snapshot)');
    expect(cloud.denied.length === 0, 'refused write: ' + JSON.stringify(cloud.denied[0]));
    const local = await c1.page.evaluate(() => Object.keys(localStorage).filter(k => /^scout\.local\.v1/.test(k)).map(k => localStorage.getItem(k)).join(''));
    expect(local.length > 0 && !SECRET.test(local), 'a secret is in the device copy (or there is no device copy)');
    // Private mode: localStorage refuses every write, so the keys have nowhere to live except memory. They must still not go up.
    const priv = { store: {}, writes: [] };
    const p1 = await session({ feed: false, cloud: priv, init: () => { Storage.prototype.setItem = function () { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); }; } });
    await p1.page.waitForTimeout(1500);
    await p1.load(QA); await p1.page.waitForTimeout(2500);
    await p1.set({ geminiKeys: ['AIzaQAKEY111111111111111111111111111'], geminiKey: 'AIzaQAKEY111111111111111111111111111', githubToken: 'ghp_QAKEY', apiEndpoint: 'https://qa-endpoint.example/v1' });
    await p1.call('pushCloud'); await p1.page.waitForTimeout(1500);
    await p1.call('autoSnapshot', 'manual', { force: true }); await p1.page.waitForTimeout(1200);
    expect(priv.writes.length >= 1, 'nothing reached the stand-in, so the check proves nothing');
    expect(!SECRET.test(JSON.stringify(priv.store)), 'a secret was written to the cloud in private mode');
    expect(priv.denied.length === 0, 'refused write: ' + JSON.stringify(priv.denied[0]));
    await p1.close();
  }, 'high');
  await T('SYNC-04', 'Cloud', 'A rejected write shows an error, keeps the data, and saves once the cloud accepts again', async () => {
    const before = ((await c1.state()).roster || []).length;
    cloud.failWrites = true;
    await c1.set({ cutTarget: 123 }); await c1.call('pushCloud'); await c1.page.waitForTimeout(1500);
    let st = await c1.state();
    expect(/error/.test(st.syncStatus || ''), 'status: ' + st.syncStatus);
    expect((st.roster || []).length === before, 'roster changed after a failed write');
    cloud.failWrites = false;
    await c1.call('pushCloud'); await c1.page.waitForTimeout(1500);
    st = await c1.state();
    expect(/^(saved|loaded)/.test(st.syncStatus || '') && cloud.store['scoutUsers/qa-user'].cutTarget === 123, 'did not recover: ' + st.syncStatus);
  }, 'high');
  await c1.close();

  // ------------------------------------------------------------------ QUOTA COUNTERS (B.5): exact read/write/delete counts against the stand-in
  const zero = C => { C.stats = {}; C.writes.length = 0; C.denied.length = 0; C.log = []; };
  const n = (C, col, f) => ((C.stats || {})[col] || {})[f] || 0;
  const savedOk = async c => { for (let i = 0; i < 24 && !/^(saved|loaded)/.test((await c.state()).syncStatus || ''); i++) await c.page.waitForTimeout(500); };
  const hours = h => h * 3600 * 1000;
  const snapIds = C => Object.keys(C.store).filter(k => /^scoutUsers\/qa-user\/snapshots\//.test(k)).map(k => k.split('/').pop()).sort();
  const K = { store: {}, writes: [] };
  const k1 = await session({ feed: false, cloud: K });
  await k1.page.waitForTimeout(1500);
  await k1.load(QA); await savedOk(k1); await k1.page.waitForTimeout(2500);
  await k1.call('autoSnapshot', 'manual', { force: true }); await k1.page.waitForTimeout(1800);
  const N = ((await k1.state()).roster || []).length + ((await k1.state()).addedPokemon || []).length;

  await T('SYNC-05', 'Quota', 'A signed-in launch with a roster costs exactly 1 read of scoutUsers/{uid}, no gameData, sprites or snapshot reads and no writes while the last snapshot is under 6 hours old (the clock survives a reload and a new browser)', async () => {
    const doc = K.store['scoutUsers/qa-user'];
    expect(N > 0 && snapIds(K).length >= 1 && typeof doc.lastSnapshotAt === 'number', 'setup: ' + N + ' pokemon, ' + snapIds(K).length + ' snapshots, lastSnapshotAt ' + typeof doc.lastSnapshotAt);
    const check = (where) => {
      const got = { userReads: n(K, 'scoutUsers', 'reads'), userWrites: n(K, 'scoutUsers', 'writes'), gameData: n(K, 'gameData', 'reads'), sprites: n(K, 'sprites', 'reads'), snapR: n(K, 'snapshots', 'reads'), snapW: n(K, 'snapshots', 'writes'), snapD: n(K, 'snapshots', 'deletes'), deletes: n(K, 'scoutUsers', 'deletes') };
      expect(JSON.stringify(got) === JSON.stringify({ userReads: 1, userWrites: 0, gameData: 0, sprites: 0, snapR: 0, snapW: 0, snapD: 0, deletes: 0 }), where + ': ' + JSON.stringify(got));
      expect(K.denied.length === 0, where + ': refused ' + JSON.stringify(K.denied[0]));
    };
    zero(K); await k1.page.reload({ waitUntil: 'load' }); await k1.page.waitForTimeout(4500);
    expect(((await k1.state()).roster || []).length + ((await k1.state()).addedPokemon || []).length === N, 'roster did not load');
    check('reload');
    zero(K); const k2 = await session({ feed: false, cloud: K }); await k2.page.waitForTimeout(4500);
    expect(((await k2.state()).roster || []).length + ((await k2.state()).addedPokemon || []).length === N, 'new browser: roster did not load');
    check('new browser (clock only in the user document)');
    await k2.close();
  }, 'high');

  await T('SYNC-06', 'Quota', 'A snapshot older than 6 hours writes exactly one snapshot, reads no snapshot body, and keeps the five newest by deleting the oldest by id from the index', async () => {
    K.store['scoutUsers/qa-user'].lastSnapshotAt = Date.now() - hours(7);
    const before = snapIds(K).length;
    zero(K); const k3 = await session({ feed: false, cloud: K }); await k3.page.waitForTimeout(5000);
    expect(n(K, 'snapshots', 'writes') === 1 && n(K, 'snapshots', 'reads') === 0 && n(K, 'snapshots', 'deletes') === 0, 'snapshots ' + JSON.stringify(K.stats.snapshots));
    expect(n(K, 'scoutUsers', 'reads') === 1 && n(K, 'scoutUsers', 'writes') === 1, 'user doc ' + JSON.stringify(K.stats.scoutUsers));
    const w = K.writes.find(x => x.p === 'scoutUsers/qa-user');
    expect(w && w.keys.sort().join() === 'lastSnapshotAt,snapshotIndex', 'the metadata write carried: ' + (w && w.keys.join()));
    const doc = K.store['scoutUsers/qa-user']; const ids = snapIds(K);
    expect(ids.length === before + 1 && doc.snapshotIndex.length === ids.length, 'index ' + doc.snapshotIndex.length + ' vs docs ' + ids.length);
    expect(doc.snapshotIndex[0].id === ids[ids.length - 1] && ['id', 'reason', 'count', 'createdAt'].every(f => doc.snapshotIndex[0][f] !== undefined), 'index entry: ' + JSON.stringify(doc.snapshotIndex[0]));
    await k3.close();
    // A full set of five: the sixth pushes the oldest out, found through the index, with no read.
    Object.keys(K.store).filter(k => /\/snapshots\//.test(k)).forEach(k => delete K.store[k]);
    const idx = [];
    for (let i = 5; i >= 1; i--) { const id = String(1700000000000 + i); K.store['scoutUsers/qa-user/snapshots/' + id] = { reason: 'periodic', createdAt: 1700000000000 + i, pokemonCount: 3, data: {} }; idx.push({ id, reason: 'periodic', count: 3, createdAt: 1700000000000 + i }); }
    K.store['scoutUsers/qa-user'].snapshotIndex = idx; K.store['scoutUsers/qa-user'].lastSnapshotAt = Date.now() - hours(7);
    zero(K); const k4 = await session({ feed: false, cloud: K }); await k4.page.waitForTimeout(5000);
    expect(n(K, 'snapshots', 'writes') === 1 && n(K, 'snapshots', 'deletes') === 1 && n(K, 'snapshots', 'reads') === 0, 'full set: ' + JSON.stringify(K.stats.snapshots));
    expect(snapIds(K).length === 5 && !K.store['scoutUsers/qa-user/snapshots/1700000000001'] && K.store['scoutUsers/qa-user'].snapshotIndex.length === 5, 'oldest not pruned: ' + snapIds(K).join());
    await k4.close();
  }, 'high');

  await T('SYNC-07', 'Quota', 'Restoring from a cloud snapshot still works and reads exactly one snapshot body', async () => {
    const k5 = await session({ feed: false, cloud: K }); await k5.page.waitForTimeout(3500);
    await k5.call('autoSnapshot', 'manual', { force: true }); await k5.page.waitForTimeout(1800);
    const rows = (await k5.state()).snapshots || [];
    const mine = rows.find(r => r.pokemonCount === N);
    expect(mine, 'no snapshot with ' + N + ' Pokemon in the list: ' + JSON.stringify(rows.map(r => r.pokemonCount)));
    await k5.set({ roster: [], addedPokemon: [] }); await k5.page.waitForTimeout(300);
    zero(K);
    await k5.call('restoreSnapshot', mine.id); await k5.page.waitForTimeout(1200);
    expect(n(K, 'snapshots', 'reads') === 1, 'snapshot reads ' + n(K, 'snapshots', 'reads'));
    const pend = (await k5.state()).restorePending;
    expect(pend && pend.count === N, 'nothing pending to restore');
    await k5.call('confirmRestore'); await k5.page.waitForTimeout(2500);
    const st = await k5.state();
    expect((st.roster || []).length + (st.addedPokemon || []).length === N, 'restored ' + ((st.roster || []).length + (st.addedPokemon || []).length) + ' of ' + N);
    expect(n(K, 'snapshots', 'reads') === 1, 'the restore read more snapshot bodies: ' + n(K, 'snapshots', 'reads'));
    expect(K.denied.length === 0, 'refused ' + JSON.stringify(K.denied[0]));
    await k5.close();
  }, 'high');

  await T('SYNC-08', 'Quota', 'The user-document listener is attached only while the page is visible: detached when hidden, re-attached (one read) when visible again, and a launch in a hidden tab attaches nothing', async () => {
    const vis = (pg, hidden) => pg.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
    const listeners = pg => pg.evaluate(() => window.__fsListeners());
    zero(K); const k6 = await session({ feed: false, cloud: K }); await k6.page.waitForTimeout(3500);
    expect(await listeners(k6.page) === 1 && n(K, 'scoutUsers', 'reads') === 1, 'visible launch: listeners ' + await listeners(k6.page) + ', reads ' + n(K, 'scoutUsers', 'reads'));
    await vis(k6.page, true); await k6.page.waitForTimeout(500);
    expect(await listeners(k6.page) === 0, 'still listening while hidden');
    // An edit made while hidden is still saved.
    zero(K); await k6.set({ cutTarget: 77 }); await k6.call('pushCloud'); await k6.page.waitForTimeout(1500);
    expect(K.store['scoutUsers/qa-user'].cutTarget === 77 && n(K, 'scoutUsers', 'reads') === 0, 'a hidden page must still save, and read nothing: reads ' + n(K, 'scoutUsers', 'reads'));
    zero(K); await vis(k6.page, false); await k6.page.waitForTimeout(1500);
    expect(await listeners(k6.page) === 1 && n(K, 'scoutUsers', 'reads') === 1, 'visible again: listeners ' + await listeners(k6.page) + ', reads ' + n(K, 'scoutUsers', 'reads'));
    expect(((await k6.state()).cutTarget) === 77, 'the edit made while hidden was lost');
    await vis(k6.page, true); await vis(k6.page, true); await vis(k6.page, false); await vis(k6.page, false); await k6.page.waitForTimeout(800);
    expect(await listeners(k6.page) === 1, 'repeated events left ' + await listeners(k6.page) + ' listeners');
    await k6.close();
    zero(K);
    const k7 = await session({ feed: false, cloud: K, init: () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); } });
    await k7.page.waitForTimeout(3000);
    expect(await listeners(k7.page) === 0 && n(K, 'scoutUsers', 'reads') === 0, 'hidden launch: listeners ' + await listeners(k7.page) + ', reads ' + n(K, 'scoutUsers', 'reads'));
    await vis(k7.page, false); await k7.page.waitForTimeout(2500);
    expect(await listeners(k7.page) === 1 && n(K, 'scoutUsers', 'reads') === 1 && ((await k7.state()).roster || []).length + ((await k7.state()).addedPokemon || []).length === N, 'shown: listeners ' + await listeners(k7.page));
    await k7.close();
  }, 'high');

  await T('SYNC-09', 'Quota', 'A resource-exhausted write shows a clear status on every page, keeps the data on screen (and a device copy), and saves once the quota is back', async () => {
    const k8 = await session({ feed: false, cloud: K }); await k8.page.waitForTimeout(3500);
    const before = ((await k8.state()).roster || []).length + ((await k8.state()).addedPokemon || []).length;
    K.failWrites = 'quota';
    await k8.set({ cutTarget: 456 }); await k8.call('pushCloud'); await k8.page.waitForTimeout(3800);
    let st = await k8.state();
    expect(/^error: .*quota/i.test(st.syncStatus || '') && /upload when the cloud accepts writes again/i.test(st.syncStatus), 'status: ' + st.syncStatus);
    expect(/quota/i.test(await k8.text()), 'the alert is not shown on the page');
    expect(((st.roster || []).length + (st.addedPokemon || []).length) === before && st.cutTarget === 456, 'data changed after a failed write');
    const local = await k8.page.evaluate(() => Object.keys(localStorage).filter(k => /^scout\.local\.v1/.test(k)).map(k => localStorage.getItem(k)).join(''));
    expect(/"cutTarget":456/.test(local), 'the change is not in the device copy');
    K.failWrites = false; await k8.call('pushCloud'); await k8.page.waitForTimeout(1800);
    st = await k8.state();
    expect(/^(saved|loaded)/.test(st.syncStatus || '') && K.store['scoutUsers/qa-user'].cutTarget === 456, 'did not recover: ' + st.syncStatus);
    await k8.close();
  }, 'high');

  // The device copy must never stop updating silently: a full or blocked store and an oversized blob both raise one notice, and a later good save clears it.
  await T('LSAVE-01', 'Storage', 'A device save that throws (storage full or blocked) shows "Not saved on this device" with an export button, and a later good save clears it', async () => {
    const c = await session({ feed: false }); await c.page.waitForTimeout(2500);
    expect(!(await c.state()).localSaveFailed && !/Not saved on this device/.test(await c.text()), 'notice shown before any failure');
    await c.page.evaluate(() => { const real = Storage.prototype.setItem; window.__realSetItem = real; Storage.prototype.setItem = function (k, v) { if (/^scout\.local\.v1/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); }; });
    await c.set({ cutTarget: 457 }); await c.page.waitForTimeout(2300);
    expect((await c.state()).localSaveFailed === true, 'flag not set after a throwing setItem');
    expect(/Not saved on this device/.test(await c.text()) && /Export a backup/.test(await c.text()), 'notice text is missing');
    const dl = c.page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await c.page.locator('[data-local-save-failed]').getByText('Export a backup').click();
    const d = await dl; expect(d && /professor-backup/.test(d.suggestedFilename()), 'the button did not start the backup export');
    await c.page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
    await c.set({ cutTarget: 458 }); await c.page.waitForTimeout(2300);
    expect(!(await c.state()).localSaveFailed && !/Not saved on this device/.test(await c.text()), 'notice not cleared after a good save');
    await c.close();
  }, 'high');
  await T('LSAVE-03', 'Storage', 'Signed in with sync healthy, the notice also says the cloud copy is the one that counts', async () => {
    const c = await session({ feed: false, cloud: { store: {}, writes: [] } }); await c.page.waitForTimeout(3500);
    expect(/^(saved|loaded|syncing)/.test((await c.state()).syncStatus || ''), 'setup: sync is not healthy: ' + (await c.state()).syncStatus);
    await c.page.evaluate(() => { const real = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (/^scout\.local\.v1/.test(k)) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); }; });
    await c.set({ cutTarget: 459 }); await c.page.waitForTimeout(2300);
    expect(/Not saved on this device\.\s*The cloud copy is the one that counts\./.test(await c.text()), 'signed-in notice text: ' + (await c.text()).slice(0, 120));
    await c.close();
  }, 'high');
  await T('LSAVE-02', 'Storage', 'A blob of 4.2 MB or more is skipped, which raises the same notice; shrinking it clears it', async () => {
    const c = await session({ feed: false }); await c.page.waitForTimeout(2500);
    await c.set({ cutTarget: 457 }); await c.page.waitForTimeout(2300);
    expect(!(await c.state()).localSaveFailed, 'flag set for a normal blob');
    await c.page.evaluate(() => { let t = ''; const r = () => { let x = ''; for (let i = 0; i < 100000; i++) x += String.fromCharCode(33 + Math.floor(Math.random() * 90)); return x; }; for (let i = 0; i < 50; i++) t += r(); window.__big = t; });   // random text does not compress, so the saved blob really passes 4.2 MB
    await c.set({ chatMessages: [{ role: 'user', text: await c.page.evaluate(() => window.__big) }] }); await c.page.waitForTimeout(2300);
    expect(await c.page.evaluate(() => localStorage.getItem('scout.local.v1') === null || localStorage.getItem('scout.local.v1').length < 4200000), 'the oversized blob was written anyway');
    expect((await c.call('buildCloudBlob')) && JSON.stringify(await c.call('buildCloudBlob')).length >= 4200000, 'setup: the blob is under 4.2 MB');
    expect((await c.state()).localSaveFailed === true && /Not saved on this device/.test(await c.text()), 'no notice for an oversized blob');
    await c.set({ chatMessages: [] }); await c.page.waitForTimeout(2300);
    expect(!(await c.state()).localSaveFailed && !/Not saved on this device/.test(await c.text()), 'notice not cleared');
    await c.close();
  }, 'high');

  await T('SYNC-10', 'Quota', 'An account from before the snapshot index builds it once (one listing), then launches read no snapshots', async () => {
    const C = { store: {}, writes: [] };
    const s1 = await session({ feed: false, cloud: C }); await s1.page.waitForTimeout(1500);
    await s1.load(QA); await savedOk(s1); await s1.page.waitForTimeout(2000); await s1.close();
    const doc = C.store['scoutUsers/qa-user'];
    delete doc.snapshotIndex; delete doc.lastSnapshotAt;
    Object.keys(C.store).filter(k => /\/snapshots\//.test(k)).forEach(k => delete C.store[k]);
    [3, 2, 1].forEach(h => { const t = Date.now() - hours(h); C.store['scoutUsers/qa-user/snapshots/' + t] = { reason: 'periodic', createdAt: t, pokemonCount: 4, data: {} }; });
    zero(C); const s2 = await session({ feed: false, cloud: C }); await s2.page.waitForTimeout(5000);
    expect(n(C, 'snapshots', 'reads') === 3 && n(C, 'snapshots', 'writes') === 0 && n(C, 'scoutUsers', 'writes') === 1, 'first launch: ' + JSON.stringify(C.stats));
    expect(C.store['scoutUsers/qa-user'].snapshotIndex.length === 3 && ((await s2.state()).snapshots || []).length === 3, 'index not built');
    await s2.close();
    zero(C); const s3 = await session({ feed: false, cloud: C }); await s3.page.waitForTimeout(4000);
    expect(n(C, 'snapshots', 'reads') === 0 && n(C, 'scoutUsers', 'writes') === 0 && n(C, 'scoutUsers', 'reads') === 1, 'second launch: ' + JSON.stringify(C.stats));
    await s3.close();
  }, 'high');

  await T('SYNC-11', 'Cloud', 'Credentials an older build uploaded are deleted from the cloud on the next save, never adopted on this device, and cannot be written back', async () => {
    const C = { store: {}, writes: [] };
    const s1 = await session({ feed: false, cloud: C }); await s1.page.waitForTimeout(1500);
    await s1.load(QA); await savedOk(s1); await s1.page.waitForTimeout(2000);
    C.store['scoutUsers/qa-user'].geminiKey = 'AIzaQAOLD1111111111111111111111111111'; C.store['scoutUsers/qa-user'].geminiKeys = ['AIzaQAOLD1111111111111111111111111111']; C.store['scoutUsers/qa-user'].githubToken = 'ghp_QAOLD'; C.store['scoutUsers/qa-user'].apiEndpoint = 'https://qa-old.example/v1';
    await s1.page.reload({ waitUntil: 'load' }); await s1.page.waitForTimeout(3500);
    let st = await s1.state();
    expect(!(st.geminiKeys || []).length && !st.geminiKey && !st.githubToken && !st.apiEndpoint, 'old cloud credentials were adopted into the app');
    expect(!/AIzaQAOLD|ghp_QAOLD|qa-old/.test(await s1.page.evaluate(() => Object.keys(localStorage).map(k => localStorage.getItem(k)).join('\n'))), 'old cloud credentials were copied to this device');
    await s1.set({ cutTarget: 222 }); await s1.call('pushCloud'); await s1.page.waitForTimeout(1800);
    const doc = C.store['scoutUsers/qa-user'];
    expect(doc.cutTarget === 222 && !('geminiKey' in doc) && !('geminiKeys' in doc) && !('githubToken' in doc) && !('apiEndpoint' in doc), 'scrub did not run: ' + Object.keys(doc).filter(k => /gemini|github|apiEnd/.test(k)).join());
    expect(C.denied.length === 0, 'the scrub was refused: ' + JSON.stringify(C.denied[0]));
    await s1.close();
  }, 'high');

  await T('SYNC-14', 'Security', 'A custom API endpoint stored by an older build is not loaded into the app and is scrubbed from this device\'s secrets', async () => {
    const s1 = await session({ feed: false }); await s1.load(QA); await s1.page.waitForTimeout(1500);
    await s1.page.evaluate(() => localStorage.setItem('scout.secrets.v1', JSON.stringify({ geminiKey: '', geminiKeys: [], apiEndpoint: 'https://qa-old.example/v1', githubToken: 'ghp_QAKEEP' })));
    await s1.page.reload({ waitUntil: 'load' }); await s1.page.waitForTimeout(3000);
    const st = await s1.state();
    expect(!st.apiEndpoint && !st.apiEndpointDraft, 'the old endpoint was loaded into the app: ' + st.apiEndpoint);
    expect(await s1.page.evaluate(() => typeof document.body.innerText === 'string' && !document.body.innerText.includes('qa-old.example')), 'the old endpoint is shown');
    await s1.set({ githubToken: 'ghp_QAKEEP2' }); await s1.page.waitForTimeout(1500);
    const sec = await s1.page.evaluate(() => localStorage.getItem('scout.secrets.v1') || '');
    expect(!/apiEndpoint|qa-old/.test(sec) && /ghp_QAKEEP2/.test(sec), 'the old endpoint stayed in the stored secrets: ' + sec);
    await s1.close();
  }, 'high');
  await T('STANDIN-01', 'Cloud', 'The stand-in enforces the rules: unlisted keys, written credentials, other users, shared collections, bad snapshot ids and unverified identities are refused', async () => {
    const C = { store: {}, writes: [] };
    const s1 = await session({ feed: false, cloud: C }); await s1.page.waitForTimeout(1500);
    const attempt = (op, p, data) => s1.page.evaluate(async ([op, p, data]) => { try { const d = window.firebase.firestore().collection(p[0]).doc(p[1]); const r = p.length > 2 ? d.collection(p[2]).doc(p[3]) : d; if (op === 'get') await r.get(); else if (op === 'delete') await r.delete(); else await r.set(data, { merge: true }); return 'ok'; } catch (e) { return e.code || e.message; } }, [op, p, data]);
    const ok = await s1.page.evaluate(async () => { try { await window.firebase.firestore().collection('scoutUsers').doc('qa-user').set({ cutTarget: 1, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); return 'ok'; } catch (e) { return e.code; } });
    expect(ok === 'ok', 'a legal write was refused: ' + ok);
    const stamped = d => s1.page.evaluate(async d => { try { await window.firebase.firestore().collection('scoutUsers').doc('qa-user').set({ ...d, updatedAt: window.firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); return 'ok'; } catch (e) { return e.code; } }, d);
    expect(await stamped({ evil: 1 }) === 'permission-denied', 'an unlisted key was accepted');
    expect(await stamped({ geminiKey: 'AIzaX' }) === 'permission-denied', 'a credential was accepted');
    expect(await attempt('set', ['scoutUsers', 'qa-user'], { cutTarget: 2, updatedAt: 12345 }) === 'permission-denied', 'a client-clock updatedAt was accepted');
    expect(await attempt('set', ['scoutUsers', 'someone-else'], { cutTarget: 1 }) === 'permission-denied', 'another user\'s document was writable');
    expect(await attempt('get', ['scoutUsers', 'someone-else']) === 'permission-denied', 'another user\'s document was readable');
    expect(await attempt('set', ['gameData', 'baseStats'], { x: 1 }) === 'permission-denied', 'gameData was writable');
    expect(await attempt('set', ['sprites', '25'], { x: 1 }) === 'permission-denied', 'sprites was writable');
    expect(await attempt('set', ['scoutUsers', 'qa-user', 'snapshots', 'abc'], { reason: 'x', createdAt: 1, pokemonCount: 1, data: {} }) === 'permission-denied', 'a snapshot with a bad id was accepted');
    expect(await attempt('set', ['scoutUsers', 'qa-user', 'snapshots', '1700000000009'], { reason: 'x', createdAt: 1, pokemonCount: 1, data: {}, extra: 1 }) === 'permission-denied', 'a snapshot with an extra key was accepted');
    expect(await attempt('set', ['scoutUsers', 'qa-user', 'snapshots', '1700000000009'], { reason: 'x', createdAt: 1, pokemonCount: 1, data: {} }) === 'ok', 'a legal snapshot was refused');
    // An email/password account that is not verified may read and delete, not write.
    await s1.page.evaluate(() => window.__qaAuth.signIn({ uid: 'qa-user', email: 'x@example.test', provider: 'password', emailVerified: false }));
    expect(await stamped({ cutTarget: 3 }) === 'permission-denied', 'an unverified identity could write');
    expect(await attempt('get', ['scoutUsers', 'qa-user']) === 'ok' && await attempt('delete', ['scoutUsers', 'qa-user']) === 'ok', 'an unverified identity could not read or delete its own data');
    await s1.close();
  }, 'high');
  await T('SYNC-13', 'Security', 'The three Firebase SDK scripts are loaded with a SHA-384 integrity value and crossorigin=anonymous (the harness records what was asked, then drops it for the stand-in)', async () => {
    const seen = await k1.page.evaluate(() => window.__sriSeen.map(x => ({ src: x.el.src, integrity: x.integrity, cors: x.el.crossOrigin })));
    expect(seen.length === 3 && seen.every(x => /^sha384-[A-Za-z0-9+/]{64}$/.test(x.integrity) && x.cors === 'anonymous' && /^https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-(app|auth|firestore)-compat\.js$/.test(x.src)), 'asked for: ' + JSON.stringify(seen));
  }, 'high');
  await T('SYNC-12', 'Quota', 'One edit is exactly one write and at most one read: the debounced path, and a direct push from a setState callback while the debounce is pending (no second write 1.2 s later)', async () => {
    await k1.page.waitForTimeout(1500);
    zero(K); await k1.set({ cutTarget: 111 }); await k1.page.waitForTimeout(3500);
    expect(n(K, 'scoutUsers', 'writes') === 1 && n(K, 'scoutUsers', 'reads') <= 1 && K.store['scoutUsers/qa-user'].cutTarget === 111, 'debounced edit: writes ' + n(K, 'scoutUsers', 'writes') + ', reads ' + n(K, 'scoutUsers', 'reads'));
    await k1.set({ moveDB: { 'QA Move': { type: 'Fire', power: 10, energy: 5, durationMs: 1000, kind: 'fast' } } }); await k1.page.waitForTimeout(3500);
    zero(K); await k1.call('clearMoveData'); await k1.page.waitForTimeout(4000);   // setState(..., () => this.pushCloud()) with the 1.2 s debounce also pending
    expect(n(K, 'scoutUsers', 'writes') === 1 && n(K, 'scoutUsers', 'reads') <= 1, 'direct push: writes ' + n(K, 'scoutUsers', 'writes') + ', reads ' + n(K, 'scoutUsers', 'reads'));
    expect(JSON.stringify(K.store['scoutUsers/qa-user'].moveDBJson || '').length > 0 && K.denied.length === 0, 'refused or lost: ' + JSON.stringify(K.denied[0]));
  }, 'high');
  await k1.close();

  // ------------------------------------------------------------------ DATA CONTROLS (I): export, delete account, per-account device copy
  const A = { uid: 'qa-user', email: 'a@example.test', provider: 'google.com', emailVerified: true };
  const B = { uid: 'qa-user-b', email: 'b@example.test', provider: 'github.com', emailVerified: false };
  const localCount = async c => { const raws = await c.page.evaluate(() => Object.keys(localStorage).filter(k => /^scout\.local\.v1/.test(k)).map(k => localStorage.getItem(k))); let t = 0; for (const r of raws) { const b = await c.call('unpackCloudBlob', JSON.parse(r)); t += ((b.roster || []).length + (b.addedPokemon || []).length); } return t; };
  const allLocal = pg => pg.evaluate(() => Object.keys(localStorage).map(k => k + '=' + localStorage.getItem(k)).join('\n'));
  const clickText = async (pg, re) => { const b = pg.locator('button, [role=button]').filter({ hasText: re }).last(); await b.scrollIntoViewIfNeeded(); await b.click(); await pg.waitForTimeout(500); };
  const D = { store: {}, writes: [], user: A };
  const d1 = await session({ feed: false, cloud: D });
  await d1.page.waitForTimeout(1500);
  await d1.load(QA); await savedOk(d1); await d1.page.waitForTimeout(2000);
  await d1.set({ geminiKeys: ['AIzaQAKEY111111111111111111111111111'], geminiKey: 'AIzaQAKEY111111111111111111111111111', githubToken: 'ghp_QAKEY' });
  await d1.call('autoSnapshot', 'manual', { force: true }); await d1.page.waitForTimeout(1800);
  const DN = ((await d1.state()).roster || []).length + ((await d1.state()).addedPokemon || []).length;

  await T('DATA-02', 'Data', 'Export my data downloads the whole roster as one file and contains no key, token or endpoint', async () => {
    await d1.go('HOME');
    const [file] = await Promise.all([d1.page.waitForEvent('download', { timeout: 8000 }), clickText(d1.page, /^Export my data$/)]);
    const text = fs.readFileSync(await file.path(), 'utf8');
    const j = JSON.parse(text);
    const count = ((j.data.roster || []).length) + ((j.data.addedPokemon || []).length);
    expect(/^professor-.*\.json$/.test(file.suggestedFilename()) && count === DN && DN > 0, 'file ' + file.suggestedFilename() + ' holds ' + count + ' of ' + DN + ' Pokemon');
    expect(!/AIzaQAKEY|ghp_QAKEY|githubToken|geminiKey|apiEndpoint/.test(text), 'the export contains a secret or a secret field');
  }, 'high');

  await T('DATA-01b', 'Data', 'Delete my account asks twice, and an old sign-in is sent to sign in again before anything is deleted', async () => {
    await d1.go('HOME');
    D.authTime = Date.now() - hours(1);
    await clickText(d1.page, /^Delete my account and cloud data$/);
    expect(/Delete your account/i.test(await d1.text()) && !!D.store['scoutUsers/qa-user'], 'no first confirmation, or deleted already');
    await d1.page.getByText('CANCEL', { exact: true }).last().click(); await d1.page.waitForTimeout(300);
    expect(!!D.store['scoutUsers/qa-user'], 'cancel deleted something');
    await clickText(d1.page, /^Delete my account and cloud data$/);
    await d1.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Continue/i }).first().click(); await d1.page.waitForTimeout(500);
    expect(/last chance|cannot be undone/i.test(await d1.text()) && !!D.store['scoutUsers/qa-user'], 'no second confirmation, or deleted already');
    await d1.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Delete everything/i }).first().click(); await d1.page.waitForTimeout(1500);
    expect(/sign in again/i.test(await d1.text()), 'no sign-in-again message');
    expect(!!D.store['scoutUsers/qa-user'] && snapIds(D).length > 0 && (D.deletedUsers || []).length === 0 && n(D, 'scoutUsers', 'deletes') === 0, 'something was deleted before the sign-in check');
    D.authTime = undefined;
    await d1.page.getByText('Close', { exact: true }).last().click().catch(() => {}); await d1.set({ pendingConfirm: null });
  }, 'high');

  await T('DATA-01', 'Data', 'Delete my account and cloud data removes the snapshots, then the user document, then the sign-in, then the copies on this device', async () => {
    const nSnap = snapIds(D).length;
    expect(nSnap > 0, 'setup: no snapshots');
    expect(/AIzaQAKEY/.test(await allLocal(d1.page)) && await localCount(d1) === DN, 'setup: nothing on the device to delete');
    zero(D);
    await d1.go('HOME');
    await clickText(d1.page, /^Delete my account and cloud data$/);
    await d1.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Continue/i }).first().click(); await d1.page.waitForTimeout(500);
    await d1.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Delete everything/i }).first().click(); await d1.page.waitForTimeout(3000);
    const left = Object.keys(D.store).filter(k => /^scoutUsers\/qa-user/.test(k));
    expect(left.length === 0, 'still in the cloud: ' + left.join(', '));
    expect((D.deletedUsers || []).join() === 'qa-user' && !D.authUsers['qa-user'], 'the sign-in was not deleted');
    const order = D.log.map(x => x[0] === 'delete' ? (/snapshots/.test(x[1]) ? 'snapshot' : 'doc') : x[0]);
    const firstDoc = order.indexOf('doc'), lastSnap = order.lastIndexOf('snapshot');
    expect(lastSnap >= 0 && firstDoc > lastSnap && order[order.length - 1] === 'deleteUser', 'order was ' + order.join(','));
    expect(n(D, 'snapshots', 'reads') === nSnap && n(D, 'snapshots', 'deletes') === nSnap, 'snapshots: ' + JSON.stringify(D.stats.snapshots) + ' for ' + nSnap + ' documents');
    const loc = await allLocal(d1.page);
    expect(!/scout\.local\.v1|scout\.secrets\.v1|AIzaQAKEY|ghp_QAKEY/.test(loc), 'left on the device: ' + (loc.match(/scout\.local\.v1[^=]*|scout\.secrets\.v1|AIzaQAKEY/) || [])[0]);
    const st = await d1.state();
    expect(!st.cloudUser && (st.roster || []).length + (st.addedPokemon || []).length === 0 && !(st.geminiKeys || []).length, 'the app still shows the account or its data');
    await d1.page.reload({ waitUntil: 'load' }); await d1.page.waitForTimeout(3000);
    const st2 = await d1.state();
    expect((st2.roster || []).length + (st2.addedPokemon || []).length === 0, 'the data came back after a reload');
  }, 'critical');
  await d1.close();

  await T('DATA-01c', 'Data', 'When the sign-in itself refuses to be deleted the data is already gone, the device signs out, and signing in again then deleting finishes the job', async () => {
    const C = { store: {}, writes: [], user: A };
    const e2 = await session({ feed: false, cloud: C }); await e2.page.waitForTimeout(1500);
    await e2.load(QA); await savedOk(e2); await e2.page.waitForTimeout(2000);
    await e2.call('autoSnapshot', 'manual', { force: true }); await e2.page.waitForTimeout(1500);
    const del = async () => { await e2.go('HOME'); await clickText(e2.page, /^Delete my account and cloud data$/); await e2.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Continue/i }).first().click(); await e2.page.waitForTimeout(400); await e2.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Delete everything/i }).first().click(); await e2.page.waitForTimeout(2500); };
    C.requireRecentLogin = true; zero(C);
    await del();
    expect(Object.keys(C.store).filter(k => /^scoutUsers\/qa-user/.test(k)).length === 0, 'cloud data left: ' + Object.keys(C.store).join());
    expect(!!C.authUsers['qa-user'] && (C.deletedUsers || []).length === 0, 'the sign-in should still exist');
    let st = await e2.state();
    expect(!st.cloudUser && (st.roster || []).length + (st.addedPokemon || []).length === 0, 'still signed in or showing data');
    expect(/sign in again/i.test(await e2.text()) && /still there/i.test(await e2.text()), 'the message does not say how to finish: ' + (st.dataMsg || ''));
    expect(!/scout\.local\.v1|scout\.secrets\.v1/.test(await allLocal(e2.page)), 'device copy left');
    C.requireRecentLogin = false; zero(C);
    await e2.page.evaluate(u => window.__qaAuth.signIn(u), A); await e2.page.waitForTimeout(2500);
    await del();
    expect((C.deletedUsers || []).join() === 'qa-user' && !C.authUsers['qa-user'], 'the second delete did not remove the sign-in');
    expect(C.denied.length === 0, 'refused ' + JSON.stringify(C.denied[0]));
    await e2.close();
  }, 'high');

  const mkDel = async (C, nSnaps) => {
    const e = await session({ feed: false, cloud: C }); await e.page.waitForTimeout(1500);
    await e.load(QA); await savedOk(e); await e.page.waitForTimeout(2000);
    for (let i = 0; i < nSnaps; i++) { await e.call('autoSnapshot', 'manual', { force: true }); await e.page.waitForTimeout(1100); }
    await e.page.waitForTimeout(1000);
    e.del = async () => { await e.go('HOME'); await clickText(e.page, /^Delete my account and cloud data$/); await e.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Continue/i }).first().click(); await e.page.waitForTimeout(400); await e.page.locator('[role=alertdialog] [role=button]').filter({ hasText: /Delete everything/i }).first().click(); await e.page.waitForTimeout(4500); };
    return e;
  };
  await T('DATA-04', 'Data', 'A snapshot still being written when the account is deleted does not survive it: nothing is left under the user, no user document is re-created, and the delete waits for it', async () => {
    const C = { store: {}, writes: [], user: A };
    const e = await mkDel(C, 1);
    C.delaySnapMs = 3000; C.delayDocDeleteMs = 4000; zero(C);
    await e.page.evaluate(() => { for (const x of document.querySelectorAll('*')) { const k = Object.keys(x).find(y => y.startsWith('__reactFiber')); if (!k) continue; for (let f = x[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.autoSnapshot) { window.__snapP = f.stateNode.logic.autoSnapshot('manual', { force: true }); return; } } });
    await e.page.waitForTimeout(100);
    await e.del(); await e.page.waitForTimeout(4000);
    const left = Object.keys(C.store).filter(k => /^scoutUsers\/qa-user/.test(k));
    expect(left.length === 0, 'left in the cloud after delete: ' + left.join(', '));
    expect((C.deletedUsers || []).join() === 'qa-user', 'the sign-in was not deleted');
    await e.close();
  }, 'high');
  await T('DATA-06', 'Data', 'The one-time snapshot-index write at launch is not overtaken by a delete: nothing is left, nothing is refused, no user document is re-created', async () => {
    const C = { store: {}, writes: [], user: A, denied: [] };
    const e = await mkDel(C, 1);
    const doc = C.store['scoutUsers/qa-user']; delete doc.snapshotIndex; delete doc.lastSnapshotAt;
    C.denied.length = 0; C.delayMetaMs = 9000; zero(C);
    await e.page.reload({ waitUntil: 'load' }); await e.page.waitForTimeout(2500);
    await e.del(); await e.page.waitForTimeout(11000); C.delayMetaMs = 0;
    const left = Object.keys(C.store).filter(k => /^scoutUsers\/qa-user/.test(k));
    expect(left.length === 0, 'left in the cloud after delete: ' + left.join(', '));
    expect(C.denied.length === 0, 'a write landed after the delete and was refused: ' + JSON.stringify(C.denied[0]));
    await e.close();
  }, 'high');
  await T('DATA-05', 'Data', 'A delete that fails half-way says some backups may already be gone (not "nothing was removed"), keeps the roster, and the stored list no longer names the deleted backups', async () => {
    const C = { store: {}, writes: [], user: A };
    const e = await mkDel(C, 3);
    const before = snapIds(C).length;
    expect(before >= 3, 'setup: ' + before + ' snapshots');
    C.failSnapDeleteAfter = 1; zero(C);
    await e.del();
    const st = await e.state();
    expect(!/Nothing else was removed/i.test(st.dataMsg || '') && /may already be deleted/i.test(st.dataMsg || ''), 'message: ' + st.dataMsg);
    expect(!!C.store['scoutUsers/qa-user'] && snapIds(C).length === before - 1, 'expected the document and ' + (before - 1) + ' snapshots, got ' + snapIds(C).length);
    const idx = (C.store['scoutUsers/qa-user'].snapshotIndex || []).map(x => x.id).sort();
    expect(idx.length === snapIds(C).length && idx.every(i => snapIds(C).indexOf(i) >= 0), 'the index still names deleted backups: ' + idx.join());
    expect(!!st.cloudUser && ((st.roster || []).length + (st.addedPokemon || []).length) > 0, 'the roster must stay');
    await e.close();
  }, 'high');

  await T('DATA-03', 'Data', 'User A signs out, user B signs in on the same device: B never sees A\'s roster, on screen or in storage, also when B signs in without A signing out', async () => {
    const E = { store: {}, writes: [], user: A };
    const e1 = await session({ feed: false, cloud: E });
    await e1.page.waitForTimeout(1500);
    await e1.load(QA); await savedOk(e1); await e1.page.waitForTimeout(2200);
    const na = ((await e1.state()).roster || []).length + ((await e1.state()).addedPokemon || []).length;
    expect(na > 0 && await localCount(e1) === na, 'setup: A has ' + na + ' Pokemon and the device copy holds ' + await localCount(e1));
    // The other synced fields too: none of them may stay on screen for the next account.
    const OWN = { moveDB: { x: { name: 'x' } }, evoTable: { pidgey: { evolvesTo: 'pidgeotto', candy: 12 } }, candyAiDecisions: { k: { v: 1 } }, chatMessages: [{ role: 'user', content: 'hello' }], triageKeep: { a: 1 }, transferQueue: [999], trainerLevel: 41, dustReserve: 12345 };
    const stillShown = st => Object.keys(OWN).filter(k => JSON.stringify(st[k]) === JSON.stringify(OWN[k]));
    await e1.set(OWN); await e1.page.waitForTimeout(2200); await savedOk(e1);
    expect(stillShown(await e1.state()).length === 8, 'setup: the eight fields did not take');
    await e1.call('signOutCloud'); await e1.page.waitForTimeout(1500);
    let st = await e1.state();
    expect(stillShown(st).length === 0, 'A\'s ' + stillShown(st).join(', ') + ' are still on screen after signing out');
    expect(!st.cloudUser && (st.roster || []).length + (st.addedPokemon || []).length === 0, 'A is still on screen after signing out');
    expect(await localCount(e1) === 0, 'A\'s roster is still in this device\'s storage after sign-out');
    await e1.page.evaluate(u => window.__qaAuth.signIn(u), B); await e1.page.waitForTimeout(2800);
    st = await e1.state();
    expect(st.cloudUser && st.cloudUser.uid === B.uid && (st.roster || []).length + (st.addedPokemon || []).length === 0, 'B sees ' + ((st.roster || []).length + (st.addedPokemon || []).length) + ' Pokemon');
    expect(await localCount(e1) === 0 && !E.store['scoutUsers/qa-user-b'], 'B\'s device copy or cloud document holds A\'s data');
    expect(E.store['scoutUsers/qa-user'] && E.denied.length === 0, 'A\'s cloud copy was touched or a write was refused');
    // A signs in again on the same device: the cloud brings the roster back.
    await e1.page.evaluate(u => window.__qaAuth.signIn(u), A); await e1.page.waitForTimeout(2800);
    expect(((await e1.state()).roster || []).length + ((await e1.state()).addedPokemon || []).length === na, 'A\'s roster did not come back from the cloud');
    expect(stillShown(await e1.state()).length === 8, 'A\'s own fields did not come back from the cloud: ' + stillShown(await e1.state()).join(', '));
    // B takes over without A signing out first: A's data must not be written into B's document.
    await e1.page.evaluate(u => window.__qaAuth.signIn(u), B); await e1.page.waitForTimeout(2800);
    await e1.call('pushCloud'); await e1.page.waitForTimeout(1500);
    st = await e1.state();
    const b = E.store['scoutUsers/qa-user-b'];
    const bb = b ? await e1.call('unpackCloudBlob', b) : {};
    expect((st.roster || []).length + (st.addedPokemon || []).length === 0 && ((bb.roster || []).length + (bb.addedPokemon || []).length) === 0, 'switching accounts carried A\'s roster into B: ' + ((bb.roster || []).length + (bb.addedPokemon || []).length) + ' Pokemon in B\'s document');
    expect(stillShown(st).length === 0 && Object.keys(OWN).every(k => stillShown(bb).indexOf(k) < 0 && !(k === 'chatMessages' && (bb.chatMessages || []).length)), 'switching accounts carried A\'s ' + stillShown(st).concat(stillShown(bb)).join(', ') + ' into B');
    expect(await localCount(e1) === 0, 'B\'s device copy holds A\'s roster after the switch');
    // A signed-out device that reloads shows nothing of A.
    await e1.call('signOutCloud'); await e1.page.waitForTimeout(800); E.user = null;
    await e1.page.reload({ waitUntil: 'load' }); await e1.page.waitForTimeout(3000);
    st = await e1.state();
    expect(!st.cloudUser && (st.roster || []).length + (st.addedPokemon || []).length === 0 && await localCount(e1) === 0, 'a signed-out reload shows or keeps A\'s data');
    await e1.close();
  }, 'critical');
  // The page text without the app's own script and template source (textContent would also read those).
  const pageText = c => c.page.evaluate(() => { const b = document.body.cloneNode(true); b.querySelectorAll('script,template').forEach(e => e.remove()); return b.textContent; });
  await T('DATA-07', 'Data', 'Coverage and the clear-roster warning count Pokemon that live in addedPokemon, not only the CSV roster', async () => {
    const c = await session({ feed: false });
    await c.load(QA); await c.page.waitForTimeout(800);
    const n = ((await c.state()).roster || []).length;
    expect(n > 5, 'setup: the fixture has ' + n);
    await c.set({ addedPokemon: (await c.state()).roster, roster: [] }); await c.page.waitForTimeout(500);
    await c.go('HOME'); await c.call('armClearRoster'); await c.page.waitForTimeout(500);
    const t = await pageText(c);
    expect(new RegExp(n + ' Pokemon \\u00b7 \\d+% with IVs').test(t), 'the coverage headline does not count the ' + n + ' added Pokemon');
    expect(t.indexOf('Delete all ' + n + ' Pokemon') >= 0, 'the clear-roster warning does not count the ' + n + ' added Pokemon');
    await c.close();
  });
  await T('DATA-08', 'Data', 'When the sign-in SDK cannot load, the sign-in card says so; with it loaded there is no such notice', async () => {
    const off = await session({ feed: false });
    await off.page.waitForTimeout(1500); await off.go('HOME');
    const t = await pageText(off);
    expect(/Sign-in is unavailable: /.test(t), 'a failed SDK load shows nothing: ' + (await off.state()).firebaseConfigError);
    await off.close();
    const on = await session({ feed: false, cloud: { store: {}, writes: [], user: null } });
    await on.page.waitForTimeout(1500); await on.go('HOME');
    expect(!/Sign-in is unavailable/.test(await pageText(on)), 'the notice shows although the SDK loaded');
    await on.close();
  });
  // ------------------------------------------------------------------ SIGN-IN: Google and GitHub by popup, linking, empty account (Task 3)
  // Everything runs against the in-memory stand-in; its popups are scripted through cloud.popups. No real provider is contacted.
  const rn = st => (st.roster || []).length + (st.addedPokemon || []).length;
  const openAuth = async c => { await c.go('HOME'); await c.page.evaluate(() => document.querySelectorAll('details').forEach(d => { if (/Setup, sync and backup/.test(d.textContent.slice(0, 120))) d.open = true; })); await c.page.waitForTimeout(300); };
  const seedAccount = async (E, acct) => { E.user = acct; const c = await session({ feed: false, cloud: E }); await c.page.waitForTimeout(1500); await c.load(QA); await savedOk(c); await c.page.waitForTimeout(1500); const n = rn(await c.state()); await c.close(); E.user = null; return n; };
  const authSession = async E => { if (E.user === undefined) E.user = null; const c = await session({ feed: false, cloud: E }); await c.page.waitForTimeout(1500); await openAuth(c); return c; };
  const social = async (c, name) => { await c.page.getByRole('button', { name: 'Continue with ' + name }).click(); await c.page.waitForTimeout(1500); };
  const linkRow = (c, n) => c.page.locator('[data-signed-in-methods] [role=button]').filter({ hasText: 'Link ' + n });
  const bodyText = c => c.page.evaluate(() => document.body.innerText);
  const GA = { uid: 'g-1', email: 'gee@example.test', displayName: 'Gee One', emailVerified: true };

  await T('AUTH-01', 'Sign-in', 'Continue with Google signs in by popup (no redirect, no scopes) and loads that account\'s roster', async () => {
    const E = { store: {}, writes: [] }; const n = await seedAccount(E, GA);
    expect(n > 0, 'setup: no roster seeded');
    E.popups = [{ account: GA }];
    const c = await authSession(E);
    expect(!(await c.state()).cloudUser, 'setup: should start signed out');
    await social(c, 'Google'); await savedOk(c); await c.page.waitForTimeout(1200);
    const st = await c.state();
    expect(st.cloudUser && st.cloudUser.uid === 'g-1' && rn(st) === n, 'signed in as ' + (st.cloudUser && st.cloudUser.uid) + ' with ' + rn(st) + ' of ' + n + ' Pokemon');
    expect(/Synced as\s+gee@example\.test/.test(await bodyText(c)), 'the card does not show the email');
    const seen = await c.page.evaluate(() => ({ p: window.__qaProviders || [], r: window.__qaRedirectCalls || 0 }));
    expect(seen.p.length === 1 && seen.p[0].providerId === 'google.com' && seen.p[0].scopes.length === 0, 'provider calls: ' + JSON.stringify(seen.p));
    expect(seen.r === 0 && E.popupLog.length === 1 && E.popupLog[0].kind === 'signin', 'a redirect was used or the popup count is off');
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'high');

  await T('AUTH-02', 'Sign-in', 'A GitHub account with no email shows its name, or its provider id, never "null" or "undefined"', async () => {
    const E = { store: {}, writes: [] };
    E.popups = [{ account: { uid: 'gh-1', email: null, displayName: 'octo-cat' } }, { account: { uid: 'gh-2', email: null } }];
    const c = await authSession(E);
    await social(c, 'GitHub');
    let t = await bodyText(c);
    expect(/Synced as\s+octo-cat/.test(t) && !/\bnull\b|undefined/.test(t.slice(t.indexOf('Synced as') - 20, t.indexOf('Synced as') + 200)), 'name case: ' + (t.match(/Synced as[^\n]*/) || [''])[0]);
    expect((await c.state()).cloudUser.providers.join() === 'github.com', 'provider list');
    await c.call('signOutCloud'); await c.page.waitForTimeout(800);
    await openAuth(c); await social(c, 'GitHub');
    t = await bodyText(c);
    const line = (t.match(/Synced as[^\n]*/) || [''])[0];
    expect(/Synced as\s+gh-2-github\.com/.test(line) && !/null|undefined/.test(line), 'no-name case: ' + line);
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'high');

  await T('AUTH-03', 'Sign-in', 'Email and password still works from the collapsed "Use email instead" disclosure, and a wrong password gives a plain message', async () => {
    const PW = { uid: 'pw-1', email: 'old@example.test', password: 'secret1', provider: 'password', providers: ['password'], emailVerified: true };
    const E = { store: {}, writes: [], user: null, authUsers: { 'pw-1': PW } };
    const c = await authSession(E);
    expect(await c.page.getByPlaceholder('email').count() === 0, 'the email form is not collapsed');
    await c.page.getByRole('button', { name: 'Use email instead' }).click(); await c.page.waitForTimeout(300);
    expect(await c.page.getByPlaceholder('email').count() === 1, 'the disclosure did not open');
    await c.page.getByPlaceholder('email').fill('old@example.test'); await c.page.getByPlaceholder('password').fill('wrong-one');
    await c.page.getByText('SIGN IN', { exact: true }).first().click(); await c.page.waitForTimeout(800);
    let t = await bodyText(c);
    expect(/Email or password is not right\./.test(t) && !/auth\//.test(t) && !(await c.state()).cloudUser, 'wrong password: ' + (t.match(/Email or password[^\n]*/) || ['no message'])[0]);
    await c.page.getByPlaceholder('password').fill('secret1');
    await c.page.getByText('SIGN IN', { exact: true }).first().click(); await c.page.waitForTimeout(1500);
    const st = await c.state();
    expect(st.cloudUser && st.cloudUser.uid === 'pw-1' && /Synced as\s+old@example\.test/.test(await bodyText(c)), 'not signed in as the email account');
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'high');

  // The old account is an email and password account holding a roster; GitHub later reports the same email.
  const DUAL = { uid: 'pw-9', email: 'dual@example.test', password: 'secret9', provider: 'password', providers: ['password'], emailVerified: true };
  const GH_DUAL = { uid: 'gh-77', email: 'dual@example.test', displayName: 'Dual Hub' };
  const dualSetup = async () => {
    const E = { store: {}, writes: [], authUsers: {} }; const n = await seedAccount(E, DUAL);
    E.popups = [{ error: { code: 'auth/account-exists-with-different-credential', email: 'dual@example.test', account: GH_DUAL } }];
    const c = await authSession(E);
    await social(c, 'GitHub');
    return { E, n, c };
  };
  const signInDual = async c => { await c.page.getByPlaceholder('password').fill('secret9'); await c.page.getByText('SIGN IN', { exact: true }).first().click(); await c.page.waitForTimeout(1800); };

  await T('AUTH-04', 'Sign-in', 'Account exists with another sign-in: sign in the old way, then GitHub links to the SAME uid and the roster stays', async () => {
    const { E, n, c } = await dualSetup();
    let t = await bodyText(c);
    expect(/This email already has an account\. Sign in the way you did before, then we will link GitHub\./.test(t) && !/auth\//.test(t), 'no plain message: ' + (t.match(/This email[^\n]*/) || ['none'])[0]);
    expect(await c.page.getByPlaceholder('email').inputValue() === 'dual@example.test', 'the email is not filled in');
    await signInDual(c);
    const dlg = c.page.locator('[role=alertdialog]');
    expect(/Link GitHub to this account\?/.test(await dlg.innerText()) && await dlg.getByText('Save a backup first', { exact: true }).count() === 1, 'no link question with a backup offer');
    await dlg.getByText('Link GitHub', { exact: true }).click(); await savedOk(c); await c.page.waitForTimeout(1500);
    const st = await c.state();
    expect(st.cloudUser.uid === 'pw-9', 'the uid changed to ' + st.cloudUser.uid);
    expect(rn(st) === n && n > 0, 'the roster is ' + rn(st) + ' of ' + n);
    expect(st.cloudUser.providers.indexOf('github.com') >= 0 && st.cloudUser.providers.indexOf('password') >= 0, 'providers: ' + st.cloudUser.providers);
    expect(Object.keys(E.authUsers).join() === 'pw-9' && !E.store['scoutUsers/gh-77'] && E.log.some(x => x[0] === 'link' && x[1] === 'pw-9' && x[2] === 'github.com'), 'the link did not happen on pw-9, or a second account appeared: ' + Object.keys(E.authUsers));
    expect(/GitHub is linked/.test(await bodyText(c)) && E.denied.length === 0, 'no confirmation shown or the stand-in refused a write');
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'critical');

  await T('AUTH-05', 'Sign-in', 'A link that fails (credential already in use) offers the backup path, says nothing was changed, and loses nothing', async () => {
    const { E, n, c } = await dualSetup();
    E.linkFail = 'auth/credential-already-in-use';
    await signInDual(c);
    await c.page.locator('[role=alertdialog]').getByText('Link GitHub', { exact: true }).click(); await c.page.waitForTimeout(1500);
    const t = await bodyText(c);
    expect(/already belongs to another account/.test(t) && /Nothing was changed/.test(t) && /save a backup, sign in with GitHub, then restore the backup/.test(t) && !/auth\//.test(t), 'message: ' + (t.match(/That GitHub[^\n]*/) || ['none'])[0]);
    const [file] = await Promise.all([c.page.waitForEvent('download', { timeout: 8000 }), c.page.getByRole('button', { name: 'Save a backup', exact: true }).click()]);
    const j = JSON.parse(fs.readFileSync(await file.path(), 'utf8'));
    expect(((j.data.roster || []).length + (j.data.addedPokemon || []).length) === n, 'the backup holds ' + ((j.data.roster || []).length + (j.data.addedPokemon || []).length) + ' of ' + n);
    const st = await c.state();
    expect(st.cloudUser.uid === 'pw-9' && rn(st) === n && E.store['scoutUsers/pw-9'] && st.cloudUser.providers.join() === 'password', 'account or roster changed after the failed link');
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'critical');

  await T('AUTH-05b', 'Sign-in', 'A different account signing in after "email already has an account" is NOT linked to the held credential', async () => {
    const { E, c } = await dualSetup();
    E.authUsers['pw-3'] = { uid: 'pw-3', email: 'other@example.test', password: 'secret3', provider: 'password', providers: ['password'], emailVerified: true };
    await c.page.getByPlaceholder('email').fill('other@example.test'); await c.page.getByPlaceholder('password').fill('secret3');
    await c.page.getByText('SIGN IN', { exact: true }).first().click(); await c.page.waitForTimeout(1500);
    expect(await c.page.locator('[role=alertdialog]').count() === 0 && !(E.log || []).some(x => x[0] === 'link') && (await c.state()).cloudUser.uid === 'pw-3', 'a link was offered or made for a different email');
    await c.close();
  });

  await T('AUTH-06', 'Sign-in', 'Popup blocked: a plain message with the way out, email opens, and the app stays usable signed out', async () => {
    const E = { store: {}, writes: [], popups: [{ error: { code: 'auth/popup-blocked' } }] };
    const c = await authSession(E);
    await social(c, 'Google');
    const t = await bodyText(c);
    expect(/Sign-in window did not open\. Try again, open the app in your browser, or use email instead\./.test(t) && !/auth\//.test(t), 'message: ' + (t.match(/Sign-in window[^\n]*/) || ['none'])[0]);
    expect(await c.page.getByPlaceholder('email').count() === 1, 'the email form did not open as the fallback');
    await c.load(QA); await c.page.waitForTimeout(1200);
    const st = await c.state();
    expect(!st.cloudUser && rn(st) > 10 && c.errors.length === 0, 'the app is not usable after the failure: ' + rn(st) + ' Pokemon, errors ' + c.errors[0]);
    await c.close();
  }, 'high');

  await T('AUTH-07', 'Sign-in', 'Closing the popup shows no error; a network failure gives a retry message; neither shows a raw code', async () => {
    const E = { store: {}, writes: [], popups: [{ error: { code: 'auth/popup-closed-by-user' } }, { error: { code: 'auth/cancelled-popup-request' } }, { error: { code: 'auth/network-request-failed' } }] };
    const c = await authSession(E);
    await social(c, 'Google');
    expect(await c.page.locator('[role=alert]').count() === 0 && !(await c.state()).authError, 'closing the popup showed an error: ' + (await c.state()).authError);
    await social(c, 'GitHub');
    expect(await c.page.locator('[role=alert]').count() === 0, 'a cancelled request showed an error');
    await social(c, 'Google');
    const t = await bodyText(c);
    expect(/Could not sign in\. Check your connection and try again\./.test(t) && !/auth\//.test(t), 'generic message: ' + (t.match(/Could not[^\n]*/) || ['none'])[0]);
    expect(!(await c.state()).cloudUser && E.popupLog.length === 3 && c.errors.length === 0, 'state after failures');
    await c.close();
  }, 'high');

  await T('AUTH-08', 'Sign-in', 'Signed in with Google, "Link GitHub" adds the second provider to the same uid and roster; the row goes away', async () => {
    const E = { store: {}, writes: [] }; const n = await seedAccount(E, GA);
    E.popups = [{ account: GA }];
    const c = await authSession(E); await social(c, 'Google'); await savedOk(c); await c.page.waitForTimeout(1000);
    expect(await linkRow(c, 'Google').count() === 0 && await linkRow(c, 'GitHub').count() === 1, 'link rows before: Google ' + await linkRow(c, 'Google').count());
    E.popups.push({ account: { uid: 'gh-5', email: 'gee@example.test', displayName: 'Gee Hub' } });
    await linkRow(c, 'GitHub').click(); await c.page.waitForTimeout(400);
    await c.page.locator('[role=alertdialog]').getByText('Link GitHub', { exact: true }).click(); await c.page.waitForTimeout(1500);
    const st = await c.state();
    expect(st.cloudUser.uid === 'g-1' && rn(st) === n && st.cloudUser.providers.join() === 'google.com,github.com', 'uid ' + st.cloudUser.uid + ' roster ' + rn(st) + ' providers ' + st.cloudUser.providers);
    expect(await linkRow(c, 'GitHub').count() === 0 && /Signed in with Google and GitHub/.test(await bodyText(c)), 'the card still offers GitHub or does not list both');
    const seen = await c.page.evaluate(() => window.__qaProviders);
    expect(seen.every(x => x.scopes.length === 0), 'a scope was requested');
    expect(E.popupLog.map(x => x.kind).join() === 'signin,link' && c.errors.length === 0, 'popup log ' + JSON.stringify(E.popupLog));
    await c.close();
  }, 'high');

  await T('AUTH-09', 'Sign-in', 'Sign out, then sign in as another account: nothing from the first account is on screen, in storage or in the second document', async () => {
    const E = { store: {}, writes: [] }; const n = await seedAccount(E, GA);
    const GB = { uid: 'g-2', email: 'bee@example.test', displayName: 'Bee Two', emailVerified: true };
    E.popups = [{ account: GA }, { account: GB }];
    const c = await authSession(E); await social(c, 'Google'); await savedOk(c); await c.page.waitForTimeout(1500);
    expect(rn(await c.state()) === n, 'setup: ' + rn(await c.state()) + ' on screen of ' + n);
    await c.page.getByText('SIGN OUT', { exact: true }).click(); await c.page.waitForTimeout(1200);
    expect(!(await c.state()).cloudUser && rn(await c.state()) === 0 && await localCount(c) === 0, 'the first account is still on screen or in storage after sign-out');
    await openAuth(c); await social(c, 'GitHub'); await c.page.waitForTimeout(1200);
    const st = await c.state();
    expect(st.cloudUser && st.cloudUser.uid === 'g-2' && rn(st) === 0 && await localCount(c) === 0, 'the second account sees ' + rn(st) + ' Pokemon, storage ' + await localCount(c));
    expect(!E.store['scoutUsers/g-2'] || (await c.call('unpackCloudBlob', E.store['scoutUsers/g-2'])).roster.length === 0, 'the second document holds the first roster');
    await c.close();
  }, 'critical');

  // Signing in to an account with no Pokemon while this device holds a roster built before signing in: ask, never overwrite either side.
  const carrySetup = async (E, acct) => {
    E.popups = [{ account: acct }];
    const c = await authSession(E);
    await c.load(QA); await c.page.waitForTimeout(1200);
    const n = rn(await c.state());
    await openAuth(c); await social(c, 'Google'); await c.page.waitForTimeout(1200);
    return { c, n };
  };
  const GN = { uid: 'g-new', email: 'new@example.test', displayName: 'New One', emailVerified: true };

  await T('AUTH-10', 'Sign-in', 'Empty account + a roster built while signed out: the person is asked, nothing is written or replaced before the answer, and Upload puts that roster in the account', async () => {
    const E = { store: {}, writes: [] };
    const { c, n } = await carrySetup(E, GN);
    expect(n > 10, 'setup: ' + n);
    const dlg = c.page.locator('[data-carry-prompt]');
    expect(await dlg.count() === 1 && /This account has no Pokemon yet/.test(await dlg.innerText()) && new RegExp('Upload ' + n + ' Pokemon').test(await dlg.innerText()), 'no prompt, or it does not name the roster: ' + (await bodyText(c)).slice(0, 200));
    let st = await c.state();
    expect(rn(st) === n && E.writes.length === 0 && !E.store['scoutUsers/g-new'], 'before the answer: on screen ' + rn(st) + ', writes ' + E.writes.length);
    await dlg.getByText('Upload ' + n + ' Pokemon').click(); await savedOk(c); await c.page.waitForTimeout(2500);
    st = await c.state();
    const doc = E.store['scoutUsers/g-new']; const bb = doc ? await c.call('unpackCloudBlob', doc) : {};
    expect(rn(st) === n && ((bb.roster || []).length + (bb.addedPokemon || []).length) === n && E.denied.length === 0, 'after Upload: screen ' + rn(st) + ', cloud ' + ((bb.roster || []).length + (bb.addedPokemon || []).length) + ', refused ' + JSON.stringify(E.denied[0]));
    expect(await c.page.locator('[data-carry-prompt]').count() === 0, 'the prompt is still open');
    await c.close();
  }, 'critical');

  await T('AUTH-10b', 'Sign-in', '"Start with an empty account" shows the empty account and uploads nothing; the plain device copy is removed', async () => {
    const E = { store: {}, writes: [] };
    const { c } = await carrySetup(E, GN);
    await c.page.locator('[data-carry-prompt]').getByText('Start with an empty account').click(); await c.page.waitForTimeout(2500);
    const st = await c.state();
    expect(rn(st) === 0 && st.cloudUser.uid === 'g-new' && await c.page.locator('[data-carry-prompt]').count() === 0, 'screen ' + rn(st));
    const doc = E.store['scoutUsers/g-new']; const bb = doc ? await c.call('unpackCloudBlob', doc) : {};
    expect(((bb.roster || []).length + (bb.addedPokemon || []).length) === 0, 'the roster was uploaded anyway');
    expect(await c.page.evaluate(() => localStorage.getItem('scout.local.v1') === null && localStorage.getItem('scout.carryPending') === null), 'the plain device copy or the pending flag is still there');
    await c.close();
  }, 'high');

  await T('AUTH-10c', 'Sign-in', 'The question survives a reload while it is open, and an account that already has data is used without a question', async () => {
    const E = { store: {}, writes: [] };
    const { c, n } = await carrySetup(E, GN);
    await c.page.reload({ waitUntil: 'load' }); await c.page.waitForTimeout(3500);
    const dlg = c.page.locator('[data-carry-prompt]');
    expect(await dlg.count() === 1 && new RegExp('Upload ' + n + ' Pokemon').test(await dlg.innerText()) && E.writes.length === 0, 'after a reload the question is gone (' + await dlg.count() + ') or something was written (' + E.writes.length + ')');
    await c.close();
    const E2 = { store: {}, writes: [] }; const m = await seedAccount(E2, GA);
    const { c: c2, n: n2 } = await carrySetup(E2, GA);
    await savedOk(c2); const st = await c2.state();
    expect(await c2.page.locator('[data-carry-prompt]').count() === 0 && rn(st) === m && m > 0 && n2 > 0, 'a populated account asked, or showed ' + rn(st) + ' of ' + m);
    expect(/already had data, so it was used/.test(await bodyText(c2)), 'no notice that the account\'s data was used');
    await c2.close();
  }, 'high');
  // ------------------------------------------------------------------ FIRST-RUN page (Task 3). The harness switches it off (window.__noFirstRun); these sessions turn it on.
  const SC = require('./qa_e2e_e').__scans;
  const frSession = async (o = {}) => { const c = await session({ feed: false, firstRun: true, ...o }); await c.page.waitForTimeout(2200); return c; };
  const fr = c => c.page.locator('[data-firstrun]');
  const frOpen = async c => (await fr(c).count()) === 1;
  const frStepNo = async c => { const t = await fr(c).innerText(); const m = t.match(/Step (\d) of 6/); return m ? +m[1] : 0; };
  const frNext = async c => { const b = fr(c).locator('button').filter({ hasText: /^(Continue|Continue without an account|Done)$/ }).last(); await b.click(); await c.page.waitForTimeout(350); };
  const frKey = (c, k) => c.page.evaluate(x => localStorage.getItem(x), k);

  await T('FIRSTRUN-01', 'First run', 'Fresh storage shows step 1 with Skip, the sign-in choices and "without an account"; a signed-out user sees it', async () => {
    const c = await frSession();
    expect(await frOpen(c), 'the first-run page did not open on fresh storage');
    const t = await fr(c).innerText();
    expect(await frStepNo(c) === 1 && /Welcome to Professor/.test(t) && /Skip/.test(t) && /Continue with Google/.test(t) && /Continue with GitHub/.test(t) && /Use email/.test(t) && /Continue without an account/.test(t), 'step 1 content: ' + t.slice(0, 200));
    expect(!(await c.state()).cloudUser, 'setup: should be signed out');
    expect(c.errors.length === 0, c.errors[0]); await c.close();
  }, 'high');

  await T('FIRSTRUN-02', 'First run', 'Skip on step 1 closes it and it does not come back after a reload', async () => {
    const c = await frSession();
    await fr(c).getByRole('button', { name: 'Skip', exact: true }).click(); await c.page.waitForTimeout(500);
    expect(!(await frOpen(c)) && await frKey(c, 'scout.firstRun.v1') === 'done', 'still open, or the key is ' + await frKey(c, 'scout.firstRun.v1'));
    await c.page.reload({ waitUntil: 'load' }); await c.page.waitForTimeout(2800);
    expect(!(await frOpen(c)), 'the first-run page came back after a reload');
    await c.close();
  }, 'critical');

  await T('FIRSTRUN-03', 'First run', 'Each step\'s control changes the real setting: theme, text size, key (device secrets only), reminders only after a tap', async () => {
    const E = { store: {}, writes: [], user: GA };
    const c = await frSession({ cloud: E, init: () => { window.__notifAsked = 0; try { Object.defineProperty(window, 'Notification', { configurable: true, value: Object.assign(function () {}, { permission: 'default', requestPermission: cb => { window.__notifAsked++; if (cb) cb('granted'); return Promise.resolve('granted'); } }) }); } catch (e) {} } });
    await frNext(c); await frNext(c);                                 // 1 -> 2 (signed in) -> 3
    expect(await frStepNo(c) === 3, 'on step ' + await frStepNo(c));
    await fr(c).getByRole('button', { name: 'Light', exact: true }).click(); await c.page.waitForTimeout(300);
    expect(await c.page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light' && await frKey(c, 'scout.theme') === 'light', 'theme did not change');
    await fr(c).getByRole('button', { name: 'Text size 130%' }).click(); await c.page.waitForTimeout(300);
    expect(await frKey(c, 'scout.uiZoom') === '1.3' && (await c.state()).uiZoom === 1.3, 'text size did not change');
    await frNext(c);                                                  // 4
    const KEY = 'AIzaFirstRunQAKEY00000000000000000000';
    expect(await fr(c).locator('textarea').isDisabled() && (await c.state()).geminiKey === '', 'the key field is usable before the age box is ticked');
    await fr(c).getByText('I am 18 or older').click(); await c.page.waitForTimeout(200);
    await fr(c).locator('textarea').fill(KEY); await fr(c).getByRole('button', { name: 'Save key' }).click(); await c.page.waitForTimeout(500);
    expect((await c.state()).geminiKey === KEY && /AIzaFirstRunQAKEY/.test(await frKey(c, 'scout.secrets.v1') || ''), 'the key is not in the device secrets');
    await frNext(c);                                                  // 5
    expect(await c.page.evaluate(() => window.__notifAsked) === 0, 'notification permission was asked before a tap');
    await fr(c).getByRole('button', { name: 'Turn on reminders' }).click(); await c.page.waitForTimeout(600);
    expect(await c.page.evaluate(() => window.__notifAsked) === 1 && (await c.state()).remindersOn === true, 'the reminder tap did not ask once');
    await c.call('pushCloud'); await c.page.waitForTimeout(1500);
    const doc = JSON.stringify(E.store['scoutUsers/g-1'] || {});
    expect(!/AIzaFirstRunQAKEY|geminiKey/.test(doc) && !(E.writes || []).some(w => w.keys.some(k => /gemini/i.test(k))), 'the key reached the cloud document');
    expect(!/AIzaFirstRunQAKEY/.test(await c.page.evaluate(() => Object.keys(localStorage).filter(k => k !== 'scout.secrets.v1').map(k => localStorage.getItem(k)).join('\n'))), 'the key is stored outside scout.secrets.v1');
    await c.close();
  }, 'high');

  await T('FIRSTRUN-04', 'First run', 'The key field is disabled until "I am 18 or older" is ticked, and the step names the terms in plain words', async () => {
    const c = await frSession();
    for (let i = 0; i < 3; i++) await frNext(c);
    expect(await frStepNo(c) === 4, 'on step ' + await frStepNo(c));
    const ta = fr(c).locator('textarea');
    expect(await ta.isDisabled() && await fr(c).getByRole('button', { name: 'Save key' }).isDisabled(), 'the key field is enabled without the age confirmation');
    const t = await fr(c).innerText();
    expect(/aistudio\.google\.com\/apikey/.test(t) && /stays on this device/.test(t) && /sent to Google Gemini with your key/.test(t) && /improve its products/.test(t) && /Adults only/.test(t) && /EEA, UK or Switzerland/.test(t) && /Nothing breaks if you skip/.test(t), 'terms text missing: ' + t.slice(0, 300));
    await fr(c).getByText('I am 18 or older').click(); await c.page.waitForTimeout(200);
    expect(!(await ta.isDisabled()), 'still disabled after ticking');
    await c.close();
  }, 'high');

  await T('FIRSTRUN-05', 'First run', 'Back works, Skip is on every step, progress is kept, and the Welcome tour row in Settings reopens it where it stopped', async () => {
    const c = await frSession();
    for (let i = 1; i <= 6; i++) {
      expect(await frStepNo(c) === i && await fr(c).getByRole('button', { name: 'Skip', exact: true }).isVisible(), 'step ' + i + ' has no visible Skip');
      if (i < 3) await frNext(c); else if (i === 3) break;
    }
    await fr(c).getByRole('button', { name: 'Back', exact: true }).click(); await c.page.waitForTimeout(300);
    expect(await frStepNo(c) === 2, 'Back did not go to step 2');
    await frNext(c); await frNext(c);                                  // 3 -> 4
    expect(await frStepNo(c) === 4, 'did not reach step 4');
    await c.page.keyboard.press('Escape'); await c.page.waitForTimeout(500);
    expect(!(await frOpen(c)) && await frKey(c, 'scout.firstRun.v1') === 'closed' && await frKey(c, 'scout.firstRun.step') === '4', 'Escape: open ' + await frOpen(c) + ', key ' + await frKey(c, 'scout.firstRun.v1'));
    await c.page.reload({ waitUntil: 'load' }); await c.page.waitForTimeout(2800);
    expect(!(await frOpen(c)), 'it came back after leaving with Escape');
    await c.go('HOME'); await c.page.getByText('Welcome tour', { exact: true }).click(); await c.page.waitForTimeout(500);
    expect(await frOpen(c) && await frStepNo(c) === 4, 'the tour did not reopen at step 4 (step ' + (await frOpen(c) ? await frStepNo(c) : 'closed') + ')');
    for (let i = 4; i < 6; i++) await frNext(c);
    expect(await frStepNo(c) === 6 && /Delete my account/.test(await fr(c).innerText()) === false, 'step 6 (signed out shows no delete row)');
    await frNext(c); await c.page.waitForTimeout(400);
    expect(!(await frOpen(c)) && await frKey(c, 'scout.firstRun.v1') === 'done', 'Done did not finish');
    await c.close();
  }, 'high');

  await T('FIRSTRUN-06', 'First run', 'The system back gesture leaves it and it never opens over an import in progress', async () => {
    const c = await frSession();
    await c.page.goBack().catch(() => {}); await c.page.waitForTimeout(600);
    expect(!(await frOpen(c)) && await frKey(c, 'scout.firstRun.v1') === 'closed', 'back did not close it (open ' + await frOpen(c) + ')');
    await c.set({ ocrBusy: true }); await c.page.waitForTimeout(200);
    await c.go('HOME'); await c.page.getByText('Welcome tour', { exact: true }).click(); await c.page.waitForTimeout(500);
    expect(!(await frOpen(c)), 'it opened over an import in progress');
    await c.set({ ocrBusy: false }); await c.page.waitForTimeout(200);
    await c.page.getByText('Welcome tour', { exact: true }).click(); await c.page.waitForTimeout(500);
    expect(await frOpen(c), 'it did not open once the import was over');
    await c.close();
  }, 'high');

  await T('FIRSTRUN-07', 'First run', 'Signed-out completion: a CSV picked on step 2 imports and closes the page; step 6 is Done', async () => {
    const c = await frSession();
    await frNext(c);
    await fr(c).locator('input[type=file][accept=".csv"]').setInputFiles(QA); await c.page.waitForTimeout(1500);
    const st = await c.state();
    expect(!(await frOpen(c)) && rn(st) > 10 && !st.cloudUser && await frKey(c, 'scout.firstRun.v1') === 'closed', 'open ' + await frOpen(c) + ', roster ' + rn(st));
    await c.close();
  }, 'high');

  await T('FIRSTRUN-08', 'First run', 'Sign-in from step 1 works, shows who is signed in and offers Continue', async () => {
    const E = { store: {}, writes: [], user: null, popups: [{ account: GA }] };
    const c = await frSession({ cloud: E });
    await fr(c).getByRole('button', { name: 'Continue with Google' }).click(); await c.page.waitForTimeout(1500);
    const t = await fr(c).innerText();
    expect(/Signed in as\s+gee@example\.test/.test(t) && (await c.state()).cloudUser.uid === 'g-1', 'step 1 after sign-in: ' + t.slice(0, 200));
    await c.close();
  }, 'high');

  // The overlay against the same conformance and contrast scans as every other screen, and axe, at four widths in both themes.
  for (const th of ['dark', 'light']) {
    await T('FIRSTRUN-09-' + th, 'First run', 'All six steps and the email form: no overflow, type scale and radii conformance, contrast, no unnamed controls (' + th + ', widths 320/390/402/768)', async () => {
      const bad = [];
      for (const w of [320, 390, 402, 768]) {
        const c = await frSession({ width: w, height: w === 768 ? 1024 : 800, colorScheme: th, sentenceCase: true, cloud: { store: {}, writes: [], user: null } });
        for (let step = 1; step <= 6; step++) {
          if (step === 1) { await fr(c).getByRole('button', { name: 'Use email' }).click(); await c.page.waitForTimeout(250); }
          await c.page.waitForTimeout(450);
          if (!(await fr(c).getByRole('button', { name: 'Skip', exact: true }).isVisible())) bad.push(w + '/' + step + ' Skip not visible');
          const o = await c.page.evaluate(() => { const d = document.querySelector('[data-firstrun]'); return { ox: d.scrollWidth - d.clientWidth, win: document.documentElement.scrollWidth - window.innerWidth }; });
          if (o.ox > 0 || o.win > 0) bad.push(w + '/' + step + ' overflow ' + JSON.stringify(o));
          const conf = await c.page.evaluate(SC.CONFORM, { SIZES: SC.SIZES, WEIGHTS: SC.WEIGHTS, RADII: SC.RADII });
          ['type', 'radii', 'stroke', 'emoji', 'caps', 'spacing'].forEach(k => conf[k].forEach(x => bad.push(w + '/' + step + ' ' + k + ': ' + x)));
          const con = await c.page.evaluate(SC.CONTRAST);
          con.bad.forEach(x => bad.push(w + '/' + step + ' contrast: ' + x));
          const names = await c.page.evaluate(() => [...document.querySelectorAll('[data-firstrun] button, [data-firstrun] input, [data-firstrun] textarea, [data-firstrun] a, [data-firstrun] [role=button]')].filter(e => e.getBoundingClientRect().width > 0 && !(e.getAttribute('aria-label') || e.textContent || e.getAttribute('placeholder') || (e.labels && e.labels[0] && e.labels[0].textContent) || '').trim()).length);
          if (names) bad.push(w + '/' + step + ' ' + names + ' unnamed controls');
          if (w === 390) {
            await c.page.evaluate(src => { if (!window.axe) (0, eval)(src); }, AXE);
            const ax = await c.page.evaluate(async () => (await window.axe.run(document.querySelector('[data-firstrun]'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] } })).violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id + '(' + v.nodes.length + ')'));
            ax.forEach(x => bad.push(w + '/' + step + ' axe ' + x));
          }
          if (step < 6) await frNext(c);
        }
        await c.close();
      }
      expect(bad.length === 0, [...new Set(bad)].slice(0, 12).join(' | '));
    }, 'high');
  }
};
