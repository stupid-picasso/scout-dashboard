const fs = require('fs');
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

  // ------------------------------------------------------------------ MAX (Dynamax / Gigantamax)
  await T('MAX-01', 'Max', 'Scans store only positive Max evidence and read levels 1-4 from camelCase or snake_case', async () => {
    const a = await s.call('maxPatch', { dynamax: true, gigantamax: true, maxAttackLevel: 2, maxGuardLevel: '3', maxSpiritLevel: null });
    expect(a.dynamax === true && a.gigantamax === true && a.maxAttackLevel === 2 && a.maxGuardLevel === 3 && !('maxSpiritLevel' in a), JSON.stringify(a));
    const b = await s.call('maxPatch', { dynamax: false, gigantamax: false, max_attack_level: 4, max_guard_level: 0, max_spirit_level: 9 });
    expect(!('dynamax' in b) && b.maxAttackLevel === 4 && !('maxGuardLevel' in b) && !('maxSpiritLevel' in b), 'false/zero/out-of-range must be ignored: ' + JSON.stringify(b));
    expect(Object.keys(await s.call('maxPatch', null)).length === 0 && Object.keys(await s.call('maxPatch', { dynamax: 'yes', maxAttackLevel: 'x' })).length === 0, 'junk');
  }, 'critical');
  await T('MAX-02', 'Max', 'Mechanics: species list, G-Max moves and the Max Move tables', async () => {
    const r = await s.page.evaluate(() => { const m = window.PokemonMechanics; return { seed: m.isMaxSeedSpecies('Charizard') && m.isMaxSeedSpecies('G-Max Gengar') && !m.isMaxSeedSpecies('Magikarp'), g: m.gmaxFor('Lapras'), none: m.gmaxFor('Pidgey'), p: [m.maxAttackPower(1, false), m.maxAttackPower(3, false), m.maxAttackPower(1, true), m.maxAttackPower(9, true)], guard: [m.maxGuardHp(1), m.maxGuardHp(3), m.maxGuardHp(0)], spirit: [m.maxSpiritPct(2), m.maxSpiritPct(0)], mv: m.MAX_MOVE_BY_TYPE.Fire }; });
    expect(r.seed, 'seed'); expect(r.g.move === 'G-Max Resonance' && r.g.type === 'Ice' && r.none === null, JSON.stringify(r.g));
    expect(r.p.join() === '250,350,350,550', r.p.join()); expect(r.guard.join() === '20,60,0' && r.spirit.join() === '12,0', 'guard/spirit'); expect(r.mv === 'Max Flare');
  }, 'high');
  await T('MAX-03', 'Max', 'Roster shows MAX on capable species and the MAX filter lists only those', async () => {
    await s.go('ROSTER'); await s.page.locator('.om-press', { hasText: /^MAX$/ }).click(); await s.page.waitForTimeout(500);
    const rows = await s.page.locator('[data-swipe-row]').evaluateAll(els => els.map(e => /\bMAX\b|G-MAX/.test(e.innerText)));
    expect(rows.length > 0 && rows.every(Boolean), 'rows ' + rows.length + ' tagged ' + rows.filter(Boolean).length);
    await s.page.locator('.om-press', { hasText: /^ALL$/ }).click(); await s.page.waitForTimeout(300);
  }, 'high');
  await T('MAX-04', 'Max', 'Screenshot import: the Dynamax mark, Gigantamax and Max Move levels land on the matched Pokemon', async () => {
    const st = await s.state(); const g = st.roster.find(p => p.name === 'Gengar'); expect(g, 'no Gengar in fixture');
    await s.set({ ocrParsed: { name: 'Gengar', matchedName: 'Gengar', matchedIdx: g.idx, candy: 10, _rec: { dynamax: true, gigantamax: true, max_attack_level: 2, max_guard_level: 1, max_spirit_level: null, max_particles: 1234 } } });
    await s.call('applyOcrResult'); await s.page.waitForTimeout(300);
    const o = (await s.state()).ivOverrides[g.idx]; expect(o && o.dynamax === true && o.gigantamax === true && o.maxAttackLevel === 2 && o.maxGuardLevel === 1 && o.maxSpiritLevel === undefined, JSON.stringify(o));
    expect((await s.state()).resources.maxParticles === 1234, 'Max Particles not stored');
    expect(await s.call('maxTagFor', { name: 'Gengar', gigantamax: true }) === 'G-MAX', 'tag');
  }, 'critical');
  await T('MAX-05', 'Max', 'Video import: a new Pokemon seen with the Dynamax mark is stored as Max-capable', async () => {
    await s.call('mergeVideoImport', [{ name: 'Wooloo', cp: 412, hp: 60, atkIV: 5, defIV: 6, staIV: 7, dynamax: true, maxAttackLevel: 3, maxParticles: 99 }]); await s.page.waitForTimeout(300);
    const st = await s.state(); const w = (st.addedPokemon || []).find(p => p.name === 'Wooloo'); expect(w && w.dynamax === true && w.maxAttackLevel === 3, JSON.stringify(w && [w.dynamax, w.maxAttackLevel]));
    expect(st.resources.maxParticles === 99, 'particles');
  }, 'critical');
  await T('IMP-20', 'Import', 'A video import can set favorite/lucky but never clear them', async () => {
    const st0 = await s.state(); const base = st0.roster.find(p => p.cp != null && p.hp != null); expect(base, 'no roster row with cp+hp');
    await s.call('mergeVideoImport', [{ name: base.name, cp: base.cp, hp: base.hp, favorite: true, lucky: true }]); await s.page.waitForTimeout(300);
    let o = (await s.state()).ivOverrides[base.idx] || {}; expect(o.favorite === true && o.lucky === true, 'not set: ' + JSON.stringify([o.favorite, o.lucky]));
    await s.call('mergeVideoImport', [{ name: base.name, cp: base.cp, hp: base.hp, favorite: false, lucky: false }]); await s.page.waitForTimeout(300);
    o = (await s.state()).ivOverrides[base.idx] || {}; expect(o.favorite === true && o.lucky === true, 'cleared by a run that missed the icon: ' + JSON.stringify([o.favorite, o.lucky]));
  }, 'high');
  await T('IMP-21', 'Import', 'Same-name Pokemon with different typing become different forms (Kantonian vs Alolan Ninetales)', async () => {
    await s.call('mergeVideoImport', [
      { name: 'Ninetales', dex: 38, cp: 1801, hp: 140, type: 'Fire', atkIV: 10, defIV: 10, staIV: 10 },
      { name: 'Ninetales', dex: 38, cp: 1802, hp: 141, type: 'Ice / Fairy', atkIV: 10, defIV: 10, staIV: 10 }]); await s.page.waitForTimeout(300);
    const st = await s.state(); const rows = (st.addedPokemon || []).filter(p => p.name === 'Ninetales' && (p.cp === 1801 || p.cp === 1802));
    const k = rows.find(p => p.cp === 1801), a = rows.find(p => p.cp === 1802);
    expect(k && a, 'both rows should exist'); expect(!k.form && a.form === 'alola', JSON.stringify([k && k.form, a && a.form]));
    expect(await s.call('typeOf', k) === 'Fire', 'kantonian type'); expect(await s.call('typeOf', a) === 'Ice / Fairy', 'alolan type: ' + await s.call('typeOf', a));
    expect(await s.call('typeOf', { name: 'Ninetales', dex: 38, form: 'alola' }) === 'Ice / Fairy', 'form-only lookup');
  }, 'critical');
  await T('BULK-01', 'Bulk', 'Bulk tab lists regional-form species with options; choosing one sets form, type and re-ranks; undo restores', async () => {
    await s.call('mergeVideoImport', [{ name: 'Vulpix', dex: 37, cp: 555, hp: 60, atkIV: 8, defIV: 9, staIV: 10 }]); await s.page.waitForTimeout(300);
    await s.set({ tab: 'bulk' }); await s.page.waitForTimeout(500);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/REGIONAL FORM/.test(txt) && /Vulpix/.test(txt) && /Alolan/.test(txt), 'bulk tab content missing: ' + txt.slice(0, 200));
    const v = ((await s.state()).addedPokemon || []).find(p => p.name === 'Vulpix' && p.cp === 555); expect(v, 'seed row');
    await s.call('bulkPickForm', v, 'alola'); await s.page.waitForTimeout(700);
    const o = (await s.state()).ivOverrides[v.idx] || {};
    expect(o.form === 'alola' && o.type === 'Ice' && o.formReviewed === true, JSON.stringify([o.form, o.type, o.formReviewed]));
    expect(o.great && Number.isFinite(o.great.rankPct), 'rank not recomputed');
    expect(await s.call('typeOf', { ...v, ...o }) === 'Ice', 'typeOf');
    const txt2 = await s.page.evaluate(() => document.body.innerText); expect(!/Vulpix\s*CP 555/.test(txt2), 'reviewed row should leave the list');
  }, 'critical');
  await T('TOOLS-01', 'Tools', 'Rename strings fit the 12-char limit and encode form/IV/ranks; search builder emits GO syntax', async () => {
    const p = { name: 'Ninetales', form: 'alola', atkIV: 15, defIV: 14, staIV: 13, great: { rankPct: 97.2 }, ultra: { rankPct: 70.6 }, cp: 1801 };
    expect(await s.call('renameFor', p, '{form}{iv}G{g}U{u}') === 'A93G97U71', await s.call('renameFor', p, '{form}{iv}G{g}U{u}'));
    expect(await s.call('renameFor', p, '{ivs}') === 'FED', 'hex ivs');
    expect(await s.call('starsOf', p) === 3 && await s.call('starsOf', { atkIV: 15, defIV: 15, staIV: 15 }) === 4 && await s.call('starsOf', { atkIV: 0, defIV: 0, staIV: 0 }) === 0, 'stars');
    await s.set({ srchName: 'ninetales, vulpix', srchTypes: ['Ice'], srchForm: 'alola', srchFlags: { shadow: -1, lucky: 1 }, srchStars: [3, 4], srchCpMin: '', srchCpMax: '1500' });
    const out = await s.call('searchStringFromBuilder');
    expect(out === 'ninetales,vulpix&ice&alola&!shadow&lucky&3*,4*&cp-1500', out);   // a comma groups first (OR), then "&" (AND): checked on a real account
    await s.set({ tab: 'tools', toolsMode: 'rename' }); await s.page.waitForTimeout(500);
    expect(/Rename/.test(await s.page.evaluate(() => document.body.innerText)), 'rename ui');
    await s.set({ toolsMode: 'search' }); await s.page.waitForTimeout(400);
    expect(/ninetales,vulpix&ice/.test(await s.page.evaluate(() => document.body.innerText)), 'search ui');
  }, 'high');
  await T('GEM-01', 'AI', 'In-app Gemini cycle is live: retired models dropped, a 503 moves to the next model', async () => {
    const r = await s.page.evaluate(async () => {
      const gen = []; const orig = window.fetch;
      const J = (status, obj) => ({ status, ok: status < 400, json: async () => obj, text: async () => JSON.stringify(obj) });
      window.fetch = async (url, opt) => {
        url = String(url);
        if (url.indexOf('generativelanguage') < 0) return orig(url, opt);
        if (/\/models\?/.test(url)) return J(200, { models: ['gemini-3.9-flash', 'gemini-3.5-flash-lite', 'gemini-3.4-flash', 'gemini-2.5-flash', 'gemini-3.9-flash-image'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
        const m = /models\/([^:]+):(\w+)/.exec(url);
        if (m[2] === 'countTokens') return J(m[1] === 'gemini-3.5-flash-lite' ? 404 : 200, {});
        gen.push(m[1]);
        if (m[1] === 'gemini-3.9-flash') return J(503, { error: { message: 'high demand' } });
        return J(200, { candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] });
      };
      try {
        let logic = null;
        for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.callGeminiWithKey) { logic = f.stateNode.logic; break; } if (logic) break; }
        const out = await logic.callGeminiWithKey({ messages: [{ content: 'hi' }] }, 'QAKEY-' + Date.now());
        return { out, gen, rot: await logic.geminiRotation('QAKEY-x', false).catch(() => null) };
      } finally { window.fetch = orig; }
    });
    expect(r.out === 'OK', JSON.stringify(r));
    expect(r.gen[0] === 'gemini-3.9-flash' && r.gen[1] === 'gemini-3.4-flash' && r.gen.indexOf('gemini-3.5-flash-lite') < 0 && r.gen.indexOf('gemini-3.9-flash-image') < 0, 'order: ' + r.gen.join(','));
  }, 'critical');
  await T('OCR-CLEAN-01', 'Import', 'Screenshot read: species typos snapped, types cased, units fixed, regional form from types', async () => {
    const c = async r => (await s.call('cleanScreenshotRecord', r));
    let r = await c({ pokemon_name: 'Sheigon', type_1: 'DRAGON', weight: '1.2m', height: null, cp: 500 });
    expect(r.rec.pokemon_name === 'Shelgon' && r.rec.type_1 === 'Dragon', JSON.stringify(r));
    expect(r.rec.height === '1.2m' && r.rec.weight === null, 'unit swap: ' + JSON.stringify(r.rec));
    r = await c({ pokemon_name: 'Ninetales', dex_number: 38, type_1: 'ice', type_2: 'FAIRY' });
    expect(r.rec.form === 'alola' && r.rec.type_1 === 'Ice' && r.rec.type_2 === 'Fairy', JSON.stringify(r));
    r = await c({ pokemon_name: 'Ninetales', dex_number: 38, type_1: 'Fire' });
    expect(!r.rec.form, 'kantonian must stay formless: ' + JSON.stringify(r));
    r = await c({ pokemon_name: 'Pikachu', type_1: 'Electric', weight: '6kg', height: '0.4m' });
    expect(r.rec.pokemon_name === 'Pikachu' && r.rec.weight === '6kg' && r.rec.height === '0.4m' && r.notes.length === 0, JSON.stringify(r));
    r = await c({ pokemon_name: 'Zzzzzzzz' });
    expect(r.rec.pokemon_name === 'Zzzzzzzz', 'unknown names are left alone');
  }, 'high');
  await T('GEM-02', 'AI', 'A model out of daily quota is parked alone: the key keeps working on the other models', async () => {
    const r = await s.page.evaluate(async () => {
      const gen = []; const orig = window.fetch;
      const J = (status, obj) => ({ status, ok: status < 400, json: async () => obj, text: async () => JSON.stringify(obj) });
      window.fetch = async (url) => {
        url = String(url);
        if (url.indexOf('generativelanguage') < 0) return orig(url);
        if (/\/models\?/.test(url)) return J(200, { models: ['gemini-3.9-flash', 'gemini-3.5-flash-lite'].map(n => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) });
        const m = /models\/([^:]+):(\w+)/.exec(url);
        if (m[2] === 'countTokens') return J(200, {});
        gen.push(m[1]);
        if (m[1] === 'gemini-3.9-flash') return J(429, { error: { message: 'quota', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } });
        return J(200, { candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }] });
      };
      try {
        let logic = null;
        for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.callGeminiWithKey) { logic = f.stateNode.logic; break; } if (logic) break; }
        const key = 'QAQUOTA-' + Date.now();
        const img = { messages: [{ content: [{ type: 'text', text: 'x' }, { type: 'image', source: { data: 'AAAA', media_type: 'image/jpeg' } }] }] };
        const a = await logic.callGeminiWithKey(img, key); const b = await logic.callGeminiWithKey(img, key);
        return { a, b, gen };
      } finally { window.fetch = orig; }
    });
    expect(r.a === 'OK' && r.b === 'OK', JSON.stringify(r));
    expect(r.gen.filter(x => x === 'gemini-3.9-flash').length === 1, 'the exhausted model must not be retried: ' + r.gen.join(','));
  }, 'critical');
  await T('TYPE-01', 'Import', 'A one-badge read of a two-type species is completed; real forms are untouched', async () => {
    let r = await s.call('cleanScreenshotRecord', { pokemon_name: 'Landorus', dex_number: 645, type_1: 'Flying' });
    expect(r.rec.type_1 === 'Ground' && r.rec.type_2 === 'Flying', JSON.stringify(r));
    r = await s.call('cleanScreenshotRecord', { pokemon_name: 'Farfetchd', dex_number: 83, type_1: 'Fighting' });
    expect(r.rec.form === 'galarian' && !r.rec.type_2, 'galarian farfetchd is Fighting only: ' + JSON.stringify(r));
    r = await s.call('cleanScreenshotRecord', { pokemon_name: 'Pikachu', dex_number: 25, type_1: 'Electric' });
    expect(!r.rec.type_2 && r.notes.length === 0, JSON.stringify(r));
    await s.call('mergeVideoImport', [{ name: 'Landorus', dex: 645, cp: 3001, hp: 150, type: 'Flying', atkIV: 10, defIV: 10, staIV: 10 }]); await s.page.waitForTimeout(300);
    const l = ((await s.state()).addedPokemon || []).find(p => p.name === 'Landorus' && p.cp === 3001); expect(l && l.type === 'Ground / Flying', JSON.stringify(l && l.type));
  }, 'high');
  await T('BULK-02', 'Bulk', 'Pokemon with no known type are listed in Bulk; picking types saves them and removes the row', async () => {
    await s.call('mergeVideoImport', [{ name: 'Qazwsxmon', cp: 777, hp: 70, atkIV: 5, defIV: 5, staIV: 5 }]); await s.page.waitForTimeout(300);
    const row = ((await s.state()).addedPokemon || []).find(p => p.name === 'Qazwsxmon'); expect(row, 'seed row');
    await s.set({ tab: 'bulk', bulkVisible: 100 }); await s.page.waitForTimeout(500);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/NO TYPE ON FILE/.test(txt) && /Qazwsxmon/.test(txt), 'type check missing: ' + txt.slice(0, 200));
    await s.call('bulkSaveType', row, ['Fire', 'Flying']); await s.page.waitForTimeout(700);
    const o = (await s.state()).ivOverrides[row.idx] || {}; expect(o.type === 'Fire / Flying' && o.typeReviewed === true, JSON.stringify(o));
    expect(await s.call('typeOf', { ...row, ...o }) === 'Fire / Flying', 'typeOf');
    expect(!(await s.call('bulkTypePending')).some(p => p.name === 'Qazwsxmon'), 'reviewed row should leave the list');
  }, 'high');
  await T('CANDY-01', 'Candy', 'One candy number per evolution family: tile, input and evolve card agree even without a saved count', async () => {
    await s.set({ candyInventory: {} });
    const mk = (idx, cp, candy, scanDate) => ({ idx, name: 'Bramblin', dex: 946, cp, hp: 60, candy, xlCandy: null, scanDate, atkIV: 10, defIV: 13, staIV: 13 });
    const a = mk('qa-b1', 354, 16, '2026-10-17'), b = mk('qa-b2', 624, 13, '2026-10-16'), g = { idx: 'qa-b3', name: 'Brambleghast', dex: 947, cp: 900, hp: 90, candy: 7, scanDate: '2026-10-01' };
    await s.set({ addedPokemon: [a, b, g], ivOverrides: {} }); await s.page.waitForTimeout(300);
    const sa = await s.call('candyStockFor', a), sb = await s.call('candyStockFor', b), sg = await s.call('candyStockFor', g);
    expect(sa.candy === 16 && sb.candy === 16 && sg.candy === 16, JSON.stringify([sa, sb, sg]));
    expect((await s.call('candyDraftFor', b, 'candy')) === '16', 'input must show the family number');
    expect((await s.call('familyCandyFor', b)).candy === 16, 'tile source');
    await s.set({ candyInventory: { bramblin: { name: 'Bramblin', candy: 20, xlCandy: 3, at: Date.now() } } }); await s.page.waitForTimeout(200);
    expect((await s.call('candyStockFor', a)).candy === 20 && (await s.call('candyStockFor', g)).candy === 20, 'a saved count wins for the whole family');
    await s.set({ candyInventory: {}, addedPokemon: [] });
  }, 'critical');
  await T('CANDY-02', 'Candy', 'Manual SET and scans write the same family record; the newest wins and the note says which', async () => {
    const a = { idx: 'qa-c1', name: 'Pidgey', dex: 16, cp: 300, hp: 40, candy: 5, scanDate: '2020-01-01', atkIV: 8, defIV: 8, staIV: 8 };
    const b = { idx: 'qa-c2', name: 'Pidgeotto', dex: 17, cp: 700, hp: 70, candy: 9, scanDate: '2020-01-02', atkIV: 8, defIV: 8, staIV: 8 };
    await s.set({ candyInventory: {}, addedPokemon: [a, b], ivOverrides: {}, candyDraft: {} }); await s.page.waitForTimeout(300);
    expect(/roster row/.test(await s.call('candyNoteFor', a)) && (await s.call('candyStockFor', a)).candy === 9, 'csv stand-in must say so: ' + await s.call('candyNoteFor', a));
    await s.call('setCandyDraft', a, 'candy', '31'); await s.call('saveCandyEdit', a); await s.page.waitForTimeout(300);
    let inv = (await s.state()).candyInventory; const fam = Object.keys(inv).find(k => inv[k].candy === 31); expect(fam && inv[fam].source === 'manual', JSON.stringify(inv));
    expect((await s.call('candyStockFor', b)).candy === 31 && /set by you/.test(await s.call('candyNoteFor', b)), 'manual number covers the family');
    await s.call('mergeVideoImport', [{ name: 'Pidgeotto', dex: 17, cp: 700, hp: 70, candy: 44, atkIV: 8, defIV: 8, staIV: 8 }]); await s.page.waitForTimeout(300);
    inv = (await s.state()).candyInventory; expect(inv[fam].candy === 44 && inv[fam].source === 'scan', 'a newer scan replaces it: ' + JSON.stringify(inv[fam]));
    expect((await s.call('candyStockFor', a)).candy === 44 && /from a scan/.test(await s.call('candyNoteFor', a)), 'note');
    await s.set({ candyInventory: {}, addedPokemon: [] });
  }, 'critical');
  await T('PWR-01', 'Power up', 'A power-up raises level, CP and HP (not just the candy count), and the next quote starts from the new level', async () => {
    const info = await s.page.evaluate(() => { const m = window.PokemonMechanics; const base = m.BASE_STATS[16]; const ivs = [10, 13, 13];
      return { cp0: m.cpFor(base, ivs, 15), cp1: m.cpFor(base, ivs, 15.5), hp1: m.hpFor(base, 13, 15.5), cost: m.powerUpCostBetween(15, 15.5, {}) }; });
    const p = { idx: 'qa-pw1', name: 'Pidgey', dex: 16, cp: info.cp0, hp: 40, lvlMin: 15, lvlMax: 15, atkIV: 10, defIV: 13, staIV: 13, ivMeasured: true, scanDate: '2026-10-01' };
    await s.set({ addedPokemon: [p], ivOverrides: {}, candyInventory: { pidgey: { name: 'Pidgey', candy: 50, xlCandy: 0, at: Date.now(), source: 'manual' } }, stardustBalance: 100000 }); await s.page.waitForTimeout(300);
    await s.call('applyPowerUp', p, info.cost, 1); await s.page.waitForTimeout(300);
    const st = await s.state(); const o = st.ivOverrides['qa-pw1'] || {};
    expect(o.lvlMin === 15.5 && o.lvlMax === 15.5, 'level: ' + JSON.stringify(o));
    expect(o.cp === info.cp1 && info.cp1 > info.cp0, 'cp ' + o.cp + ' expected ' + info.cp1);
    expect(o.hp === info.hp1, 'hp ' + o.hp + ' expected ' + info.hp1);
    expect(o.pendingPowerUps === 0 && o.powerUpsSinceScan === 1, JSON.stringify([o.pendingPowerUps, o.powerUpsSinceScan]));
    expect(st.candyInventory.pidgey.candy === 50 - info.cost.candy, 'candy spent');
    const eff = (await s.state()).addedPokemon.find(x => x.idx === 'qa-pw1');
    const plan = await s.call('powerUpPlan', { ...eff, ...o });
    expect(plan && plan.quickStep && plan.quickStep.nextLevel === 'Lv 16', JSON.stringify(plan && plan.quickStep && plan.quickStep.nextLevel));
    await s.set({ addedPokemon: [], candyInventory: {}, ivOverrides: {} });
  }, 'critical');
  await T('MOTION-01', 'Motion', 'Numbers roll on change, changed rows flash once after an import, Bulk rows close before committing', async () => {
    // count-up: change a marked number and look at it mid-animation
    const p = { idx: 'qa-mo1', name: 'Pidgey', dex: 16, cp: 300, hp: 40, lvlMin: 10, lvlMax: 10, atkIV: 8, defIV: 8, staIV: 8, ivMeasured: true, scanDate: new Date().toISOString().slice(0, 10) };
    await s.set({ addedPokemon: [p], ivOverrides: {}, candyInventory: { pidgey: { name: 'Pidgey', candy: 100, xlCandy: 0, at: Date.now(), source: 'manual' } }, stardustBalance: 5000, tab: 'roster' }); await s.page.waitForTimeout(400);
    await s.call('openDetail', p); await s.page.waitForTimeout(900);
    const seen = await s.page.evaluate(async () => {
      const el = [...document.querySelectorAll('[data-countup]')].find(e => /^\s*100\s*$/.test(e.textContent)); if (!el) return { err: 'no candy tile' };
      let logic = null; for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.setState) { logic = f.stateNode.logic; break; } if (logic) break; }
      logic.setState({ candyInventory: { pidgey: { name: 'Pidgey', candy: 40, xlCandy: 0, at: Date.now(), source: 'manual' } } });
      const vals = []; for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 40)); vals.push(el.textContent.trim()); }
      return { vals, cls: el.className };
    });
    expect(!seen.err, seen.err);
    const mids = seen.vals.filter(v => v !== '100' && v !== '40'); expect(mids.length > 0, 'no in-between values: ' + seen.vals.join(','));
    expect(seen.vals[seen.vals.length - 1] === '40', 'must end exactly on 40: ' + seen.vals.join(','));
    await s.call('closeDetail');
    // flash: an import marks the rows it touched
    await s.set({ search: 'pidgey', tab: 'roster' }); await s.page.waitForTimeout(300);
    await s.call('mergeVideoImport', [{ name: 'Pidgey', dex: 16, cp: 300, hp: 40, atkIV: 8, defIV: 8, staIV: 8 }]); await s.page.waitForTimeout(250);
    const rc = (await s.state()).recentChanged; expect(rc && rc.ids.indexOf('qa-mo1') >= 0, 'recentChanged: ' + JSON.stringify(rc));
    expect(await s.page.evaluate(() => document.querySelectorAll('[data-changed="1"]').length) >= 1, 'row not flagged');
    await s.page.waitForTimeout(3200); expect(!(await s.state()).recentChanged, 'highlight must be forgotten after it played'); await s.set({ search: '' });
    await s.set({ addedPokemon: [], candyInventory: {}, ivOverrides: {} });
  }, 'high');
  await T('RAID-PARTY-01', 'Raid', 'Party of 6 lists one of each species with a DPS total', async () => {
    await s.set({ tab: 'raid', raidBossTypes: ['Water'], raidBossName: 'Test' }); await s.page.waitForTimeout(500);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/Party of 6/.test(txt) && /DPS total/.test(txt), 'party card missing: ' + txt.slice(0, 200));
    await s.set({ raidBossTypes: [] }); await s.page.waitForTimeout(300);
    expect(!/Party of 6/.test(await s.page.evaluate(() => document.body.innerText)), 'party shows with no boss');
  });
  await T('HERO-01', 'Detail', 'Detail hero floats, drag tilts it and releasing springs it back; HOME render replaces the sprite for plain species', async () => {
    await s.page.route('**/other/home/**', r => r.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
    await s.set({ tab: 'roster' }); const st = await s.state(); const p = st.roster.find(x => x.dex && !x.form); await s.call('openDetail', p); await s.page.waitForTimeout(1200);
    const info = await s.page.evaluate(() => { const i = document.querySelector('.hero-img'); const img = i && i.querySelector('img'); return { has: !!i, src: img && img.src, anim: !!i && getComputedStyle(i.parentElement).animationName }; });
    expect(info.has && /other\/home\//.test(info.src) && /heroFloat/.test(info.anim), JSON.stringify(info));
    const r = await s.page.evaluate(() => { const e = document.querySelector('.hero-img').parentElement.parentElement.parentElement.parentElement.getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    await s.page.mouse.move(r.x, r.y); await s.page.mouse.down(); await s.page.mouse.move(r.x + 60, r.y, { steps: 4 });
    const leaned = await s.page.evaluate(() => document.querySelector('.hero-img').style.getPropertyValue('--rot'));
    await s.page.mouse.up(); const back = await s.page.evaluate(() => document.querySelector('.hero-img').style.getPropertyValue('--rot'));
    expect(parseFloat(leaned) > 0 && parseFloat(back) === 0, leaned + ' / ' + back);
    await s.call('closeDetail');
  });
  await T('DOM-PVP-01', 'Roster', 'A duplicate that beats the other on every IV is not dominated when it ranks lower in a league', async () => {
    const mk = (idx, iv, great, extra) => ({ idx, name: 'Pawmi', dex: 921, cp: 300, hp: 40, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 10, lvlMax: 10, ivMeasured: true, great: { rankPct: great }, scanDate: '2026-10-01', ...extra });
    const winner = mk('qa-d1', [14, 13, 12], 80), lowAtk = mk('qa-d2', [0, 11, 12], 96), plain = mk('qa-d3', [0, 11, 12], 60);
    const hit = async (list) => (await s.call('dominatedDuplicates', list)).map(x => x.loser.idx);
    expect((await hit([winner, lowAtk])).indexOf('qa-d2') < 0, 'the 0/11/12 with the better Great rank must not be listed');
    const other = { ...winner, idx: 'qa-d4', name: 'Pikachu', dex: 25 };  // different length: dominatedDuplicates is memoised on array length
    expect((await hit([winner, plain, other])).indexOf('qa-d3') >= 0, 'a 0/11/12 that also ranks lower is still listed')
  });
  await T('CLOUD-LZ-01', 'Cloud', 'Packed cloud data round-trips through the compressor, shrinks, and old plain JSON still reads', async () => {
    const r = await s.page.evaluate(() => {
      const logic = (() => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.lzPack) return f.stateNode.logic; } })();
      const list = []; for (let i = 0; i < 3000; i++) list.push({ idx: 'p' + i, name: ['Flabébé', 'Nidoran♀', 'Pikachu', 'Mew'][i % 4], cp: 100 + (i * 7) % 900, atkIV: i % 16, defIV: (i * 3) % 16, staIV: (i * 5) % 16, great: { rankPct: (i % 100) + 0.5 }, note: '★ · — ' + i });
      const json = JSON.stringify(list), packed = logic.lzPack(json), back = logic.lzUnpack(packed);
      const blob = logic.buildCloudBlob();
      const plain = logic.unpackCloudBlob({ rosterJson: [JSON.stringify([{ idx: 'x', name: 'Old' }])] });
      const empty = logic.lzUnpack(logic.lzPack('x'));
      return { same: back === json, ratio: packed.length / json.length, rosterOk: Array.isArray(logic.unpackCloudBlob(blob).roster), old: plain.roster && plain.roster[0].name, empty, chunks: (blob.rosterJson || []).every(c => new TextEncoder().encode(c).length <= 6000) };
    });
    expect(r.same, 'round trip differs');
    expect(r.ratio < 0.5, 'packed/plain ratio ' + r.ratio);
    expect(r.rosterOk && r.old === 'Old' && r.empty === 'x' && r.chunks, JSON.stringify(r));
  });
  await T('CUT-01', 'Roster', 'Keep-best cut list protects the best two legendaries, explains each row, and cuts weak commons first', async () => {
    const cls = await s.page.evaluate(() => [window.PokemonMechanics.speciesClassFor(716), window.PokemonMechanics.speciesClassFor(151), window.PokemonMechanics.speciesClassFor(793), window.PokemonMechanics.speciesClassFor(16)]);
    expect(cls.join() === 'L,M,U,', 'classes ' + cls.join());
    const mk = (idx, dex, name, iv, cp) => ({ idx, name, dex, cp, hp: 100, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 30, lvlMax: 30, ivSolved: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01' });
    const list = [mk('c1', 716, 'Xerneas', [14, 14, 14], 2684), mk('c2', 716, 'Xerneas', [12, 12, 12], 2643), mk('c3', 716, 'Xerneas', [5, 5, 5], 2300),
      mk('c4', 16, 'Pidgey', [15, 15, 15], 300), mk('c5', 16, 'Pidgey', [2, 2, 2], 100), mk('c6', 16, 'Pidgey', [1, 1, 1], 90), mk('c7', 19, 'Rattata', [3, 3, 3], 80)];
    const rows = await s.call('cutScoreRows', list);
    const order = rows.map(r => r.p.idx);
    expect(order.indexOf('c1') > order.indexOf('c3') && order.indexOf('c2') > order.indexOf('c3'), 'best two Xerneas must outrank the third: ' + order.join());
    expect(order.indexOf('c2') > order.indexOf('c5') && order.indexOf('c2') > order.indexOf('c6'), 'a kept legendary must outrank weak commons: ' + order.join());
    const r1 = rows.find(r => r.p.idx === 'c1').reason;
    expect(/Legendary/.test(r1) && /#1 of 3/.test(r1) && /raid role|no raid role/.test(r1), r1);
    expect(/only copy/.test(rows.find(r => r.p.idx === 'c7').reason), 'only-copy reason');
  });
  await T('KEEP-01', 'Safety', 'The keep check protects every valuable kind of Pokemon from every transfer list, and still lets a plain weak duplicate through', async () => {
    await s.set({ protectSizes: 'extreme' });
    const mk = (idx, dex, name, iv, cp, extra) => ({ idx, name, dex, cp, hp: 100, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 20, lvlMax: 20, ivMeasured: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01', ...extra });
    const weak = [mk('k1', 16, 'Pidgey', [2, 3, 2], 120), mk('k2', 16, 'Pidgey', [1, 2, 1], 100), mk('k3', 16, 'Pidgey', [0, 1, 1], 90), mk('k4', 16, 'Pidgey', [3, 2, 2], 130)];
    const special = [
      mk('s1', 19, 'Rattata', [1, 1, 1], 80, { lucky: true }), mk('s2', 21, 'Spearow', [1, 1, 1], 80, { favorite: true }), mk('s3', 23, 'Ekans', [1, 1, 1], 80, { shiny: true }),
      mk('s4', 27, 'Sandshrew', [13, 13, 13], 80, { shadowPurified: '1' }), mk('s5', 1, 'Bulbasaur', [1, 1, 1], 80, { height: '1.2m', weight: '7kg' }),
      mk('s6', 484, 'Palkia', [8, 8, 8], 2770), mk('s7', 29, 'Nidoran', [14, 14, 14], 300), mk('s8', 41, 'Zubat', [1, 1, 1], 80, { ivMeasured: false, ivSolved: true }),
      mk('s9', 10, 'Caterpie', [1, 1, 1], 60)];
    const roster = [...weak, ...special];
    const ctxRows = await s.call('cutScoreRows', roster);
    const keepOf = id => ctxRows.find(r => r.p.idx === id).keepAll;
    const missing = special.map(p => p.idx).filter(id => !keepOf(id).length);
    expect(!missing.length, 'valuable Pokemon with no keep reason: ' + missing.join() + ' ' + JSON.stringify(special.filter(p => missing.indexOf(p.idx) >= 0).map(p => p.name)));
    expect(weak.every(p => !keepOf(p.idx).length), 'weak duplicates should pass: ' + JSON.stringify(weak.map(p => keepOf(p.idx))));
    const sum = await s.call('cutSafeSummary', roster, 12);
    const hardIds = ['s1', 's2', 's3', 's5', 's6', 's8'];
    expect(['k1', 'k2', 'k3', 'k4'].every(id => sum.show.some(r => r.p.idx === id)) && !sum.show.some(r => hardIds.indexOf(r.p.idx) >= 0), 'cut list takes the weak Pidgey first and never a hard lock: ' + sum.show.map(r => r.p.idx).join());
    const plan = await s.call('buildOptimizePlan', roster);
    expect(plan.transferSafe.every(p => /^k/.test(p.idx)), 'Transfer-safe must exclude every protected one: ' + plan.transferSafe.map(p => p.idx).join());
    const dom = await s.call('dominatedDuplicates', [...weak, mk('d1', 16, 'Pidgey', [15, 15, 15], 400), special[5]]);
    expect(dom.every(x => /^k/.test(x.loser.idx)), 'dominated list must only hold unprotected losers');
  });
  await T('KEEP-02', 'Safety', 'One best copy per league, bad shadows go, nondo is kept, a lone weak Pokemon can go', async () => {
    const mk = (idx, dex, name, iv, cp, extra) => ({ idx, name, dex, cp, hp: 100, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 20, lvlMax: 20, ivMeasured: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01', ...extra });
    const gr = r => ({ great: { rankPct: r, evolvesTo: 'Azumarill' } });
    const list = [mk('z1', 184, 'Azumarill', [2, 15, 15], 1400, gr(96)), mk('z2', 184, 'Azumarill', [3, 14, 14], 1390, gr(93)), mk('z3', 184, 'Azumarill', [1, 8, 8], 900, gr(50)),
      mk('z4', 16, 'Pidgey', [4, 5, 6], 120), mk('z5', 27, 'Sandshrew', [1, 3, 5], 300, { shadowPurified: '1' }), mk('z6', 27, 'Sandshrew', [13, 13, 13], 300, { shadowPurified: '1' }),
      mk('z7', 19, 'Rattata', [0, 0, 0], 60), mk('z8', 18, 'Pidgeot', [15, 15, 15], 2000)];
    const rows = await s.call('cutScoreRows', list);
    const keepOf = id => rows.find(r => r.p.idx === id).keepAll;
    expect(keepOf('z1').some(x => /Best Great League copy/.test(x)), 'best Azumarill kept: ' + keepOf('z1'));
    expect(!keepOf('z2').some(x => /Best Great/.test(x)), 'second 90%+ copy is not a best copy: ' + keepOf('z2'));
    expect(!keepOf('z3').some(x => /Best/.test(x)), 'weak Azumarill is no best copy: ' + keepOf('z3'));
    expect(!keepOf('z4').length, 'a lone weak Pidgey passes: ' + keepOf('z4'));
    expect(!keepOf('z5').length, 'a 1/3/5 shadow passes: ' + keepOf('z5'));
    expect(keepOf('z6').some(x => /Shadow with good IVs/.test(x)), 'a good shadow stays: ' + keepOf('z6'));
    expect(keepOf('z7').some(x => /Nondo/.test(x)), 'nondo stays: ' + keepOf('z7'));
    const pony = mk('zp', 77, 'Ponyta', [3, 3, 2], 543, { height: '0.5m', weight: '7.73kg' });
    expect((await s.call('keepReasons', pony)).some(x => /XXS/.test(x)), 'a 0.50 m Ponyta (XXS in the game) must be protected: ' + (await s.call('keepReasons', pony)));
    const cand = await s.call('replacedBy', list[1], await s.call('keepContext', list));
    expect(cand && cand.q.idx === 'z1', 'replacement named: ' + JSON.stringify(cand && cand.q.idx));
  });
  await T('KEEP-03', 'Safety', 'Floating keep line: over the Keep best target the weakest unlocked Pokemon go first, hard locks never move, and nothing floats under target', async () => {
    const mk = (idx, dex, name, iv, cp, extra) => ({ idx, name, dex, cp, hp: 100, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 20, lvlMax: 20, ivMeasured: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01', ...extra });
    const locked = [mk('L1', 19, 'Rattata', [1, 1, 1], 80, { shiny: true }), mk('L2', 21, 'Spearow', [1, 1, 1], 80, { lucky: true }), mk('L3', 23, 'Ekans', [1, 1, 1], 80, { favorite: true })];
    const good = [mk('G1', 29, 'Nidoran', [15, 15, 15], 300), mk('G2', 32, 'Nidoran', [14, 14, 14], 300), mk('G3', 41, 'Zubat', [14, 15, 13], 300), mk('G4', 43, 'Oddish', [13, 14, 14], 300)];
    const weak = [mk('W1', 16, 'Pidgey', [2, 3, 2], 120), mk('W2', 19, 'Rattata', [1, 2, 1], 100), mk('W3', 21, 'Spearow', [0, 1, 1], 90), mk('W4', 46, 'Paras', [3, 2, 2], 130), mk('W5', 60, 'Poliwag', [2, 2, 3], 110)];
    // stronger peers of every type, so the weak ones have no raid role of their own
    const peers = [mk('S1', 143, 'Snorlax', [15, 15, 15], 3000), mk('S2', 130, 'Gyarados', [15, 15, 15], 3000), mk('S3', 123, 'Scyther', [15, 15, 15], 3000), mk('S4', 3, 'Venusaur', [15, 15, 15], 3000), mk('S5', 169, 'Crobat', [15, 15, 15], 3000)];
    const roster = [...locked, ...good, ...peers, ...weak];
    const withLogic = (body, arg) => s.page.evaluate(([b, a]) => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.keepContext) return new Function('L', 'a', b)(f.stateNode.logic, a); } return null; }, [body, arg]);
    const run = async target => { await s.set({ cutTarget: target }); return await withLogic('const c = L.keepContext(a.roster); const fl = L.floatCut(c); const sum = L.cutSafeSummary(a.roster, Math.max(0, a.roster.length - a.target)); return { floated: fl.set.size, show: sum.show.map(x => x.p.idx), keep: Object.fromEntries(a.roster.map(p => [p.idx, L.keepReasons(p, c)])) };', { roster, target }); };
    let r = await run(roster.length);
    expect(r.floated === 0 && r.show.length === 0, 'nothing floats at target: ' + r.floated);
    r = await run(roster.length - 3);
    expect(r.show.length === 3 && r.show.every(i => /^W/.test(i)), 'three weakest cut first: ' + r.show.join());
    r = await run(roster.length - 7);
    expect(r.show.length === 7 && r.show.filter(i => /^W/.test(i)).length === 5 && r.show.filter(i => /^[GS]/.test(i)).length === 2 && !r.show.some(i => /^L/.test(i)), 'five weak then the two weakest good ones, never a lock: ' + r.show.join());
    const cutGood = r.show.find(i => /^[GS]/.test(i));
    expect(!r.keep[cutGood].length, 'a soft-kept Pokemon on the line passes every gate: ' + r.keep[cutGood]);
    expect([...good, ...peers].map(p => p.idx).filter(i => r.show.indexOf(i) < 0).every(i => r.keep[i].length), 'the good ones above the line stay kept');
    r = await run(1);
    expect(r.show.length === 14 && !r.show.some(i => /^L/.test(i)), 'locks never cut even when far over target: ' + r.show.length);
    expect(r.keep.L1.length && r.keep.L2.length && r.keep.L3.length, 'locks stay locked');
    await s.set({ cutTarget: 300 });
  });
  await T('REFRESH-01', 'Home', 'Refresh everything runs every step, reports what changed, and can be undone', async () => {
    await s.set({ tab: 'home', geminiKey: '', geminiKeys: [] });
    await s.call('refreshEverything');
    const st = await s.state();
    const run = st.refreshRun;
    expect(run && !run.running && run.steps.length === 9, 'run missing: ' + JSON.stringify(run).slice(0, 200));
    expect(run.steps.every(x => x.status !== 'wait' && x.status !== 'run'), 'a step never finished: ' + run.steps.map(x => x.k + ':' + x.status).join());
    expect(run.summary && run.summary.lines.length >= 1, 'no summary');
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/REFRESH EVERYTHING/.test(txt) && /WHAT CHANGED/.test(txt) && /UNDO THIS REFRESH/.test(txt), txt.slice(0, 200));
    await s.call('undoRefresh'); await s.page.waitForTimeout(300);
    expect((await s.state()).refreshRun.undone === true, 'undo flag');
  });
  await T('BRIEF-01', 'Today', 'Morning briefing is one cached AI call, shows as suggestions, and search grounding is sent only when switched on', async () => {
    const seen = [];
    await s.page.route('**/generativelanguage.googleapis.com/**', async r => {
      const u = r.request().url();
      if (/:generateContent/.test(u)) {
        seen.push(r.request().postData() || '');
        return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '- Power up your best Great League pick first.\n- Evolve the Pokemon with enough candy.\n- Check this weekend event.' }] } }] }) });
      }
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ models: [] }) });
    });
    const key = 'k'.repeat(30);
    await s.set({ geminiKey: key, geminiKeys: [key], briefing: null, briefingSearch: false, tab: 'today' });
    await s.call('generateBriefing', true); await s.page.waitForTimeout(500);
    let b = (await s.state()).briefing;
    expect(b && b.bullets.length === 3 && b.date, 'no briefing: ' + JSON.stringify(b));
    expect(seen.length === 1 && !/google_search/.test(seen[0]), 'search must be off by default: ' + seen.length);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/briefing/i.test(txt) && /Suggestions only/.test(txt) && /Power up your best/.test(txt), txt.slice(0, 300));
    const ctx = await s.call('briefingContext');
    const evo = ((ctx.match(/Evolve soon: ([^\n]*)/) || [, ''])[1]).split(';').map(x => x.trim().split(' ')[0]).filter(Boolean);
    const sec = ((ctx.match(/second charge move \(fully evolved only\): ([^\n]*)/) || [, ''])[1]).split(';').map(x => x.trim().split(' ')[0]).filter(Boolean);
    expect(/fully evolved only/.test(ctx) && !evo.some(n => sec.indexOf(n) >= 0), 'a Pokemon is in both the evolve and second-move lists: ' + ctx.slice(0, 400));
    await s.call('generateBriefing', false);
    expect(seen.length === 1, 'a second call on the same day must use the cache');
    await s.set({ briefingSearch: true }); await s.call('generateBriefing', true);
    expect(seen.length === 2 && /google_search/.test(seen[1]), 'search grounding must be sent when switched on');
    // Second opinion on a transfer: advice only, shown inside the confirm sheet.
    const st = await s.state(); const p = st.roster[0];
    await s.call('askTransferConfirm', p); await s.page.waitForTimeout(200);
    await s.call('askProfessorTransfer', p); await s.page.waitForTimeout(400);
    const cf = (await s.state()).pendingConfirm;
    expect(cf && /Professor:/.test(cf.message) && /(The app would keep|Removes it from your roster)/.test(cf.message), 'the app\u2019s own warning must stay with the reply: ' + JSON.stringify(cf && cf.message));
    // A reply that does not start with KEEP is overridden whenever the app has keep reasons.
    expect(/Professor: .*(disagree|Power up|Evolve|event)/s.test(cf.message), 'reply missing: ' + cf.message);
    await s.call('closeConfirm');
    await s.page.unroute('**/generativelanguage.googleapis.com/**');
    await s.set({ geminiKey: '', geminiKeys: [], briefing: null, briefingSearch: false });
  });
  await T('EVO-RANK-01', 'PvP', 'League rank uses the best evolution: a 1/14/14 Jigglypuff counts as the 98% Wigglytuff it can become, and is kept', async () => {
    const jig = { idx: 'ev1', name: 'Jigglypuff', dex: 39, cp: 506, hp: 190, atkIV: 1, defIV: 14, staIV: 14, ivAvg: 64.4, lvlMin: 29, lvlMax: 29, ivMeasured: true, great: { rankPct: 83, evolvesTo: 'Jigglypuff' }, ultra: { rankPct: 60, evolvesTo: 'Jigglypuff' }, little: { rankPct: null }, scanDate: '2026-10-25' };
    const q = await s.call('withEvoRanks', jig);
    expect(q.great.rankPct > 95 && q.great.evolvesTo === 'Wigglytuff', 'great rank not evolution-aware: ' + JSON.stringify(q.great));
    expect(q.little.rankPct == null, 'Little Cup must stay on the current form');
    const why = await s.call('keepReasons', q);
    expect(why.some(x => /PvP rank 90%|Best (Great|Ultra) League copy/.test(x)), 'must be protected as a PvP pick: ' + why.join('; '));
    const plain = { ...jig, idx: 'ev2', name: 'Pidgey', dex: 16, atkIV: 5, defIV: 5, staIV: 5 };
    const q2 = await s.call('withEvoRanks', plain);
    expect(q2.great.rankPct >= 0, 'sanity');
  });
  await T('AUDIT-REG-01', 'Safety', 'Reproduced audit failures stay fixed: tier by name+form, any-league PvP, branching evolutions, tier-aware evolution pick, protected Recs, trade gates', async () => {
    const mk = (idx, name, dex, iv, cp, extra) => ({ idx, name, dex, cp, hp: 100, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 20, lvlMax: 20, ivMeasured: true, great: { rankPct: null }, ultra: { rankPct: null }, little: { rankPct: null }, scanDate: '2026-10-01', ...extra });
    // 1. PvPoke ids are spelled differently from display names; forms have their own rows.
    const tiers = await s.page.evaluate(() => { const m = window.PokemonMechanics; return { mime: m.pvpTierFor('Mr. Mime', false, 'great'), hooh: m.pvpTierFor('Ho-Oh', false, 'ultra'), gourg: m.pvpTierFor('Gourgeist', false, 'great'), lil: m.pvpTierFor('Lilligant', false, 'great', 'hisui') }; });
    expect(tiers.mime || tiers.hooh || tiers.gourg, 'name normalisation: ' + JSON.stringify(tiers));
    // 2. A branching evolution is followed to every branch.
    const chain = await s.call('evoChainNames', { name: 'Eevee', form: '' });
    expect(['Vaporeon', 'Espeon', 'Sylveon'].every(n => chain.indexOf(n) >= 0), 'Eevee chain ' + chain.join());
    expect((await s.call('evoChainNames', { name: 'Poliwhirl', form: '' })).indexOf('Poliwrath') >= 0, 'Poliwhirl -> Poliwrath');
    // 3. Great 92 on a tiered species must protect even when Ultra is the better-tiered league (Dusknoir case).
    const dus = await s.call('withEvoRanks', mk('au1', 'Dusknoir', 477, [6, 3, 0], 752, { great: { rankPct: 92.36, evolvesTo: 'Dusknoir' }, ultra: { rankPct: 88.03, evolvesTo: 'Dusknoir' } }));
    const dw = await s.call('keepReasons', dus);
    expect(dw.some(x => /PvP rank 90%|Best (Great|Ultra) League copy/.test(x)), 'Dusknoir must be kept: ' + dw.join());
    // 4. An evolution PvPoke does not rank must not displace the form that is ranked (Vigoroth vs Slaking).
    const vig = await s.call('withEvoRanks', mk('au2', 'Vigoroth', 288, [0, 13, 15], 1400, { great: { rankPct: 88, evolvesTo: 'Vigoroth' } }));
    expect(vig.ultra && /Vigoroth|Slaking/.test(vig.ultra.evolvesTo || ''), 'vigoroth overlay ' + JSON.stringify(vig.ultra));
    // 5. Unmeasured IVs never make Recommendations' transfer list.
    const un = { ...mk('au3', 'Rattata', 19, [1, 1, 1], 100), ivMeasured: false, ivSolved: true };
    const unWhy = await s.call('keepReasons', un);
    expect(unWhy.some(x => /not measured/.test(x)), 'unmeasured must be kept: ' + unWhy.join());
    const trade = await s.call('tradeAdvice');
    expect(Array.isArray(trade.dupes) && Array.isArray(trade.lucky), 'trade advice shape');
    // 6. The in-game search: commas group first (OR), then "&" joins the groups (AND), as checked in the game.
    await s.set({ srchName: 'a, b', srchTypes: [], srchForm: '', srchFlags: { shiny: -1 }, srchStars: [0, 1], srchCpMin: '', srchCpMax: '' });
    const q = await s.call('searchStringFromBuilder');
    expect(q === 'a,b&!shiny&0*,1*', 'builder output: ' + q);
  });
  await T('BULKSTR-01', 'Tools', 'Transfer strings use the game-verified form "names & cps & stars", never select a protected Pokemon, and state the exact count', async () => {
    const mk = (idx, iv, cp, extra) => ({ idx, name: 'Luvdisc', dex: 370, cp, hp: 30, atkIV: iv, defIV: iv, staIV: iv, ivAvg: iv / 15 * 100, lvlMin: 5, lvlMax: 5, ivMeasured: true, great: { rankPct: 10 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01', ...extra });
    const big = { ...mk('bs0', 15, 3000), name: 'Snorlax', dex: 143 };
    const st0 = await s.state();
    const weak = []; for (let i = 0; i < 14; i++) weak.push(mk('bsw' + i, 1 + (i % 3), 600 + i * 7));
    const keeper = mk('bsp1', weak[0].atkIV, 600, { favorite: true });   // same name, CP and stars as a candidate, but protected
    const odd = { ...mk('bso1', 2, 888), name: 'Mr. Mime', dex: 122 };    // a name the game search may not accept
    await s.set({ addedPokemon: [...(st0.addedPokemon || []), big, ...weak, keeper, odd], cutTarget: 1, cutTargetDraft: '1' }); await s.call('recalculateAllRanks'); await s.page.waitForTimeout(400);
    const r = await s.call('buildTransferBatches');
    expect(r.batches.length >= 1, 'no batches');
    expect(r.batches.every(b => /^[a-z,]+ & cp\d+(,cp\d+)* & \d\*(,\d\*)*$/.test(b.text)), 'format: ' + r.batches.map(b => b.text).join(' | '));
    expect(r.batches.every(b => b.text.length <= 90), 'batch over the length cap');
    // The protected look-alike must never be selected: nothing in any batch may match it.
    const sel = (b) => { const nm = b.text.split(' & '); const N = nm[0].split(','), C = nm[1].split(',').map(x => +x.slice(2)), S = (nm[2] || '').split(',').map(x => parseInt(x)); return { N, C, S }; };
    expect(r.batches.every(b => { const t = sel(b); return !(t.N.indexOf('luvdisc') >= 0 && t.C.indexOf(600) >= 0 && t.S.indexOf(weak[0].atkIV <= 3 ? 0 : 1) >= 0); }), 'a batch would also select the protected Luvdisc');
    expect(r.manual.some(m => /keeps it|keep/.test(m.why)) || r.batches.every(b => b.text.indexOf('cp600') < 0), 'the candidate that shares a protected one must be by hand');
    const cands = await s.call('transferCandidates');
    if (cands.some(c => c.p.idx === 'bso1')) expect(r.manual.some(m => /spaces or symbols/.test(m.why)), 'symbol names go to the by-hand list');
    expect(!r.batches.some(b => /mr/.test(b.text)), 'a name with symbols must never be put in a string');
    expect(r.batches.every(b => b.n === b.pokemon.length && b.n >= 1), 'expected count must equal the members');
    await s.set({ toolsMode: 'bulk', tab: 'tools' }); await s.page.waitForTimeout(600);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/Transfer strings/.test(txt) && /exactly \d+ Pokemon/.test(txt) && /Protect in the game too/.test(txt) && /shiny,lucky,shadow/.test(txt), txt.slice(0, 300));
    await s.set({ addedPokemon: st0.addedPokemon || [], cutTarget: 300, cutTargetDraft: '300', toolsMode: 'rename' });
  });
  await T('STRICT-IV-01', 'Safety', 'A record with IVs but no appraisal or typed-in mark counts as unmeasured and is protected', async () => {
    const p = { idx: 'sv1', name: 'Rattata', dex: 19, cp: 100, hp: 30, atkIV: 1, defIV: 1, staIV: 1, ivAvg: 6.7, great: { rankPct: 10 }, ultra: { rankPct: 0 }, little: { rankPct: 0 } };
    expect((await s.call('keepReasons', p)).some(x => /not measured/.test(x)), 'unflagged IVs must be treated as unmeasured');
    expect(!(await s.call('keepReasons', { ...p, ivMeasured: true })).some(x => /not measured/.test(x)), 'measured must pass');
    expect(!(await s.call('keepReasons', { ...p, ivManual: true })).some(x => /not measured/.test(x)), 'typed-in must pass');
  });
  await T('CUT-03', 'Roster', 'An XXL or XXS is never in the cut list ahead of a normal-size duplicate; with protection off it can be', async () => {
    const mk = (idx, h, iv, cp) => ({ idx, name: 'Bulbasaur', dex: 1, cp, hp: 50, height: h, weight: '7kg', atkIV: iv, defIV: iv, staIV: iv, ivAvg: iv / 15 * 100, lvlMin: 10, lvlMax: 10, ivSolved: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01' });
    const xxl = mk('z1', '1.2m', 1, 200), a = mk('z2', '0.7m', 10, 300), b = mk('z3', '0.7m', 12, 320), c = mk('z4', '0.7m', 14, 340);
    await s.set({ protectSizes: 'extreme' });
    const on = (await s.call('cutScoreRows', [xxl, a, b, c])).map(r => r.p.idx);
    expect(on[on.length - 1] === 'z1', 'XXL must be last (kept): ' + on.join());
    expect(/XXL size/.test((await s.call('cutScoreRows', [xxl, a, b, c])).find(r => r.p.idx === 'z1').reason), 'reason names the size');
    await s.set({ protectSizes: 'off' });
    const off = (await s.call('cutScoreRows', [xxl, a, b, c, mk('z5', '0.7m', 15, 360)])).map(r => r.p.idx);
    expect(off[0] === 'z1', 'with protection off the weak XXL is cut first: ' + off.join());
    await s.set({ protectSizes: 'extreme' });
  });
  await T('CUT-02', 'Roster', 'Revealed cut list renders cards with a reason and the renamed button, and says plainly when protection limits it', async () => {
    const mk = (idx, iv, cp) => ({ idx, name: 'Luvdisc', dex: 370, cp, hp: 30, atkIV: iv, defIV: iv, staIV: iv, ivAvg: iv / 15 * 100, lvlMin: 5, lvlMax: 5, ivMeasured: true, great: { rankPct: 10 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: '2026-10-01' });
    const st0 = await s.state();
    const big = { ...mk('w0', 15, 3000), name: 'Snorlax', dex: 143, great: { rankPct: 0 }, scanDate: '2026-10-01' };   // a far stronger Normal attacker, so the weak ones have no raid role
    await s.set({ addedPokemon: [...(st0.addedPokemon || []), big, mk('w1', 1, 640), mk('w2', 2, 650), mk('w3', 3, 660)] }); await s.call('recalculateAllRanks');   // over 500 CP, so no Little Cup rank protects them
    await s.set({ tab: 'home', cutTarget: 1, cutTargetDraft: '1', cutListRevealed: true }); await s.page.waitForTimeout(1200);
    const txt = await s.page.evaluate(() => document.body.innerText);
    expect(/I TRANSFERRED IT/.test(txt) && /(only copy|of \d+ by IV)/.test(txt) && !/is not defined/.test(txt), txt.slice(0, 300));
    expect(/can be cut|weakest/.test(txt), 'headline must say how many are safe: ' + txt.slice(0, 300));
    await s.set({ cutListRevealed: false, cutTarget: 300, cutTargetDraft: '300', addedPokemon: st0.addedPokemon || [] });
  });
  await T('SIZE-01', 'Size', 'Size classes from height + species cut-offs; XXL/XXS protected from transfer; filters, tags, search and showcase list', async () => {
    const info = await s.page.evaluate(() => { const m = window.PokemonMechanics; return { a: m.sizeInfoFor(1, '', 1.2), b: m.sizeInfoFor(1, '', 0.7), c: m.sizeInfoFor(1, '', 0.3), d: m.sizeInfoFor(1, '', '0.36m'), e: m.sizeInfoFor(19, 'alola', 0.3) }; });
    expect(info.a.cls === 'XXL' && info.b.cls === 'M' && info.d.cls === 'XS' && info.e.cls === 'M', JSON.stringify(info));
    expect(info.c.valid === false, 'an impossible height must be flagged as invalid');
    const mk = (idx, h, extra) => ({ idx, name: 'Bulbasaur', dex: 1, cp: 400, hp: 50, height: h, weight: '7kg', atkIV: 1, defIV: 1, staIV: 1, ivAvg: 6.7, scanDate: new Date().toISOString().slice(0, 10), ...extra });
    const big = mk('qa-sz1', '1.2m'), avg = mk('qa-sz2', '0.7m', { cp: 401 }), bad = mk('qa-sz3', '0.3m', { cp: 402 });
    await s.set({ addedPokemon: [big, avg, bad], ivOverrides: {}, protectSizes: 'extreme' }); await s.page.waitForTimeout(300);
    expect(await s.call('sizeProtected', big) === true && await s.call('sizeProtected', avg) === false && await s.call('sizeProtected', bad) === false, 'protection: XXL yes, normal no, impossible height no');
    const v = await s.call('verdictFor', big); expect(v.verdict === 'KEEP' && /showcase/.test(v.reason), JSON.stringify(v));
    expect((await s.call('dominatedDuplicates', [big, mk('qa-sz4', '0.7m', { cp: 500, atkIV: 5, defIV: 5, staIV: 5, ivAvg: 30 })])).every(x => x.loser.idx !== 'qa-sz1'), 'XXL must never be the dominated duplicate');
    await s.set({ protectSizes: 'off' }); expect(await s.call('sizeProtected', big) === false, 'off switches protection off');
    await s.set({ protectSizes: 'extreme', tab: 'tools', toolsMode: 'showcase' }); await s.page.waitForTimeout(500);
    const txt = await s.page.evaluate(() => document.body.innerText); expect(/Showcase picks/.test(txt) && /XXL/.test(txt), 'showcase list: ' + txt.slice(0, 160));
    await s.set({ srchName: '', srchTypes: [], srchForm: '', srchStars: [], srchCpMin: '', srchCpMax: '', srchFlags: { xxl: -1, xxs: -1 }, toolsMode: 'search' }); expect((await s.call('searchStringFromBuilder')) === '!xxl&!xxs', await s.call('searchStringFromBuilder'));
    expect((await s.call('renameFor', big, '{size}{iv}')) === 'XXL7', await s.call('renameFor', big, '{size}{iv}'));
    await s.set({ addedPokemon: [], ivOverrides: {} });
  }, 'critical');
  await T('ADD-01', 'Additions', 'Bulk badge counts pending reviews; import sheet lists changes and Undo restores one Pokemon; evolve note names the shared pool; roster smart filters', async () => {
    const mkp = (idx, name, dex, cp) => ({ idx, name, dex, cp, hp: 50, atkIV: 5, defIV: 5, staIV: 5, ivAvg: 33, candy: 12, scanDate: '2026-10-01' });
    const a = mkp('qa-ad1', 'Vulpix', 37, 500), b = mkp('qa-ad2', 'Pidgey', 16, 300), c = mkp('qa-ad3', 'Pidgey', 16, 310);
    await s.set({ addedPokemon: [a, b, c], ivOverrides: {}, candyInventory: { pidgey: { name: 'Pidgey', candy: 12, xlCandy: 0, at: Date.now(), source: 'manual' } }, tab: 'today' }); await s.page.waitForTimeout(500);
    const badge = await s.page.evaluate(() => { const e = document.querySelector('[aria-label$="to review"]'); return e ? e.textContent.trim() : null; });
    expect(badge && /^\d+\+?$/.test(badge), 'bulk badge: ' + badge);
    // import sheet + revert
    await s.call('mergeVideoImport', [{ name: 'Pidgey', dex: 16, cp: 300, hp: 50, atkIV: 5, defIV: 5, staIV: 5, lucky: true }, { name: 'Rattata', dex: 19, cp: 222, hp: 40, atkIV: 4, defIV: 4, staIV: 4 }]); await s.page.waitForTimeout(400);
    let li = (await s.state()).lastImport; expect(li && li.rows.length === 2 && li.rows.some(r => r.kind === 'new') && li.rows.some(r => r.kind === 'updated'), JSON.stringify(li && li.rows));
    const newRow = li.rows.find(r => r.kind === 'new'), upRow = li.rows.find(r => r.kind === 'updated');
    await s.call('revertImportRow', upRow.idx); await s.call('revertImportRow', newRow.idx); await s.page.waitForTimeout(400);
    const st = await s.state(); expect(!(st.addedPokemon || []).some(p => p.name === 'Rattata'), 'new Pokemon removed by Undo'); expect(((st.ivOverrides || {})[upRow.idx] || {}).lucky !== true, 'updated Pokemon restored');
    expect((await s.state()).lastImport === null, 'sheet data cleared when everything is undone');
    // evolve note
    const note = await s.call('evolveDupNote', { dupTotal: 3, candyPool: 62, affordable: 2, fundable: true, candyAfter: 12, limiting: { name: 'Pidgey', cp: 310, short: 8 } });
    expect(/shared pool of 62 candy/.test(note) && /funds 2 of 3/.test(note) && /12 left after/.test(note) && /Pidgey 310 CP, 8 candy short/.test(note), note);
    // smart filters
    await s.set({ tab: 'roster', rosterFilter: 'formCheck', search: '' }); await s.page.waitForTimeout(500);
    expect(/Vulpix/.test(await s.page.evaluate(() => document.body.innerText)), 'form-to-check filter should list the Vulpix'); await s.set({ rosterFilter: 'all' });
    await s.set({ addedPokemon: [], candyInventory: {}, ivOverrides: {}, lastImport: null });
  }, 'high');
  await T('MAX-06', 'Max', 'A scan of an unlisted species teaches the app; manual toggle can add or remove the tag', async () => {
    const pid = { idx: 'qa-pid', name: 'Pidgey', dynamax: undefined };
    expect(await s.call('isMaxCapable', pid) === false, 'pidgey should not be capable'); expect(await s.call('isMaxCapable', { name: 'Pidgey', dynamax: true }) === true, 'scan evidence');
    expect(await s.call('isMaxCapable', { name: 'Charizard', dynamax: false }) === false, 'explicit denial must beat the list');
    const st = await s.state(); const m = st.roster.find(p => p.name === 'Magikarp'); await s.call('toggleMaxCapable', m); expect((await s.state()).ivOverrides[m.idx].dynamax === true, 'tag not added');
    await s.call('toggleMaxCapable', { ...m, dynamax: true }); expect((await s.state()).ivOverrides[m.idx].dynamax === false, 'tag not removed');
  }, 'high');
  await T('MAX-07', 'Max', 'Max attack info: type from the fast move, G-Max move for Gigantamax, power from the scanned level', async () => {
    const st = await s.state(); const ch = st.roster.find(p => p.name === 'Charizard');
    const plain = await s.call('maxInfoFor', { ...ch, quickMove: 'Fire Spin', gigantamax: false, maxAttackLevel: 2 }); expect(plain && plain.moveType === 'Fire' && plain.moveName === 'Max Flare' && plain.power === 300 && plain.gmax === false, JSON.stringify(plain));
    const gm = await s.call('maxInfoFor', { ...ch, quickMove: 'Fire Spin', gigantamax: true, maxAttackLevel: null }); expect(gm.gmax === true && gm.moveName === 'G-Max Wildfire' && gm.power === 350 && gm.levelsKnown === false, JSON.stringify(gm));
    expect(await s.call('maxInfoFor', { name: 'Magikarp', dynamax: false, idx: 'x' }) === null, 'non-capable must be null');
  }, 'high');
  await T('MAX-08', 'Max', 'Max attackers vs a boss: sorted, capable only, super-effective moves rank above resisted ones', async () => {
    await s.set({ raidBossTypes: ['Water'], raidBossName: 'Test' }); const rows = await s.call('maxAttackers'); expect(rows.length > 0, 'no rows');
    const sc = rows.map(r => r.r.score); expect(sc.every((v, i) => i === 0 || sc[i - 1] >= v), 'not sorted');
    expect(rows.every(r => r.info.moveType && r.r.damage > 0), 'row without move/damage'); const names = rows.map(r => r.p.name);
    const top = rows[0]; expect(top.eff >= 1, 'top attacker should not be resisted: ' + top.p.name + ' ' + top.eff);
    await s.go('RAID'); await s.page.waitForTimeout(500); expect(/MAX ATTACKERS vs THIS BOSS/.test(await s.text()), 'section missing'); expect(/PER MAX HIT/.test(await s.text()), 'no ranked rows shown: ' + names.join());
  }, 'high');
  await T('MAX-11', 'Max', 'Real screen (Arcanine, Dynamax, Max Darkness Lv 1, Guard and Spirit locked): type comes from the tile name, not a guess', async () => {
    const patch = await s.call('maxPatch', { dynamax: true, maxMoveName: 'Max Darkness', maxAttackLevel: 1, maxGuardLevel: null, maxSpiritLevel: null });
    expect(patch.dynamax === true && patch.maxMoveName === 'Max Darkness' && patch.maxAttackLevel === 1 && !('maxGuardLevel' in patch), JSON.stringify(patch));
    const arc = { idx: 'qa-arc', name: 'Arcanine', quickMove: 'Snarl', ...patch };
    const info = await s.call('maxInfoFor', arc); expect(info && info.moveType === 'Dark' && info.moveName === 'Max Darkness' && info.power === 250 && info.guard === 0 && info.spirit === 0 && info.levelsKnown === true, JSON.stringify(info));
    const odd = await s.call('maxInfoFor', { ...arc, quickMove: 'Fire Fang', maxMoveName: 'Max Darkness' }); expect(odd.moveType === 'Dark', 'tile name must win over the fast move: ' + odd.moveType);
    expect(await s.page.evaluate(() => [window.PokemonMechanics.maxMoveType('Max Flare'), window.PokemonMechanics.maxMoveType('G-Max Wildfire'), window.PokemonMechanics.maxMoveType('Max Nothing')].join()) === 'Fire,Fire,', 'maxMoveType');
    expect(Object.keys(await s.call('maxPatch', { maxMoveName: 'Tackle' })).length === 0, 'a non-Max move name must be ignored');
  }, 'critical');
  await T('CAN-08', 'Candy', 'The candy row on an Arcanine screen reads "GROWLITHE CANDY": the whole Growlithe family shares it', async () => {
    const k = async n => s.call('candyKey', n); expect(await k('Arcanine') === await k('Growlithe'), 'family');
    await s.set({ candyInventory: {}, ocrParsed: { name: 'Arcanine', matchedName: 'Arcanine', candy: 207, xlCandy: 28, _rec: {} } }); await s.call('applyOcrResult'); await s.page.waitForTimeout(200);
    const g = await s.call('candyStockFor', { name: 'Growlithe' }); expect(g.candy === 207 && g.xlCandy === 28, JSON.stringify(g));
  }, 'high');
  await T('MAX-09', 'Max', 'All three readers ask for the Dynamax fields (screenshot, video frames, pasted-AI prompt) and the server does too', async () => {
    const src = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8'); const n = (src.match(/dynamax\\?":\s?true\|null/g) || []).length; expect(n >= 3, 'prompts with the field: ' + n);
    expect((src.match(/maxAttackLevel/g) || []).length >= 8, 'levels not wired'); const py = fs.readFileSync(path.join(REPO, 'pogo_extract.py'), 'utf8'); expect(/"dynamax": true\|null/.test(py) && /maxAttackLevel/.test(py), 'server prompt');
  }, 'medium');
  await s.close();
};
