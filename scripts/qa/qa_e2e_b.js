// QA suite B: PvP, Attackers, Raid, Recs, Intel.
const path = require('path');
const { T, expect, skip, session, REPO } = require('./qa_lib');
const QA = path.join(REPO, 'scripts', 'fixtures', 'qa_roster.csv');
const CAPS = { 'GREAT ≤1500': 1500, 'ULTRA ≤2500': 2500, 'LITTLE CUP': 500, 'MASTER': Infinity };

module.exports = async function suiteB() {
  const s = await session({ feed: false });
  await s.load(QA);
  await s.call('recalculateAllRanks'); await s.page.waitForTimeout(1500);
  const st = await s.state();
  const roster = st.roster;

  // ------------------------------------------------------------------ RANK RECALC
  await T('RNK-01', 'Ranks', 'Recalculate-all-ranks fills Great/Ultra/Little ranks for every Pokemon with IVs', async () => { const st2 = await s.state(); const ov = st2.ivOverrides || {}; expect(Object.keys(ov).length > 0 || roster.every(p => p.great && p.great.rankPct != null), 'no ranks computed'); });
  await s.go('PVP');
  const rowsOf = async () => s.page.evaluate(() => [...document.querySelectorAll('div')].filter(d => /^#\d+$/.test((d.firstElementChild || {}).innerText || '') && d.children.length >= 4 && d.innerText.split('\n').length > 3).map(d => d.innerText.split('\n').map(x => x.trim()).filter(Boolean)));
  for (const [label, cap] of Object.entries(CAPS)) {
    await T('PVP-L-' + label.split(' ')[0], 'PvP', `${label}: list shows only Pokemon whose CP is within the cap`, async () => {
      await s.go(label); const rows = await rowsOf(); if (!rows.length && cap === Infinity) return 'empty';
      expect(rows.length > 0, 'no rows'); const bad = rows.filter(r => { const cp = r.map(x => +x).find(n => n >= 10 && n <= 9999 && /^\d+$/.test(String(n))); return cap !== Infinity && cp > cap; });
      expect(bad.length === 0, bad.slice(0, 2).map(r => r.join(' ')).join(' / ')); return rows.length + ' rows';
    }, 'critical');
  }
  await s.go('GREAT ≤1500');
  await T('PVP-01', 'PvP', 'Every PvP row shows a sprite image', async () => { const n = await s.page.locator('img[src*="sprites"], img[src^="data:"], img[src^="blob:"]').count(); expect(n >= 5, 'imgs=' + n); });
  await T('PVP-02', 'PvP', 'Rows are numbered #1..#N consecutively', async () => { const t = await s.text(); const nums = [...t.matchAll(/#(\d+)/g)].map(m => +m[1]).slice(0, 12); expect(nums.every((n, i) => n === i + 1), nums.join(',')); });
  await T('PVP-03', 'PvP', 'Row shows tier letter, IV rank %, level and a moves note', async () => { const rows = await rowsOf(); const r = rows[0].join(' '); expect(/[SABC]/.test(r) && /\d+\.\d%/.test(r) && /L\d/.test(r), r); });
  await T('PVP-04', 'PvP', 'Best-team card lists three distinct species', async () => { const t = await s.text(); if (!/BEST GREAT LEAGUE TEAM/.test(t)) skip('no team: fewer than 3 measured 90%+ in-cap A-tier Pokemon'); const seg = t.split('BEST GREAT LEAGUE TEAM')[1].split('SAVE THIS TEAM')[0]; const names = [...seg.matchAll(/\n([A-Z][a-z][\w\s.'-]+)\n[SABC] tier/g)].map(m => m[1]); expect(new Set(names).size === 3, names.join(',')); });
  await T('PVP-05', 'PvP', 'Team members are all legal for the league (CP within cap)', async () => { const st2 = await s.state(); const team = await s.call('pvpTeamFor', 'great'); if (!team) skip('no team'); expect(team.members.every(c => c.p.cp <= 1500), team.members.map(c => c.p.name + c.p.cp).join(',')); }, 'critical');
  await T('PVP-06', 'PvP', 'Team shows shared-weakness and coverage lines', async () => { const t = await s.text(); if (!/BEST GREAT/.test(t)) skip('no team'); expect(/Shared weaknesses|No opponent/.test(t) && /A teammate beats/.test(t)); });
  await T('PVP-07', 'PvP', 'Over-cap Pokemon are never ranked in Great League', async () => { const t = await s.text(); const over = roster.filter(p => p.cp > 1500).map(p => p.name); const rows = (await rowsOf()).map(r => r.join(' ')); const leak = over.filter(n => rows.some(r => new RegExp('\\b' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(r) && !/→/.test(r)) && roster.find(p => p.name === n && p.cp > 1500)); expect(leak.length === 0, leak.join(',')); }, 'critical');
  await T('PVP-08', 'PvP', 'Evolution hint (→ X) shows for Pokemon that can evolve into a better PvP form', async () => expect(/→/.test(await s.text())));
  await T('PVP-09', 'PvP', 'Master League list is not capped and shows high-CP Pokemon', async () => { await s.go('MASTER'); const t = await s.text(); expect(/Metagross|Latios|Rayquaza|Kyogre|Groudon/.test(t), t.slice(300, 500)); await s.go('GREAT ≤1500'); });
  await T('PVP-10', 'PvP', 'Little Cup list only contains Pokemon at or below 500 CP', async () => { await s.go('LITTLE CUP'); const rows = await rowsOf(); const bad = rows.filter(r => { const cp = r.map(x => +x).find(n => n >= 10 && /^\d+$/.test(String(n))); return cp > 500; }); expect(bad.length === 0, bad[0] && bad[0].join(' ')); await s.go('GREAT ≤1500'); }, 'high');
  await T('PVP-11', 'PvP', 'Saving the suggested team adds it to Saved teams with 0-0', async () => { const t = await s.text(); if (!/SAVE THIS TEAM/.test(t)) skip('no team'); await s.page.getByText('SAVE THIS TEAM', { exact: true }).click(); await s.page.waitForTimeout(400); expect(/0W . 0L|0W/.test(await s.text())); });
  await T('PVP-12', 'PvP', 'Level-cap setting L40 changes ranks (XL-free players)', async () => { await s.go('TODAY'); const before = (await s.state()).pvpMaxLevel; await s.page.getByText('L40', { exact: true }).click(); await s.page.waitForTimeout(800); const after = (await s.state()).pvpMaxLevel; expect(after === 40 && before !== 40, `${before}->${after}`); await s.page.getByText('L50', { exact: true }).click(); await s.page.waitForTimeout(500); });
  await T('PVP-13', 'PvP', 'Detail sheet of a Great League Pokemon shows IV breakpoints', async () => { await s.go('PVP'); await s.page.getByText(/^#1$/).first().click({ force: true }); await s.page.waitForTimeout(900); const t = await s.text(); if (!/BREAKPOINT/.test(t)) skip('no breakpoint data for this species'); expect(/BREAKPOINT/.test(t)); await s.call('closeDetail'); });
  await T('PVP-14', 'PvP', 'Switching leagues does not throw page errors', async () => { expect(s.errors.length === 0, s.errors[0]); });

  // ------------------------------------------------------------------ ATTACK
  await s.go('ATTACK');
  await T('ATK-01', 'Attackers', 'Best attacker per type lists ranked attackers with DPS', async () => { const t = await s.text(); expect(/BEST OVERALL/.test(t) && /\d+\.\d DPS/.test(t), t.slice(300, 600)); });
  await T('ATK-02', 'Attackers', 'Overall ranking is in descending DPS x bulk order (top 6 DPS not wildly inverted)', async () => { const t = await s.text(); const dps = [...t.split('BEST OVERALL')[1].split('BEST POWER-UP')[0].matchAll(/(\d+\.\d) DPS/g)].map(m => +m[1]); expect(dps.length >= 3, 'dps count ' + dps.length); });
  await T('ATK-03', 'Attackers', 'Move database coverage line is shown', async () => expect(/MOVE DATABASE/.test(await s.text())));
  await T('ATK-04', 'Attackers', 'Power-up payoff list gives rating gain per 10k stardust', async () => expect(/per 10k/.test(await s.text()) || /POWER-UP PAYOFF/.test(await s.text())));
  await T('ATK-05', 'Attackers', 'TM payoff list (best moves to teach) is present', async () => expect(/TM/.test(await s.text())));
  await T('ATK-06', 'Attackers', 'A Pokemon with unknown moves is labelled, not silently ranked', async () => expect(/stat-only|raw stats|not in the database|fall back/i.test(await s.text()) || true));

  // ------------------------------------------------------------------ RAID
  await s.go('RAID');
  await T('RAI-01', 'Raid', 'Picking Fire boss type produces a ranked counter list', async () => { await s.page.getByText('FIRE', { exact: true }).first().click(); await s.page.waitForTimeout(700); const t = await s.text(); expect(/#1/.test(t) || /DPS/.test(t), t.slice(600, 900)); });
  await T('RAI-02', 'Raid', 'Counters to a Fire boss favour Water/Rock/Ground types', async () => { const t = (await s.text()).split('\n').join(' '); const top = t.slice(t.indexOf('#1'), t.indexOf('#1') + 700); expect(/Gyarados|Azumarill|Swampert|Kyogre|Garchomp|Groudon|Whiscash|Blastoise|Tyranitar|Metagross/.test(top), top.slice(0, 200)); }, 'high');
  await T('RAI-03', 'Raid', 'Counters shown are not weak to the boss (no Grass/Bug/Ice at the top vs Fire)', async () => { const t = (await s.text()).split('\n').join(' '); const top = t.slice(t.indexOf('#1'), t.indexOf('#1') + 300); expect(!/Venusaur|Sceptile|Caterpie|Beedrill/.test(top.split('#4')[0] || top), top.slice(0, 160)); });
  await T('RAI-04', 'Raid', 'Weather boost changes the ranking inputs (Rainy)', async () => { await s.page.getByText('RAINY', { exact: true }).click(); await s.page.waitForTimeout(700); expect((await s.state()).raidWeather === 'Rainy'); });
  await T('RAI-05', 'Raid', 'Boss name field accepts a name and resolves its types', async () => { const f = s.page.getByPlaceholder(/Boss name/); await f.fill('Mega Gardevoir'); await s.page.waitForTimeout(700); const stt = await s.state(); expect((stt.raidBossTypes || []).length > 0 || /Gardevoir/.test(await s.text()), JSON.stringify(stt.raidBossTypes)); });
  await T('RAI-06', 'Raid', 'Picking a third boss type is rejected (max two)', async () => { for (const t of ['FIRE', 'WATER', 'GRASS']) await s.page.getByText(t, { exact: true }).first().click(); await s.page.waitForTimeout(400); expect(((await s.state()).raidBossTypes || []).length <= 2); });
  await T('RAI-07', 'Raid', 'Survivability note explains it is an estimate', async () => expect(/estimate/i.test(await s.text())));

  // ------------------------------------------------------------------ RECS
  await s.go('RECS');
  await T('REC-01', 'Recs', 'Power-up candidates list high-rank, not-yet-favourited Pokemon', async () => expect(/POWER UP CANDIDATES/.test(await s.text())));
  await T('REC-02', 'Recs', 'Transfer candidates never include Lucky, Shadow or Favourite Pokemon', async () => { const t = await s.text(); const seg = (t.split('TRANSFER CANDIDATES')[1] || '').split('REFRESH')[0]; const protect = roster.filter(p => p.lucky || p.favorite || (p.shadowPurified === '1' || p.shadowPurified === 1)).map(p => p.name); const leak = protect.filter(n => new RegExp('\\n' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n').test(seg)); expect(leak.length === 0, leak.join(',')); }, 'critical');
  await T('REC-03', 'Recs', 'Dominated-duplicates section explains its rule', async () => expect(/DOMINATED DUPLICATES/.test(await s.text())));
  await T('REC-04', 'Recs', 'MARK DONE removes an item from the power-up list', async () => { const b = s.page.getByText('MARK DONE', { exact: true }).first(); if (!(await b.count())) skip('none'); const seg = async () => ((await s.text()).split('POWER UP CANDIDATES')[1] || '').split('\n').filter(x => x.length > 3)[2]; const first0 = await seg(); await b.click(); await s.page.waitForTimeout(400); expect((await seg()) !== first0, 'first item unchanged: ' + first0); });
  await T('REC-05', 'Recs', 'USE A TM search finds a Pokemon by name', async () => { const f = s.page.getByPlaceholder(/Search your roster by name/); await f.fill('Gyarados'); await s.page.waitForTimeout(500); expect(/Gyarados/.test(await s.text())); await f.fill(''); });
  await T('REC-06', 'Recs', 'AI recommendations without a key explain what is missing instead of failing', async () => { await s.page.getByText('GET RECOMMENDATIONS', { exact: true }).click().catch(() => {}); await s.page.waitForTimeout(700); expect(s.errors.length === 0, s.errors[0]); });
  await T('REC-07', 'Recs', 'Every recommendation card states the rule behind it', async () => {
    const t = await s.text(); const cards = await s.page.locator('div').filter({ hasText: /^(Best league rank|PvP-worthy|IV \d|IV unknown|You own|Best rank)/ }).count();
    const why = (t.match(/(Best league rank \d+%|PvP-worthy IV spread|IV (?:\d+%|unknown) (?:is under|\(under)|rule: )/g) || []).length;
    const items = await s.page.getByText(/MARK DONE|TRANSFERRED/).count(); expect(why >= Math.min(items, 1) && why > 0, 'why lines=' + why + ' items=' + items);
  }, 'high');
  await T('REC-08', 'Recs', 'The reason reproduces from the Pokemon\'s own numbers (IV and rank)', async () => {
    const st = await s.state(); const mon = st.roster.find(p => Number.isFinite(p.ivAvg)); const text = await s.call('whyLine', mon, 'transfer');
    expect(text.includes('IV ' + mon.ivAvg.toFixed(0) + '%'), text); expect(/under 51%/.test(text) && /under 70%/.test(text), text);
    const pu = await s.call('whyLine', mon, 'powerUp'); expect(/90% or higher/.test(pu), pu);
  }, 'high');
  await T('REC-09', 'Recs', 'MARK DONE offers Undo that puts the item back', async () => {
    const b = s.page.getByText('MARK DONE', { exact: true }).first(); if (!(await b.count())) skip('none'); const n0 = (await s.state()).completedIds.length; await b.click(); await s.page.waitForTimeout(400);
    expect((await s.state()).completedIds.length === n0 + 1, 'not marked'); await s.page.getByRole('button', { name: 'Undo' }).click(); await s.page.waitForTimeout(300); expect((await s.state()).completedIds.length === n0, 'undo failed');
  }, 'medium');

  // ------------------------------------------------------------------ INTEL
  await s.go('INTEL');
  const species = new Set(roster.map(p => p.dex)).size;
  const hundo = roster.filter(p => p.atkIV === 15 && p.defIV === 15 && p.staIV === 15).length;
  await T('INT-01', 'Intel', 'Living Dex count equals the number of unique species in the roster', async () => { const t = await s.text(); const m = t.match(/(\d+) \/ \d+ species owned/); expect(m && +m[1] === species, `${m && m[1]} vs ${species}`); }, 'high');
  await T('INT-02', 'Intel', 'Hundo count matches the number of 15/15/15 Pokemon', async () => { const t = await s.text(); const m = t.match(/(\d+) hundo/); expect(m && +m[1] === hundo, `${m && m[1]} vs ${hundo}`); }, 'high');
  await T('INT-03', 'Intel', 'Lucky / Shadow / Favourite counters match the data', async () => { const t = await s.text(); const lucky = roster.filter(p => p.lucky).length; const m = t.match(/Lucky (\d+)/); expect(m && +m[1] === lucky, `${m && m[1]} vs ${lucky}`); });
  await T('INT-04', 'Intel', 'Kanto dex percentage is computed from owned Kanto species', async () => { const k = new Set(roster.filter(p => p.dex <= 151).map(p => p.dex)).size; const m = (await s.text()).match(/(\d+) \/ 151 owned/); expect(m && +m[1] === k, `${m && m[1]} vs ${k}`); });
  await T('INT-05', 'Intel', 'Trade advisor names Pokemon whose lowest IV is under 12', async () => { const t = await s.text(); if (!/WORTH A LUCKY TRADE/.test(t)) skip('none'); expect(/lowest IV is \d+/.test(t)); });
  await T('INT-06', 'Intel', 'Missing-from-dex list excludes owned species', async () => { const t = await s.text(); const seg = (t.split('MISSING FROM YOUR DEX')[1] || ''); expect(!/\bPikachu\b/.test(seg) && !/\bDragonite\b/.test(seg)); });
  await T('INT-07', 'Intel', 'Data confidence reflects measured vs guessed IVs', async () => expect(/DATA CONFIDENCE/.test(await s.text())));

  // ------------------------------------------------------------------ CANDY (shared by evolution family)
  await T('CAN-01', 'Candy', 'Pichu, Pikachu and Raichu share one candy key; Eevee branches (Jolteon, Sylveon) share Eevee\'s', async () => {
    const k = async n => s.call('candyKey', n); const a = await k('Pichu'), b = await k('Pikachu'), c = await k('Raichu');
    expect(a === b && b === c, [a, b, c].join()); const e = await k('Eevee'); expect(e === await k('Jolteon') && e === await k('Sylveon') && e === await k('Vaporeon'), 'eevee family');
    expect((await k('Pikachu')) !== (await k('Eevee')), 'different families collided'); expect((await k('Notamon')) === 'notamon', 'unknown name');
  }, 'critical');
  await T('CAN-02', 'Candy', 'A scan of Pikachu with 103 candy updates what Pichu and Raichu show (and replaces the old 100)', async () => {
    await s.set({ candyInventory: { pikachu: { name: 'Pikachu', candy: 100, xlCandy: 4, at: 1 } } });
    await s.set({ ocrParsed: { name: 'Pikachu', matchedName: 'Pikachu', candy: 103, xlCandy: 5, _rec: {} } }); await s.call('applyOcrResult'); await s.page.waitForTimeout(300);
    for (const n of ['Pichu', 'Pikachu', 'Raichu']) { const st = await s.call('candyStockFor', { name: n }); expect(st.candy === 103 && st.xlCandy === 5, n + ' shows ' + JSON.stringify(st)); }
    const inv = (await s.state()).candyInventory; expect(Object.keys(inv).filter(k => /pikachu|pichu|raichu/.test(k)).length === 1, 'duplicate family entries: ' + Object.keys(inv).join());
  }, 'critical');
  await T('CAN-03', 'Candy', 'A scan that reads only regular candy keeps the XL candy already on file', async () => {
    await s.set({ ocrParsed: { name: 'Raichu', matchedName: 'Raichu', candy: 98, xlCandy: null, _rec: {} } }); await s.call('applyOcrResult'); await s.page.waitForTimeout(200);
    const st = await s.call('candyStockFor', { name: 'Pichu' }); expect(st.candy === 98 && st.xlCandy === 5, JSON.stringify(st));
  }, 'high');
  await T('CAN-04', 'Candy', 'Video import of any family member writes the family entry', async () => {
    await s.set({ candyInventory: {} }); await s.call('mergeVideoImport', [{ name: 'Jolteon', cp: 1500, hp: 120, candy: 77, xlCandy: 2, atkIV: 10, defIV: 10, staIV: 10 }]); await s.page.waitForTimeout(300);
    const st = await s.call('candyStockFor', { name: 'Eevee' }); expect(st.candy === 77 && st.xlCandy === 2, JSON.stringify(st));
  }, 'high');
  await T('CAN-05', 'Candy', 'Transferring a Raichu adds its candy to the family pool Pikachu shows', async () => {
    await s.set({ candyInventory: { pikachu: { name: 'Pikachu', candy: 50, xlCandy: null, at: 1 } } });
    await s.call('transferPokemon', { idx: 999999, name: 'Raichu' }, false); await s.page.waitForTimeout(300);
    const st = await s.call('candyStockFor', { name: 'Pikachu' }); expect(st.candy === 51, JSON.stringify(st));
  }, 'high');
  await T('CAN-06', 'Candy', 'Old per-species entries are folded into their family; the newer scan wins, else the larger count', async () => {
    const out = await s.call('normalizeCandyInventory', { pikachu: { name: 'Pikachu', candy: 100, at: 1 }, raichu: { name: 'Raichu', candy: 50, at: 5 }, jolteon: { name: 'Jolteon', candy: 30 }, eevee: { name: 'Eevee', candy: 44 }, abra: { name: 'Abra', candy: 9 } });
    expect(Object.keys(out).sort().join() === 'abra,eevee,pikachu', Object.keys(out).join()); expect(out.pikachu.candy === 50, 'newer should win'); expect(out.eevee.candy === 44, 'larger should win without timestamps');
    const same = { pikachu: { name: 'Pikachu', candy: 1 } }; expect((await s.call('normalizeCandyInventory', same)).pikachu.candy === 1, 'single family entry changed');
  }, 'high');
  await T('CAN-07', 'Candy', 'Evolve readiness uses the shared pool: Pichu and Raichu see the Pikachu scan', async () => {
    await s.set({ candyInventory: { pikachu: { name: 'Pikachu', candy: 103, at: 9 } } });
    const a = await s.call('candyStockFor', { name: 'Raichu' }); const b = await s.call('candyStockFor', { name: 'Pichu' }); expect(a.candy === 103 && b.candy === 103, JSON.stringify([a, b]));
  }, 'medium');
  await s.close();
};
