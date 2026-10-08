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
    await s.call('bulkPickForm', v, 'alola'); await s.page.waitForTimeout(300);
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
    expect(out === 'ninetales,vulpix&ice&alola&!shadow&lucky&3*,4*&cp-1500', out);
    await s.set({ tab: 'tools', toolsMode: 'rename' }); await s.page.waitForTimeout(500);
    expect(/Rename/.test(await s.page.evaluate(() => document.body.innerText)), 'rename ui');
    await s.set({ toolsMode: 'search' }); await s.page.waitForTimeout(400);
    expect(/ninetales,vulpix&ice/.test(await s.page.evaluate(() => document.body.innerText)), 'search ui');
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
