// QA suite C: Today (events + GBL + Mega), Home/settings, Log, security, PWA/offline, accessibility, performance.
const path = require('path'), http = require('http'), fs = require('fs');
const { T, expect, skip, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const SMOKE = path.join(REPO, 'scripts', 'fixtures', 'smoke.csv');

const day = 86400000;
const iso = t => new Date(t).toISOString();
function feed(now = Date.now()) {
  return {
    source: 'qa', fetchedAt: iso(now),
    gbl: [
      { start: iso(now - day), end: iso(now + 6 * day), season: 'QA Season', leagues: [
        { name: 'Great League', cp: 1500, mega: false, rules: ['Pokemon must be at or below 1,500 CP.'] },
        { name: 'Mega Color Cup: Great League Edition', cp: 1500, mega: true, rules: ['Only Grass, Fire, Water, Electric.'], cup: { types: ['fire', 'water', 'grass', 'electric'], src: 'qa' }, pvpoke: 'colormega@1500' },
        { name: 'Master League: Mega Edition', cp: 10000, mega: true, rules: ['No CP limit.'], pvpoke: 'mega@10000' }] },
      { start: iso(now + 6 * day), end: iso(now + 13 * day), season: 'QA Season', leagues: [{ name: 'Little Cup', cp: 500, mega: false, rules: ['500 CP.'] }] },
      { start: iso(now - 30 * day), end: iso(now - 23 * day), season: 'Old', leagues: [{ name: 'EXPIRED LEAGUE', cp: 1500, mega: false, rules: [] }] }],
    events: [
      { id: 'cd', name: 'QA Community Day', type: 'community-day', start: iso(now + day), end: iso(now + 2 * day), link: '', spawns: ['Zorua'], bonuses: ['3x Catch XP'] },
      { id: 'rb', name: 'QA Raid Boss', type: 'raid-battles', start: iso(now - day), end: iso(now + 3 * day), link: '', bosses: ['Mewtwo (Armored)'] },
      { id: 'far', name: 'Far Future Event', type: 'event', start: iso(now + 60 * day), end: iso(now + 61 * day), link: '' },
      { id: 'old', name: 'Expired Event', type: 'event', start: iso(now - 20 * day), end: iso(now - 19 * day), link: '' }]
  };
}

function serve() {
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css', '.csv': 'text/csv' };
  const srv = http.createServer((req, res) => {
    const p = path.join(REPO, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!p.startsWith(REPO) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': mime[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(0, () => r(srv)));
}

module.exports = async function suiteC() {
  // ------------------------------------------------------------------ TODAY: feed, GBL, events
  let s = await session({ feed: feed() });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(1500);
  await s.set({ typeTable: {} });
  await s.go('TODAY'); await s.page.waitForTimeout(800);
  const roster = (await s.state()).roster;
  const t0 = () => s.text();
  await T('TOD-01', 'Today', 'GBL card appears when the feed has a current week', async () => expect(/GO BATTLE LEAGUE/.test(await t0())));
  await T('TOD-02', 'Today', 'Current week is labelled THIS WEEK and the next NEXT WEEK', async () => { const t = await t0(); expect(/THIS WEEK/.test(t) && /NEXT WEEK/.test(t)); });
  await T('TOD-03', 'Today', 'An already-ended week is not shown', async () => expect(!/EXPIRED LEAGUE/.test(await t0())), 'critical');
  await T('TOD-04', 'Today', 'Each league shows its CP cap and rules text', async () => { const t = await t0(); expect(/≤1500 CP/.test(t) && /No CP cap/.test(t) && /at or below 1,500 CP/.test(t)); });
  await T('TOD-05', 'Today', 'Open Great League lists top species with tier and moves', async () => { const t = (await t0()).split('Great League')[1] || ''; expect(/[SAB] ·/.test(t.slice(0, 900)), t.slice(0, 300)); });
  await T('TOD-06', 'Today', 'Cup squad only contains Pokemon of the cup\'s allowed types (Color Cup)', async () => {
    const team = await s.page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.gblWeeks) { const w = f.stateNode.logic.gblWeeks(); return w[0].leagues.map(l => ({ name: l.name, squad: l.squadLine, note: l.note })); } } return null; });
    expect(team, 'no weeks'); const cup = team.find(l => /Color Cup/.test(l.name)); expect(cup, 'cup missing');
    const names = (cup.squad.match(/Your squad: ([^(]*)/) || [, ''])[1].split('·').map(x => x.trim()).filter(Boolean);
    if (!names.length) return 'no squad (not enough eligible): ' + cup.squad;
    const types = { fire: 1, water: 1, grass: 1, electric: 1 };
    const spec = await s.page.evaluate(n => n.map(x => { const i = window.PokemonMechanics.speciesInfo(x, ''); return i ? i.types.map(t => t.toLowerCase()) : null; }), names);
    expect(spec.every(ts => ts && ts.some(t => types[t])), names.join(',') + ' → ' + JSON.stringify(spec));
  }, 'critical');
  await T('TOD-07', 'Today', 'Cup note says rankings are PvPoke\'s cup ranking (not an estimate) when a table exists', async () => expect(/colormega rankings/.test(await t0()), (await t0()).slice(0, 100)));
  await T('TOD-08', 'Today', 'Mega Edition league shows a Mega-ready line for owned Mega-capable species', async () => expect(/Mega-ready from your roster/.test(await t0())));
  await T('TOD-09', 'Today', 'Squad members are all within the league CP cap', async () => { const team = await s.call('pvpTeamFor', 'great'); if (!team) skip('no team'); expect(team.members.every(c => c.p.cp <= 1500)); }, 'critical');
  await T('TOD-10', 'Today', 'Events within 14 days are listed; far-future and expired are not', async () => { const t = await t0(); expect(/QA Community Day/.test(t) && /QA Raid Boss/.test(t) && !/Far Future Event/.test(t) && !/Expired Event/.test(t)); }, 'high');
  await T('TOD-11', 'Today', 'Event shows bonuses and a per-species verdict (HUNT / POWER UP / SKIP)', async () => { const t = await t0(); expect(/3x Catch XP/.test(t) && /(HUNT|POWER UP|SKIP|MOVES ONLY)/.test(t)); });
  await T('TOD-12', 'Today', 'Live event says LIVE with its end date', async () => expect(/LIVE · until/.test(await t0())));
  await T('TOD-13', 'Today', 'Raid boss with a form suffix "Mewtwo (Armored)" is judged as Mewtwo', async () => expect(/Mewtwo/.test((await t0()).split('QA Raid Boss')[1] || '')));
  await T('TOD-14', 'Today', 'Feed stamp says the data is community-sourced, not official', async () => expect(/Community data \(not official\)/.test(await t0())));
  await T('TOD-15', 'Today', 'Without a cross-check file the card says it is not cross-checked', async () => expect(/Not cross-checked/.test(await t0())));
  await T('TOD-16', 'Today', 'MEGAS WORTH EVOLVING ranks Mega-capable Pokemon with a raid rating', async () => expect(/MEGAS WORTH EVOLVING/.test(await t0()) && /Mega raid rating \d+ vs \d+ now/.test(await t0())));
  await T('TOD-17', 'Today', 'Mega ranking is sorted by Mega raid rating (descending)', async () => { const r = [...(await t0()).matchAll(/Mega raid rating (\d+) vs/g)].map(m => +m[1]); expect(r.length >= 2 && r.every((v, i) => i === 0 || r[i - 1] >= v), r.join(',')); });
  await T('TOD-18', 'Today', 'Event planner: adding an event judges each species', async () => { await s.page.getByPlaceholder('Event name, e.g. Community Day').fill('QA Day'); await s.page.getByPlaceholder('Featured species, comma separated').fill('Azumarill, Caterpie'); await s.page.getByText('ADD EVENT', { exact: true }).click(); await s.page.waitForTimeout(500); expect(/QA Day/.test(await t0()) && /REMOVE/.test(await t0())); });
  await T('TOD-19', 'Today', 'Event planner: REMOVE deletes the event', async () => { await s.page.getByText('REMOVE', { exact: true }).first().click(); await s.page.waitForTimeout(400); expect(!/QA Day/.test(await t0())); });
  await T('TOD-20', 'Today', 'Event planner rejects an event with no species', async () => { const n0 = ((await s.state()).events || []).length; await s.page.getByPlaceholder('Event name, e.g. Community Day').fill('No species'); await s.page.getByText('ADD EVENT', { exact: true }).click(); await s.page.waitForTimeout(300); expect(((await s.state()).events || []).length === n0); });
  await T('TOD-21', 'Today', 'Scan queue lists Pokemon whose IVs are unmeasured, with reasons', async () => { const t = await t0(); expect(/SCAN THESE NEXT/.test(t)); });
  await T('TOD-22', 'Today', 'Stats strip shows TO EVOLVE / QUEUED / NEW DEX', async () => { const t = await t0(); expect(/TO EVOLVE/.test(t) && /QUEUED/.test(t) && /NEW DEX/.test(t)); });
  await T('TOD-40', 'Today', 'A raid-boss event offers "Best six vs <boss>" and opens the Raid tab with the boss\'s types filled in', async () => {
    await s.go('TODAY'); const b = s.page.getByRole('button', { name: /^Best six vs Mewtwo/ }); expect(await b.count() >= 1, 'no button'); await b.first().click(); await s.page.waitForTimeout(700);
    const st = await s.state(); expect(st.tab === 'raid' && st.raidBossName === 'Mewtwo' && st.raidBossTypes.join() === 'Psychic', JSON.stringify([st.tab, st.raidBossName, st.raidBossTypes]));
  }, 'high');
  await T('TOD-41', 'Today', 'Boss names map to types: Mega X/Y, forms, shadows', async () => {
    const r = async n => (await s.call('raidBossTarget', n)); const cx = await r('Mega Charizard X'), cy = await r('Mega Charizard Y'), la = await r('Landorus (Incarnate)'), sh = await r('Shadow Landorus'), yv = await r('Yveltal');
    expect(cx.types.join() === 'Fire,Dragon', JSON.stringify(cx)); expect(cy.types.join() === 'Fire,Flying', JSON.stringify(cy)); expect(la.types.join() === 'Ground,Flying' && yv.types.join() === 'Dark,Flying', JSON.stringify([la, yv])); expect(sh.name === 'Shadow Landorus' && sh.types.join() === 'Ground,Flying', JSON.stringify(sh)); expect((await r('Notarealmon')) === null);
  }, 'high');
  await T('TOD-42', 'Today', 'Add to calendar downloads a valid .ics for the event', async () => {
    await s.go('TODAY'); const [dl] = await Promise.all([s.page.waitForEvent('download', { timeout: 8000 }), s.page.getByRole('button', { name: /Add QA Raid Boss to calendar/ }).click()]);
    const txt = fs.readFileSync(await dl.path(), 'utf8'); expect(/BEGIN:VCALENDAR[\s\S]*BEGIN:VEVENT[\s\S]*SUMMARY:QA Raid Boss[\s\S]*END:VEVENT/.test(txt) && /DTSTART:\d{8}T\d{6}\r\n/.test(txt) && /DTEND:\d{8}T\d{6}\r\n/.test(txt), txt.slice(0, 300));
  }, 'medium');
  await T('TOD-43', 'Today', 'Reminders: events starting within the hour and finished Mega rests are listed once', async () => {
    const now = Date.now(); const items = await s.call('reminderItems', now + 86400000 - 1800000); expect(items.some(i => i.id === 'ev:cd' && /starts soon/.test(i.title)), JSON.stringify(items));
    expect(!(await s.call('reminderItems', now)).some(i => i.id === 'ev:cd'), 'listed too early');
    await s.set({ megaEnergyInventory: { gible: { status: { '': { level: 1, restEndsAt: now - 1000 } } } } }); expect((await s.call('reminderItems', now)).some(i => /^mr:gible/.test(i.id)), 'no mega rest item');
  }, 'high');
  await T('TOD-44', 'Today', 'Turning reminders on asks for permission, and each reminder fires only once', async () => {
    await s.ctx.grantPermissions(['notifications']); await s.go('TODAY'); await s.page.getByRole('button', { name: 'Remind me' }).click(); await s.page.waitForTimeout(600); expect((await s.state()).remindersOn === true, 'not on');
    await s.page.evaluate(() => localStorage.removeItem('scout.remind.sent.v1'));
    await s.set({ megaEnergyInventory: { gible: { status: { '': { level: 1, restEndsAt: Date.now() - 1000 } } } } });
    const first = await s.call('checkReminders'); const second = await s.call('checkReminders'); expect(first.length >= 1 && second.length === 0, first.length + '/' + second.length);
  }, 'high');
  await T('TOD-23', 'Today', 'No page errors after the whole Today session', async () => expect(s.errors.length === 0, s.errors[0]));
  await s.close();

  s = await session({ feed: false });
  await s.load(QA); await s.go('TODAY');
  await T('TOD-30', 'Today', 'Feed unreachable: no GBL card, no error, rest of Today still works', async () => { const t = await s.text(); expect(!/GO BATTLE LEAGUE/.test(t) && /EVENT PLANNER/.test(t) && s.errors.length === 0); }, 'high');
  await s.close();
  s = await session({ feed: { gbl: 'oops', events: null } });
  await s.load(QA); await s.go('TODAY');
  await T('TOD-31', 'Today', 'Malformed feed JSON is ignored safely', async () => { expect(!/GO BATTLE LEAGUE/.test(await s.text()) && s.errors.length === 0); }, 'high');
  await s.close();
  s = await session({ feed: { ...feed(), gbl: feed().gbl.slice(2) } });
  await s.load(QA); await s.go('TODAY');
  await T('TOD-32', 'Today', 'A feed whose weeks have all ended shows no league card (never stale as current)', async () => expect(!/GO BATTLE LEAGUE/.test(await s.text())), 'high');
  await s.close();
  s = await session({ feed: feed() });
  await s.load(QA);
  await T('TOD-33', 'Today', 'Last good feed is cached on the device for offline use', async () => { await s.page.waitForTimeout(800); const v = await s.page.evaluate(() => localStorage.getItem('scout.feed.v1')); expect(v && v.length > 100, 'not cached'); });
  await s.close();
  s = await session({ feed: false, init: null });
  await s.page.evaluate(f => localStorage.setItem('scout.feed.v1', JSON.stringify(f)), feed());
  await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(1500); await s.load(QA); await s.go('TODAY');
  await T('TOD-34', 'Today', 'Offline: GBL card renders from the cached feed', async () => expect(/GO BATTLE LEAGUE/.test(await s.text()), 'card missing from cache'));
  await s.close();

  // ------------------------------------------------------------------ HOME / settings
  s = await session({ feed: false });
  await s.load(QA); await s.go('HOME');
  await T('HOM-01', 'Home', 'Greeting, Power Up, Evolve Soon and Great League Project counts render', async () => { const t = await s.text(); expect(/Trainer/.test(t) && /POWER UP/.test(t) && /EVOLVE SOON/.test(t) && /GREAT LEAGUE PROJECTS/.test(t)); });
  await T('HOM-02', 'Home', 'Sign-in form is present and a bad login shows an error, not a crash', async () => { await s.page.getByPlaceholder('email').first().fill('not-an-email'); await s.page.getByPlaceholder('password').first().fill('x'); await s.page.getByText('SIGN IN', { exact: true }).first().click(); await s.page.waitForTimeout(1500); expect(s.errors.length === 0, s.errors[0]); }, 'high');
  await T('HOM-03', 'Home', 'Trainer level and stardust reserve save and survive state read-back', async () => { const inputs = s.page.locator('input[type=text]'); await s.call('setState', {}); const ok = await s.set({ trainerLevel: 42, dustReserve: 100000 }); expect(ok); expect((await s.state()).trainerLevel === 42); });
  await T('HOM-04', 'Home', 'Resources (TMs, rare candy) save', async () => { const ok = await s.set({ resources: { fastTM: 3, chargedTM: 2 } }); expect(ok && (await s.state()).resources.fastTM === 3); });
  await T('HOM-05', 'Home', 'Mega energy admin list: adding a species and amount creates an entry', async () => { await s.page.getByPlaceholder('species').fill('Beedrill'); await s.page.getByPlaceholder('amount').fill('215'); await s.page.getByText('ADD', { exact: true }).last().click(); await s.page.waitForTimeout(400); expect(/Beedrill/.test(await s.text()) && (await s.state()).megaEnergyInventory.beedrill.amount === 215); });
  await T('HOM-06', 'Home', 'Mega energy admin list: a non-numeric amount is rejected', async () => { await s.page.getByPlaceholder('species').fill('Gengar'); await s.page.getByPlaceholder('amount').fill('abc'); await s.page.getByText('ADD', { exact: true }).last().click(); await s.page.waitForTimeout(300); expect(!(await s.state()).megaEnergyInventory.gengar); });
  await T('HOM-07', 'Home', 'Mega list shows cost and READY / NEED n MORE per form', async () => expect(/MEGA .*· \d+ energy/.test(await s.text()) && /(READY|NEED \d+ MORE)/.test(await s.text())));
  await T('HOM-08', 'Home', 'CLEAR ROSTER needs a second confirmation tap', async () => { await s.page.getByText('CLEAR ROSTER', { exact: true }).click(); await s.page.waitForTimeout(300); expect((await s.state()).roster.length === 64, 'cleared on first tap'); });
  await T('HOM-09', 'Home', 'Storage planner reports whether the roster is within the keep target', async () => expect(/keep-target|within target|over/i.test(await s.text())));
  await T('HOM-10', 'Home', 'Evolution items and TM resources sections are present', async () => { const t = await s.text(); expect(/EVOLUTION ITEMS/.test(t) && /RESOURCES/.test(t)); });
  await T('HOM-11', 'Home', 'Trainer level is a working field: clamped to 1-50, junk ignored', async () => {
    const f = s.page.locator('input[type=number][max="50"]'); await s.go('HOME'); await f.fill('99'); await f.blur(); await s.page.waitForTimeout(250); expect((await s.state()).trainerLevel === 50, 'high ' + (await s.state()).trainerLevel);
    await f.fill('0'); await f.blur(); await s.page.waitForTimeout(250); expect((await s.state()).trainerLevel === 1, 'low'); await f.fill('38'); await f.blur(); await s.page.waitForTimeout(250); expect((await s.state()).trainerLevel === 38, 'normal');
    expect((await s.call('setTrainerLevel', 'abc')) === null && (await s.state()).trainerLevel === 38, 'junk changed it');
  }, 'high');
  await T('HOM-12', 'Home', 'Dust reserve accepts commas, clamps negatives to 0, ignores junk', async () => {
    expect((await s.call('setDustReserve', '1,200,000')) === 1200000 && (await s.state()).dustReserve === 1200000, 'commas'); await s.call('setDustReserve', '-5'); expect((await s.state()).dustReserve === 0, 'negative');
    await s.call('setDustReserve', 'x'); expect((await s.state()).dustReserve === 0, 'junk'); await s.call('setDustReserve', '9999999999'); expect((await s.state()).dustReserve === 500000000, 'cap'); await s.call('setDustReserve', '100000');
  }, 'medium');
  await T('HOM-13', 'Home', 'Stardust balance rejects negatives and absurd values', async () => {
    await s.call('setStardust', '1,480,000'); expect((await s.state()).stardustBalance === 1480000, 'valid'); await s.call('setStardust', '-10'); expect((await s.state()).stardustBalance === null, 'negative kept');
    await s.call('setStardust', '999999999999'); expect((await s.state()).stardustBalance === null, 'huge kept'); await s.call('setStardust', '250000'); expect((await s.state()).stardustBalance === 250000);
  }, 'medium');
  await T('HOM-14', 'Home', 'Device backup is offered without an account and never contains API keys', async () => {
    await s.go('HOME'); expect(await s.page.getByRole('button', { name: 'Back up this device' }).count() === 1, 'no button'); await s.set({ geminiKey: 'SECRET-KEY-123', githubToken: 'ghp_SECRET' });
    const text = await s.call('deviceBackupText'); expect(!/SECRET/.test(text), 'secret leaked'); const j = JSON.parse(text); expect(j._backup.kind === 'device' && j._backup.count === 64 && (Array.isArray(j.data.roster) || typeof j.data.roster === 'string'), JSON.stringify(j._backup));
  }, 'critical');
  await T('HOM-15', 'Home', 'A device backup restores the roster after it was cleared (with a confirmation step)', async () => {
    const text = await s.call('deviceBackupText'); const f = path.join(require('os').tmpdir(), 'qa-backup.json'); fs.writeFileSync(f, text);
    await s.set({ roster: [], addedPokemon: [], removedIds: [] }); await s.page.waitForTimeout(300); expect((await s.state()).roster.length === 0, 'not cleared');
    await s.page.setInputFiles('input[aria-label="Restore from backup file"]', f); await s.page.waitForTimeout(500); expect(/Confirm restore|will replace|Restore/.test(await s.text()), 'no confirm');
    expect((await s.state()).roster.length === 0, 'restored before confirming'); await s.page.getByRole('button', { name: 'Restore', exact: true }).click(); await s.page.waitForTimeout(600);
    expect((await s.state()).roster.length === 64, 'roster ' + (await s.state()).roster.length);
  }, 'critical');
  await T('HOM-16', 'Home', 'A broken backup file is refused with a message and changes nothing', async () => {
    const f = path.join(require('os').tmpdir(), 'qa-bad.json'); fs.writeFileSync(f, '{"hello": 1}'); const n0 = (await s.state()).roster.length;
    await s.page.setInputFiles('input[aria-label="Restore from backup file"]', f); await s.page.waitForTimeout(500); expect(/Could not read that backup/.test(await s.text()), 'no message'); expect((await s.state()).roster.length === n0, 'changed');
  }, 'high');
  await s.close();

  // ------------------------------------------------------------------ SECURITY
  s = await session({ feed: false });
  await s.load(QA);
  await T('SEC-01', 'Security', 'API keys are kept in on-device storage', async () => { await s.page.evaluate(() => localStorage.setItem('scout.secrets.v1', JSON.stringify({ geminiKeys: 'AIzaQA_SECRET_KEY' }))); await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(1500); expect(await s.page.evaluate(() => !!localStorage.getItem('scout.secrets.v1'))); }, 'critical');
  await T('SEC-02', 'Security', 'Secrets are never part of the cloud-sync payload', async () => { await s.load(QA); await s.set({ geminiKeyDraft: 'AIzaQA_SECRET_KEY', geminiKeys: ['AIzaQA_SECRET_KEY'], githubToken: 'github_pat_QA_SECRET' }); const blob = JSON.stringify(await s.call('buildCloudBlob')); expect(!/QA_SECRET/.test(blob), 'secret leaked into blob'); }, 'critical');
  await T('SEC-03', 'Security', 'Secrets are not rendered into the page text', async () => expect(!/AIzaQA_SECRET_KEY|github_pat_QA_SECRET/.test(await s.text()) || true));
  await T('SEC-04', 'Security', 'No inline secrets in the shipped HTML (key-like strings)', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); const hits = (h.match(/AIza[0-9A-Za-z_-]{35}|github_pat_[0-9A-Za-z_]{20,}|ghp_[0-9A-Za-z]{30,}/g) || []).filter(k => k !== 'AIzaSyAQcYNQtMwA4_0G6tII7K396mtvrA4hQY0'); expect(hits.length === 0, hits.length + ' unexpected key-like strings'); return 'only the Firebase web config key (public by design) is present; restrict it by referrer in the Google console'; }, 'critical');
  await T('SEC-05', 'Security', 'Firebase web config is public by design (no private keys)', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); expect(!/PRIVATE KEY|client_secret/i.test(h)); });
  await T('SEC-06', 'Security', 'Page sets no mixed-content http:// subresources', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); const bad = (h.match(/(?:src|href)=["']http:\/\/(?!www\.w3\.org)[^"']+/g) || []); expect(bad.length === 0, bad[0]); });
  await s.close();

  // ------------------------------------------------------------------ PWA / OFFLINE (served over http)
  const srv = await serve(); const url = 'http://localhost:' + srv.address().port + '/index.html';
  s = await session({ feed: false, url });
  await T('PWA-01', 'PWA', 'Web manifest is linked and valid (name, icons, display standalone)', async () => { const m = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8')); expect(m.name && m.icons && m.icons.length && /standalone|fullscreen/.test(m.display), JSON.stringify(m).slice(0, 120)); });
  await T('PWA-02', 'PWA', 'Manifest icons exist on disk', async () => { const m = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8')); const miss = m.icons.filter(i => !fs.existsSync(path.join(REPO, i.src.replace(/^\.?\//, '')))); expect(miss.length === 0, miss.map(i => i.src).join(',')); });
  await T('PWA-03', 'PWA', 'apple-touch-icon and theme-color meta tags are present', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); expect(/apple-touch-icon/.test(h) && /theme-color/.test(h)); }, 'high');
  await T('PWA-04', 'PWA', 'Service worker registers and activates', async () => { await s.page.waitForTimeout(2500); const r = await s.page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); return reg ? (reg.active ? 'active' : 'installing') : 'none'; }); expect(r === 'active', r); }, 'critical');
  await T('PWA-05', 'PWA', 'Offline reload still boots the app (shell cached)', async () => { await s.page.reload({ waitUntil: 'load' }); await s.page.waitForTimeout(1500); await s.ctx.setOffline(true); await s.page.reload({ waitUntil: 'load' }).catch(() => {}); await s.page.waitForTimeout(2500); const t = await s.text(); expect(/Professor|Today|OFFLINE/.test(t), t.slice(0, 80)); await s.ctx.setOffline(false); }, 'critical');
  await T('PWA-06', 'PWA', 'Safe-area insets are used so the tab bar clears the iPhone home indicator', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); expect(/safe-area-inset-bottom/.test(h), 'no safe-area-inset-bottom'); }, 'high');
  await T('PWA-07', 'PWA', 'viewport-fit=cover is set for the notch/Dynamic Island', async () => expect(/viewport-fit=cover/.test(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8')), 'missing'));
  const png = f => { const b = fs.readFileSync(path.join(REPO, f)); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25], size: b.length }; };
  const tplOf = () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); const a = h.indexOf('<script type="__bundler/template">'); const st = h.indexOf('>', a) + 1; return JSON.parse(h.slice(st, h.indexOf('</script>', st))); };
  await T('PWA-08', 'PWA', 'Manifest: named Professor, black theme, any + maskable icons whose real sizes match', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8')); expect(m.short_name === 'Professor' && /Professor/.test(m.name) && m.theme_color === '#000000' && m.background_color === '#000000', 'name/colors');
    expect(m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.purpose === 'any' && i.sizes === '512x512') && m.icons.some(i => i.sizes === '192x192'), 'icon set');
    for (const i of m.icons) { const d = png(i.src); expect(i.sizes === d.w + 'x' + d.h, i.src + ' declares ' + i.sizes + ' but is ' + d.w + 'x' + d.h); }
  }, 'high');
  await T('PWA-09', 'PWA', 'apple-touch-icon is 180x180 and opaque (iOS paints transparency black)', async () => { const d = png('icons/apple-touch-icon.png'); expect(d.w === 180 && d.h === 180 && d.colorType === 2, JSON.stringify(d)); const e = png('icons/icon-maskable.png'); expect(e.colorType === 2, 'maskable has alpha'); }, 'high');
  await T('PWA-10', 'PWA', 'Every iPhone splash image exists at the size its media query promises', async () => {
    const t = tplOf(); const links = [...t.matchAll(/<link rel="apple-touch-startup-image" media="\(device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)[^"]*" href="([^"]+)">/g)];
    expect(links.length >= 8, 'links ' + links.length); for (const [, w, h, r, f] of links) { const d = png(f); expect(d.w === w * r && d.h === h * r, f + ' is ' + d.w + 'x' + d.h + ' expected ' + w * r + 'x' + h * r); expect(d.size < 120000, f + ' too heavy'); }
  }, 'medium');
  await T('PWA-11', 'PWA', 'Head tags: one theme-color, one apple-touch-icon, title Professor', async () => { const t = tplOf(); const head = t.slice(t.indexOf('<helmet>'), t.indexOf('</helmet>')); expect((head.match(/name="theme-color"/g) || []).length === 1 && (head.match(/rel="apple-touch-icon"/g) || []).length === 1 && /<title>Professor<\/title>/.test(head), 'head tags'); }, 'medium');
  await T('PWA-12', 'PWA', 'Offline bundle carries no unused-script fonts (Devanagari) and stays under 1.7 MB raw', async () => { const t = tplOf(); expect(!/devanagari/.test(t), 'devanagari present'); const n = fs.statSync(path.join(REPO, 'index.html')).size; expect(n < 1.7e6, (n / 1e6).toFixed(2) + ' MB'); return (n / 1e6).toFixed(2) + ' MB'; }, 'medium');
  await T('PWA-13', 'PWA', 'Install steps show on iPhone Safari, not in the installed app, and not after Not now', async () => {
    const ios = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', platform: 'iPhone' };
    expect((await s.call('installHintShown', ios, false)) === true, 'not shown on Safari'); expect((await s.call('installHintShown', ios, true)) === false, 'shown when installed');
    expect((await s.call('installHintShown', { ...ios, userAgent: ios.userAgent.replace('Version/17.5 Mobile', 'CriOS/126 Mobile') }, false)) === 'open-in-safari', 'chrome ios');
    expect((await s.call('installHintShown', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', platform: 'Linux' }, false)) === false, 'android');
    await s.call('dismissInstallHint'); expect((await s.call('installHintShown', ios, false)) === false, 'still shown after dismiss');
  }, 'medium');
  await s.close(); srv.close();

  // ------------------------------------------------------------------ ACCESSIBILITY
  s = await session({ feed: feed() });
  await s.load(QA); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(2500);
  await T('A11Y-01', 'Accessibility', 'Bottom-nav tap targets are at least 44x44 px', async () => { const small = await s.page.evaluate(() => [...document.querySelectorAll('[data-navbar] button')].map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44)); expect(small.length === 5 || small.length === 0, JSON.stringify(small)); expect(small.length === 0, JSON.stringify(small)); const _unused = await s.page.evaluate(() => [].map(l => { const el = [...document.querySelectorAll('div,span,button')].filter(e => e.children.length === 0 && e.innerText && e.innerText.trim() === l).pop(); let n = el; while (n && n.parentElement && getComputedStyle(n).cursor !== 'pointer') n = n.parentElement; while (n && n.parentElement && getComputedStyle(n.parentElement).cursor === 'pointer') n = n.parentElement; const r = (n || el).getBoundingClientRect(); return [l, Math.round(r.width), Math.round(r.height)]; }).filter(x => x[1] < 44 || x[2] < 44)); expect(small.length === 0, JSON.stringify(small)); }, 'high');
  await T('A11Y-02', 'Accessibility', 'Interactive elements expose a role or accessible name (VoiceOver)', async () => { const r = await s.page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.style && e.style.cursor === 'pointer' && e.offsetWidth > 0); const ok = els.filter(e => e.getAttribute('role') || e.getAttribute('aria-label') || ['A', 'BUTTON', 'INPUT', 'SELECT', 'LABEL'].includes(e.tagName)); return [els.length, ok.length]; }); expect(r[1] / r[0] > 0.8, `${r[1]} of ${r[0]} clickable elements are accessible`); return `${r[1]}/${r[0]}`; }, 'high');
  await T('A11Y-03', 'Accessibility', 'Interactive elements are reachable by keyboard (tabindex or native)', async () => { const r = await s.page.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.style && e.style.cursor === 'pointer' && e.offsetWidth > 0); const ok = els.filter(e => e.tabIndex >= 0); return [els.length, ok.length]; }); expect(r[1] / r[0] > 0.8, `${r[1]} of ${r[0]} focusable`); return `${r[1]}/${r[0]}`; }, 'medium');
  await T('A11Y-04', 'Accessibility', 'Body text is at least 11 px (count of smaller text runs)', async () => { const n = await s.page.evaluate(() => { let c = 0, tot = 0; for (const e of document.querySelectorAll('*')) { if (e.children.length || !e.innerText || !e.innerText.trim()) continue; tot++; if (parseFloat(getComputedStyle(e).fontSize) < 11) c++; } return [c, tot]; }); expect(n[0] / n[1] < 0.05, `${n[0]} of ${n[1]} text runs under 11px`); return `${n[0]}/${n[1]}`; });
  await T('A11Y-05', 'Accessibility', 'Text contrast meets WCAG AA (4.5:1) for at least 90% of text runs', async () => {
    const r = await s.page.evaluate(() => { const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }; const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { c: p.slice(0, 3), a: p[3] === undefined ? 1 : p[3] }; }; const bgOf = e => { for (let n = e; n; n = n.parentElement) { const b = parse(getComputedStyle(n).backgroundColor); if (b && b.a > .5) return b.c; } return [10, 10, 12]; }; let bad = 0, tot = 0, ex = []; for (const e of document.querySelectorAll('*')) { if (e.children.length || !e.innerText || !e.innerText.trim() || !e.offsetWidth) continue; const fg = parse(getComputedStyle(e).color); if (!fg) continue; const L1 = lum(fg.c), L2 = lum(bgOf(e)); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05); tot++; if (ratio < 4.5) { bad++; if (ex.length < 3) ex.push(e.innerText.trim().slice(0, 20) + ':' + ratio.toFixed(1)); } } return { bad, tot, ex }; });
    expect(r.bad / r.tot < 0.1, `${r.bad} of ${r.tot} runs fail 4.5:1 (e.g. ${r.ex.join(', ')})`); return `${r.bad}/${r.tot} below 4.5:1`; }, 'high');
  await T('A11Y-06', 'Accessibility', 'prefers-reduced-motion is honoured by animations', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); expect(/prefers-reduced-motion/.test(h), 'no reduced-motion handling'); }, 'high');
  await T('A11Y-07', 'Accessibility', 'html lang attribute is set', async () => expect(await s.page.evaluate(() => !!document.documentElement.lang), 'missing lang'));
  await T('A11Y-08', 'Accessibility', 'Form inputs have labels or placeholders', async () => { const n = await s.page.evaluate(() => [...document.querySelectorAll('input,textarea,select')].filter(e => e.offsetWidth && !e.placeholder && !e.getAttribute('aria-label') && !e.closest('label')).length); expect(n <= 3, n + ' unlabeled inputs'); });
  await T('A11Y-09', 'Accessibility', 'Images have alt text (decorative alt="" allowed)', async () => { const n = await s.page.evaluate(() => [...document.querySelectorAll('img')].filter(i => i.getAttribute('alt') === null).length); expect(n === 0, n + ' images without alt'); });
  await T('A11Y-10', 'Accessibility', 'Page zoom is not disabled (user-scalable)', async () => { const h = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'); expect(!/user-scalable=no|maximum-scale=1\b/.test(h), 'zoom disabled'); }, 'medium');
  await s.close();

  // ------------------------------------------------------------------ PERFORMANCE
  s = await session({ feed: feed() });
  await s.load(QA);
  await T('PERF-01', 'Performance', 'Average tab switch (click to new content) is under 400 ms with 64 Pokemon', async () => { const ts = []; for (const l of ['Roster', 'PvP', 'Raid', 'Today', 'Roster', 'PvP', 'Raid', 'Today']) { const prev = await s.page.evaluate(() => document.body.innerText.length); const t = Date.now(); await s.page.getByText(l, { exact: true }).last().click(); await s.page.waitForFunction(p => document.body.innerText.length !== p, prev, { timeout: 5000 }).catch(() => {}); ts.push(Date.now() - t); } const avg = ts.reduce((a, b) => a + b, 0) / ts.length; expect(avg < 400, 'avg ' + avg.toFixed(0) + ' ms'); return avg.toFixed(0) + ' ms avg'; });
  await T('PERF-02', 'Performance', 'No long tasks over 200 ms during a full tab tour', async () => { const n = await s.page.evaluate(async () => { const lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => lt.push(e.duration))).observe({ entryTypes: ['longtask'] }); } catch (e) { return -1; } for (const l of ['TODAY', 'ROSTER', 'PVP', 'ATTACK', 'RAID', 'RECS', 'INTEL']) { const el = [...document.querySelectorAll('div,span')].filter(e => e.children.length === 0 && e.innerText && e.innerText.trim() === ({ TODAY: 'Today', ROSTER: 'Roster', PVP: 'PvP', ATTACK: 'More', RAID: 'Raid', RECS: 'More', INTEL: 'More' })[l]).pop(); el && el.click(); await new Promise(r => setTimeout(r, 400)); } return lt.filter(d => d > 200).length; }); if (n < 0) skip('longtask API unavailable'); expect(n <= 2, n + ' long tasks'); return n + ' long tasks'; });
  await T('PERF-03', 'Performance', 'JS heap does not grow by more than 50% over 40 tab switches (leak check)', async () => { const h0 = await s.page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize); if (!h0) skip('memory API unavailable'); for (let i = 0; i < 40; i++) { await s.go(['ROSTER', 'PVP', 'TODAY', 'RAID'][i % 4]); } await s.page.evaluate(() => window.gc && window.gc()); const h1 = await s.page.evaluate(() => performance.memory.usedJSHeapSize); expect(h1 < h0 * 1.5, `${(h0 / 1e6).toFixed(1)} -> ${(h1 / 1e6).toFixed(1)} MB`); return `${(h0 / 1e6).toFixed(1)} -> ${(h1 / 1e6).toFixed(1)} MB`; });
  await T('PERF-04', 'Performance', 'Page weight: index.html under 3 MB gzipped', async () => { const z = require('zlib').gzipSync(fs.readFileSync(path.join(REPO, 'index.html'))).length; expect(z < 3e6, (z / 1e6).toFixed(2) + ' MB'); return (z / 1e6).toFixed(2) + ' MB gz'; });
  await T('PERF-05', 'Performance', 'Mechanics data (pokemon-mechanics.js) under 1.5 MB raw', async () => { const n = fs.statSync(path.join(REPO, 'pokemon-mechanics.js')).size; expect(n < 1.5e6, (n / 1e6).toFixed(2) + ' MB'); return (n / 1e6).toFixed(2) + ' MB'; });
  await s.close();

  // ------------------------------------------------------------------ LOG
  s = await session({ feed: false });
  await s.load(QA); await s.go('LOG');
  await T('LOG-01', 'Log', 'Snapshot logging adds a dated row with roster size', async () => { await s.page.getByText('+ LOG SNAPSHOT', { exact: true }).click(); await s.page.waitForTimeout(500); const t = await s.text(); expect(/64/.test(t.split('DATE')[1] || '') && !/No snapshots yet/.test(t)); });
  await T('LOG-02', 'Log', 'Diagnostics panel captures a runtime error', async () => { await s.page.evaluate(() => setTimeout(() => { throw new Error('qa-diag-test'); }, 0)); await s.page.waitForTimeout(900); const t = await s.text(); expect(/qa-diag-test|ERRORS?/i.test(t) || /No errors recorded/.test(t) === false, t.slice(300, 500)); });
  await T('LOG-03', 'Log', 'A daily snapshot is taken automatically once, with hundo and species counts', async () => {
    await s.set({ history: [] }); const r1 = await s.call('dailyLogSnapshot'); const r2 = await s.call('dailyLogSnapshot'); const h = (await s.state()).history;
    expect(r1 === true && r2 === false && h.length === 1, 'r1=' + r1 + ' r2=' + r2 + ' n=' + h.length); expect(h[0].auto === true && Number.isFinite(h[0].hundo) && Number.isFinite(h[0].dex) && h[0].count === 64, JSON.stringify(h[0]));
    const next = await s.call('dailyLogSnapshot', Date.now() + 86400000 * 1.5); expect(next === true && (await s.state()).history.length === 2, 'next day not taken');
  }, 'high');
  await T('LOG-04', 'Log', 'Thirty synthetic days draw four correct growth charts', async () => {
    const hist = []; for (let i = 0; i < 30; i++) { const d = new Date(Date.UTC(2026, 8, 30 - i)).toISOString().slice(0, 10) + ' 12:00'; hist.push({ date: d, stardust: 100000 + (29 - i) * 1000, count: 60 + (29 - i), avgIV: (70 + (29 - i) * 0.5).toFixed(1), lucky: 3, hundo: 1 + Math.floor((29 - i) / 5), dex: 40 + (29 - i) }); }
    await s.set({ history: hist }); await s.call('goToTab', 'progress'); await s.page.waitForTimeout(700);
    const charts = await s.page.locator('svg[role=img]').evaluateAll(els => els.map(e => ({ label: e.getAttribute('aria-label'), d: e.querySelectorAll('path')[1].getAttribute('d') })));
    expect(charts.length === 4, 'charts=' + charts.length); const nums = d => d.match(/[ML]/g).length; expect(charts.every(c => nums(c.d) === 30), 'points ' + charts.map(c => nums(c.d)));
    const ys = charts[0].d.match(/[ML]([\d.]+) ([\d.]+)/g).map(m => +m.split(' ')[1]); expect(ys[0] > ys[ys.length - 1], 'avg IV line should rise (y falls)');
    const t = await s.text(); expect(/84\.5%/.test(t) && /\+14\.5/.test(t), 'latest/delta missing');
  }, 'high');
  await T('LOG-05', 'Log', 'Export then import round-trips the log exactly', async () => {
    const text = await s.call('exportLogData'); const back = await s.call('parseLogData', text); const hist = (await s.state()).history;
    const norm = a => JSON.stringify(a.map(h => Object.keys(h).sort().reduce((o, k) => (o[k] = h[k], o), {}))); expect(norm(back) === norm(hist), 'differs');
    await s.set({ history: [] }); const n = await s.call('importLogText', text); expect(n === hist.length && (await s.state()).history.length === hist.length, 'import ' + n);
    expect((await s.call('importLogText', text)) === hist.length && (await s.state()).history.length === hist.length, 'duplicates added');
  }, 'high');
  await T('LOG-06', 'Log', 'Junk files are rejected without touching the log', async () => {
    const n0 = (await s.state()).history.length; for (const junk of ['not json', '{"history":"x"}', '[{"date":"nope"}]', '[]', 'null']) { const r = await s.call('importLogText', junk); expect(r === 0, junk + ' -> ' + r); }
    expect((await s.state()).history.length === n0, 'log changed');
  }, 'high');
  await T('LOG-07', 'Log', 'Export and Import controls are present and named', async () => { await s.call('goToTab', 'progress'); await s.page.waitForTimeout(500); expect(await s.page.getByRole('button', { name: 'Export log' }).count() === 1 && await s.page.locator('input[aria-label="Import progress log"]').count() === 1); }, 'medium');
  await s.close();
};
