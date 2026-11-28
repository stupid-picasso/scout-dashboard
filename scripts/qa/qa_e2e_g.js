// QA suite G: Max Moves on the detail sheet: record the levels by hand, level up with typed costs, balances, undo, learned costs.
// Everything is local state; nothing reaches a network. The figures are the group 1 costs (Pikachu); the Dialga figures from the game's upgrade sheet are group 4 and pinned in test_max_levels.js.
const { T, expect, session } = require('./qa_lib');

const mk = (idx, name, dex, iv, cp, extra) => ({ idx, name, dex, cp, hp: 150, atkIV: iv[0], defIV: iv[1], staIV: iv[2], ivAvg: (iv[0] + iv[1] + iv[2]) / 45 * 100, lvlMin: 40, lvlMax: 40, ivMeasured: true, great: { rankPct: 0 }, ultra: { rankPct: 0 }, little: { rankPct: 0 }, scanDate: new Date().toISOString().slice(0, 10), ...extra });

module.exports = async function suiteG() {
  await T('MAXMOVES-01', 'Max', 'Detail sheet Max Moves: levels set by hand, level up with typed costs takes them off the balances, Undo, the typed cost is reused and shown in the planner', async () => {
    const s = await session({ feed: false, width: 390, height: 900 });
    try {
      const pikachu = mk('pk1', 'Pikachu', 25, [15, 15, 15], 3500, { quickMove: 'thunder shock', chargeMove: 'thunderbolt', dynamax: true, favorite: true });
      await s.set({ addedPokemon: [pikachu], roster: [], ivOverrides: {}, completedIds: [], candyInventory: { pikachu: { name: 'Pikachu', candy: 400, xlCandy: 100, at: Date.now() } }, resources: { maxParticles: 5000 }, tab: 'home' });
      await s.page.waitForTimeout(600);
      await s.logic(l => { l.setState({ detailPoke: l.effectiveRosterForMatch().find(p => p.idx === 'pk1') }); return true; });
      const body = () => s.text();
      const waitText = (re, ms) => s.page.waitForFunction(r => new RegExp(r).test(document.body.innerText), re.source, { timeout: ms || 8000 });
      const st = async () => { const x = await s.state(); return { ov: (x.ivOverrides || {}).pk1 || {}, res: x.resources || {}, inv: (x.candyInventory || {}).pikachu || {} }; };
      await waitText(/MAX MOVES/);
      let t = await body();
      expect(/Max Attack: Max Lightning/.test(t) && /Max Guard/.test(t) && /Max Spirit/.test(t), 'the three moves are named, the attack after the fast move type: ' + t.slice(t.indexOf('MAX MOVES'), t.indexOf('MAX MOVES') + 300));
      const btn = name => s.page.getByRole('button', { name, exact: true });
      // the levels are recorded by hand
      await btn('Max Attack: Level 2').click();
      await btn('Max Guard: Level 1').click();
      await s.page.waitForFunction(() => { const o = (window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}; return o.maxAttackLevel === 2 && o.maxGuardLevel === 1; });
      await btn('Max Guard: Locked').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxGuardLevel === 0);
      let x = await st();
      expect(x.ov.maxAttackLevel === 2 && x.ov.maxGuardLevel === 0 && x.res.maxParticles === 5000, 'levels saved on the record, balances untouched: ' + JSON.stringify(x));
      await btn('Max Attack: Level 1').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxAttackLevel === 1);
      // unlock Guard: the estimate is prefilled, type what the game showed
      await btn('Unlock Max Guard').click();
      await waitText(/UNLOCK MAX GUARD/);
      const field = n => s.page.getByLabel(n, { exact: true }).last();
      expect(await field('Max Particles').inputValue() === '400' && await field('Candy').inputValue() === '50' && /Estimate/.test(await body()), 'prefilled from the estimate: ' + await field('Candy').inputValue());
      const type = async (n, v) => { const f = field(n), k = { 'Max Particles': 'mp', Candy: 'candy', 'Candy XL': 'xl' }[n]; await f.fill(v); await f.blur(); await s.page.waitForFunction(a => (window.__qaFindLogic().state.maxUp || {})[a[0]] === a[1], [k, v]); };
      await type('Candy', '80');
      await btn('CONFIRM').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxGuardLevel === 1);
      x = await st();
      expect(x.res.maxParticles === 4600 && x.inv.candy === 320 && x.inv.xlCandy === 100, 'Guard unlocked: 400 Particles and 80 Candy off the balances: ' + JSON.stringify(x));
      expect(JSON.stringify(x.res.maxCosts) === JSON.stringify({ pikachu: { 1: { mp: 400, candy: 80, xl: 0 } } }), 'the typed cost is remembered for the species: ' + JSON.stringify(x.res));
      await waitText(/Max Guard unlocked at level 1/);
      // Undo puts the level, the balances and the learned cost back
      await s.page.getByRole('button', { name: /undo/i }).first().click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxGuardLevel === 0);
      x = await st();
      expect(x.res.maxParticles === 5000 && x.inv.candy === 400 && !x.res.maxCosts, 'Undo restored level, balances and the learned cost: ' + JSON.stringify(x));
      // again, and now the next unlock of another move starts from the learned figure
      await btn('Unlock Max Guard').click();
      await type('Candy', '80');
      await btn('CONFIRM').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxGuardLevel === 1);
      await btn('Unlock Max Spirit').click();
      await waitText(/UNLOCK MAX SPIRIT/);
      expect(await field('Candy').inputValue() === '80' && /Your cost/.test(await body()), 'the learned unlock cost is prefilled and labelled: ' + await field('Candy').inputValue());
      // a different target resets the typed values; take-off-balances off leaves them alone
      await s.page.getByLabel('Target: Level 2', { exact: true }).click();
      await s.page.waitForFunction(() => { const i = document.querySelectorAll('input[aria-label="Candy"]'); return i.length && i[i.length - 1].value === '180'; }, null, { timeout: 5000 }).catch(() => {});
      expect(await field('Candy').inputValue() === '180' && await field('Max Particles').inputValue() === '1000', 'two steps: 80 learned + 100 estimate = 180 candy, 400 + 600 Particles: ' + await field('Candy').inputValue());
      await s.page.getByLabel('Target: Level 1', { exact: true }).click();
      await s.page.getByLabel('Take it off my balances').uncheck();
      await btn('CONFIRM').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxSpiritLevel === 1);
      x = await st();
      expect(x.res.maxParticles === 4600 && x.inv.candy === 320, 'with the box off the balances stay as they were: ' + JSON.stringify(x));
      // Max Attack 1 -> 2, typed 600 + 130, then 2 -> Max with the XL the game showed
      await btn('Level up Max Attack').click();
      await type('Candy', '130'); await btn('CONFIRM').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxAttackLevel === 2);
      await btn('Level up Max Attack').click();
      await type('Candy XL', '55'); await btn('CONFIRM').click();
      await s.page.waitForFunction(() => ((window.__qaFindLogic().state.ivOverrides || {}).pk1 || {}).maxAttackLevel === 3);
      x = await st();
      expect(x.res.maxParticles === 3200 && x.inv.candy === 190 && x.inv.xlCandy === 45, 'balances after both level-ups: ' + JSON.stringify(x));
      expect(JSON.stringify(x.res.maxCosts.pikachu[2]) === JSON.stringify({ mp: 600, candy: 130, xl: 0 }) && JSON.stringify(x.res.maxCosts.pikachu[3]) === JSON.stringify({ mp: 800, candy: 0, xl: 55 }), 'both steps learned: ' + JSON.stringify(x.res.maxCosts));
      expect(!(await s.page.getByRole('button', { name: 'Level up Max Attack' }).count()), 'no level-up at Max');
      // the planner prices a next level from the learned cost: Guard 1 -> 2 is the learned 600 + 130
      await s.logic(l => { l.setState({ detailPoke: null, tab: 'raid' }); return true; });
      await s.page.waitForTimeout(500);
      const pl = await s.logic(l => { const pl = l.maxPlanner(); return pl && pl.tank ? { name: pl.tank.c.p.name, cost: pl.tank.cost } : null; });
      expect(pl && pl.name === 'Pikachu' && pl.cost.mp === 600 && pl.cost.candy === 130 && pl.cost.mine === 1, 'the planner uses the learned step: ' + JSON.stringify(pl));
      await waitText(/Guard level 1, next 600 Max Particles \+ 130 Candy \(your cost\)/);
      // a scan never lowers a hand-set level
      const kept = await s.logic(l => l.maxPatch({ maxAttackLevel: 1, maxGuardLevel: 1, maxSpiritLevel: 3 }, l.monWithOverrides('pk1')));
      expect(JSON.stringify(kept) === JSON.stringify({ maxSpiritLevel: 3 }), 'a lower scan changes nothing, a higher one raises: ' + JSON.stringify(kept));
      expect(s.errors.length === 0, s.errors[0]);
    } finally { await s.close(); }
  });

  await T('MAXDATA-01', 'Max', 'Refresh everything has a "Reload Max Battle data" step: it loads a changed copy (stubbed, no network), says what changed, and the estimates use it; a broken copy keeps the saved data', async () => {
    const s = await session({ feed: false, width: 390, height: 900 });
    try {
      const file = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'data', 'max_data.json'), 'utf8'));
      let body = { ...file, generatedAt: '2031-03-04', tierGroup: { ...file.tierGroup, 483: '1' } };
      let hits = 0;
      const stub = r => { hits++; return r.fulfill({ contentType: 'application/json', body: JSON.stringify(body) }); };
      await s.page.route('**/data/max_data.json*', stub);
      await s.page.route('https://raw.githubusercontent.com/**/max_data.json*', stub);
      await s.set({ tab: 'home', geminiKey: '', geminiKeys: [] });
      expect(await s.logic(l => l.mechanics.maxGroupFor(483)) === '4', 'baked data says Dialga is group 4 before the refresh');
      await s.call('refreshEverything');
      let run = (await s.state()).refreshRun;
      const stepOf = r => r.steps.find(x => x.k === 'maxdata');
      expect(run && !run.running && stepOf(run) && stepOf(run).label === 'Reload Max Battle data' && run.steps.map(x => x.k).indexOf('maxdata') === run.steps.map(x => x.k).indexOf('feed') + 1, 'the step follows the feed: ' + JSON.stringify(run && run.steps.map(x => x.k)));
      expect(stepOf(run).status === 'done' && /changed/.test(stepOf(run).note) && hits >= 1, 'the step reports a change: ' + JSON.stringify(stepOf(run)));
      expect(await s.logic(l => l.mechanics.maxGroupFor(483)) === '1', 'the estimates use the loaded data');
      const txt = await s.page.evaluate(() => document.body.innerText);
      expect(/Reload Max Battle data/.test(txt), 'the step is on screen');
      await s.call('refreshEverything');
      run = (await s.state()).refreshRun;
      expect(/Up to date \(as of 2031-03-04\)/.test(stepOf(run).note), 'second run: nothing changed: ' + stepOf(run).note);
      body = { nope: true };
      await s.call('refreshEverything');
      run = (await s.state()).refreshRun;
      expect(stepOf(run).status === 'skip' && /Offline: using the saved copy/.test(stepOf(run).note) && await s.logic(l => l.mechanics.maxGroupFor(483)) === '1', 'a broken copy keeps what the app had: ' + JSON.stringify(stepOf(run)));
      expect(s.errors.length === 0, s.errors[0]);
    } finally { await s.close(); }
  });

  await T('MOVEPICK-01', 'Moves', 'The move picker lists Frustration for a shadow Pokemon, Return for a purified one, and the moves of PvPoke\'s recommended set the game data lacks (marked), but not for a plain Pokemon', async () => {
    const s = await session({ feed: false, width: 390, height: 900 });
    try {
      const gren = (idx, extra) => mk(idx, 'Greninja', 658, [15, 15, 15], 2500, { quickMove: 'bubble', chargeMove: 'surf', ...extra });
      const open = async (idx, kind, field) => {
        await s.logic((l, a) => { l.setState({ detailPoke: l.effectiveRosterForMatch().find(p => p.idx === a.idx) }); return true; }, { idx });
        await s.page.waitForTimeout(400);
        await s.logic((l, a) => { l.openMovePicker(l.effectiveRosterForMatch().find(p => p.idx === a.idx), a.field, a.kind); return true; }, { idx, field, kind });
        await s.page.waitForTimeout(500);
        const rows = await s.logic((l, a) => { const mp = l.state.movePicker; return !!mp && mp.pokeIdx === a.idx; }, { idx });
        expect(rows, 'the picker opened');
        return s.page.evaluate(() => document.body.innerText);
      };
      await s.set({ addedPokemon: [gren('g1', {}), gren('g2', { shadowPurified: '1' }), gren('g3', { shadowPurified: '2' })], roster: [], ivOverrides: {}, completedIds: [], tab: 'home' });
      await s.page.waitForTimeout(600);
      let t = await open('g1', 'charged', 'chargeMove');
      expect(/Hydro Pump/.test(t) && /Brutal Swing[^\n]*PvPoke set/.test(t), 'a plain Greninja lists its pool and Brutal Swing from the PvPoke set, marked: ' + t.slice(-700));
      expect(!/Frustration/.test(t) && !/Return —/.test(t), 'no Frustration or Return for a plain Pokemon');
      t = await open('g2', 'charged', 'chargeMove');
      expect(/Frustration[^\n]*shadow/.test(t), 'a shadow Pokemon lists Frustration: ' + t.slice(-700));
      t = await open('g3', 'charged', 'chargeMove');
      expect(/Return[^\n]*purified/.test(t) && !/Frustration/.test(t), 'a purified Pokemon lists Return: ' + t.slice(-700));
      t = await open('g2', 'fast', 'quickMove');
      expect(!/Frustration/.test(t), 'Frustration is not offered as a fast move');
    } finally { await s.close(); }
  });

  await T('SEASON-01', 'PvP', 'The Season tab says whether the event feed has not loaded or has no GO Battle League week running today', async () => {
    const s = await session({ feed: false, width: 390, height: 900 });
    try {
      const day = n => new Date(Date.now() + n * 86400000).toISOString();
      const text = async () => { await s.page.waitForTimeout(500); return s.page.evaluate(() => document.body.innerText); };
      await s.set({ addedPokemon: [mk('ps1', 'Azumarill', 184, [2, 15, 15], 1420, {})], roster: [], ivOverrides: {}, completedIds: [], league: 'season', feed: null }); await s.recalc();
      await s.go('PVP');
      let t = await text();
      expect(/No cup is live that the app knows of: the event feed has not loaded/.test(t), 'no feed says so: ' + t.slice(0, 300));
      await s.set({ feed: { events: [], gbl: [{ start: day(3), end: day(10), season: 'Test', leagues: [{ name: 'Great League', cp: 1500, mega: false, rules: [] }], link: '' }] } });
      t = await text();
      expect(/No cup is live right now: the event feed has no GO Battle League week running today \(its first week starts \d{4}-\d{2}-\d{2}\)/.test(t) && !/has not loaded/.test(t), 'a feed without a running week says so: ' + t.slice(0, 300));
    } finally { await s.close(); }
  });

};
