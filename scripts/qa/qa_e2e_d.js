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
    expect(t.attr === null && /242, 242, 245/.test(t.bg) && /Auto/.test(t.label), 'auto in a light phone is light: ' + JSON.stringify(t));
    t = await tap(); expect(t.attr === 'light' && /Light/.test(t.label) && t.ls === 'light', 'first tap is Light: ' + JSON.stringify(t));
    expect(/Theme: Light/.test(await sl.text()), 'a note says which mode it landed on');
    t = await tap(); expect(t.attr === 'dark' && /11, 11, 13/.test(t.bg) && /Dark/.test(t.label) && t.ls === 'dark', 'second tap is Dark: ' + JSON.stringify(t));
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
    await e1.call('signOutCloud'); await e1.page.waitForTimeout(1500);
    let st = await e1.state();
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
    // B takes over without A signing out first: A's data must not be written into B's document.
    await e1.page.evaluate(u => window.__qaAuth.signIn(u), B); await e1.page.waitForTimeout(2800);
    await e1.call('pushCloud'); await e1.page.waitForTimeout(1500);
    st = await e1.state();
    const b = E.store['scoutUsers/qa-user-b'];
    const bb = b ? await e1.call('unpackCloudBlob', b) : {};
    expect((st.roster || []).length + (st.addedPokemon || []).length === 0 && ((bb.roster || []).length + (bb.addedPokemon || []).length) === 0, 'switching accounts carried A\'s roster into B: ' + ((bb.roster || []).length + (bb.addedPokemon || []).length) + ' Pokemon in B\'s document');
    expect(await localCount(e1) === 0, 'B\'s device copy holds A\'s roster after the switch');
    // A signed-out device that reloads shows nothing of A.
    await e1.call('signOutCloud'); await e1.page.waitForTimeout(800); E.user = null;
    await e1.page.reload({ waitUntil: 'load' }); await e1.page.waitForTimeout(3000);
    st = await e1.state();
    expect(!st.cloudUser && (st.roster || []).length + (st.addedPokemon || []).length === 0 && await localCount(e1) === 0, 'a signed-out reload shows or keeps A\'s data');
    await e1.close();
  }, 'critical');
};
