#!/usr/bin/env node
// _POWERUP_RUNS (pokemon-mechanics.js) is the one Power-Up cost table. Everything else reads it: the per-level step cost, the cost between two
// levels and the Stardust -> levels map the OCR uses. This test checks that the table is well formed, that the derived pieces agree with it,
// that its banner names the script that really writes it, and that the level list and the CP/HP helpers have one definition each.
// Run: node scripts/test_powerup_table.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checker, loadMechanicsContext, REPO } = require('./lib/testkit');

const t = checker();
const { m, ctx } = loadMechanicsContext();
const MECH = fs.readFileSync(path.join(REPO, 'pokemon-mechanics.js'), 'utf8');
const GEN = fs.readFileSync(path.join(REPO, 'scripts', 'update_pokemon_data.py'), 'utf8');
const read = expr => vm.runInContext(expr, ctx);

const RUNS = read('_POWERUP_RUNS'), TOP = read('MAX_POKEMON_LEVEL'), TOP_SEARCH = read('MAX_LEVEL_SEARCH'), DUST_MAP = read('_STARDUST_TO_LEVELS');

// ---- one table, one banner, one generator
t.eq('there is exactly one Power-Up cost table in the file', (MECH.match(/const _POWERUP_RUNS = \[/g) || []).length, 1);
t.ok('the hand-kept Stardust tier list is gone', !/_DUST_TIER_START_LEVEL/.test(MECH) && !/_DUST_TIER_START_LEVEL|build_dust_tier_block/.test(GEN));
t.ok('the table sits in a GENERATED BLOCK whose banner names update_pokemon_data.py, and that script writes the same markers',
  /\/\/ GENERATED BLOCK: POWERUP_RUNS \(update_pokemon_data\.py\)/.test(MECH) && /\/\/ END GENERATED BLOCK: POWERUP_RUNS/.test(MECH)
  && GEN.includes('POWERUP_START_MARKER = "// GENERATED BLOCK: POWERUP_RUNS"') && GEN.includes('POWERUP_END_MARKER = "// END GENERATED BLOCK: POWERUP_RUNS"'));
t.eq('MAX_POKEMON_LEVEL is written inside the generated block (the generator derives it)', (MECH.match(/GENERATED BLOCK: POWERUP_RUNS[\s\S]*?const MAX_POKEMON_LEVEL = 50;[\s\S]*?END GENERATED BLOCK: POWERUP_RUNS/g) || []).length, 1);

// ---- the table is well formed
t.eq('it starts at level 1', RUNS[0][0], 1);
t.ok('runs ascend strictly and start on half-levels', RUNS.every((r, i) => (i === 0 || r[0] > RUNS[i - 1][0]) && r[0] * 2 === Math.round(r[0] * 2)));
t.ok('each run is a real change: no two neighbours cost the same', RUNS.every((r, i) => i === 0 || r.slice(1).join() !== RUNS[i - 1].slice(1).join()));
t.ok('the last run ends below MAX_POKEMON_LEVEL and none starts at or above it', RUNS[RUNS.length - 1][0] < TOP && TOP === 50);
t.ok('XL Candy replaces Candy from level 40, never both', RUNS.every(r => (r[0] < 40 ? r[3] === 0 && r[2] > 0 : r[2] === 0 && r[3] > 0)));
t.ok('Stardust never falls as the level rises', RUNS.every((r, i) => i === 0 || r[1] >= RUNS[i - 1][1]));
t.eq('a spread of known steps', [1, 2.5, 25, 26.5, 39.5, 40, 49.5].map(l => m.powerUpStepCost(l)), [
  { dust: 200, candy: 1, xlCandy: 0 }, { dust: 200, candy: 1, xlCandy: 0 }, { dust: 4000, candy: 3, xlCandy: 0 }, { dust: 4000, candy: 4, xlCandy: 0 },
  { dust: 10000, candy: 15, xlCandy: 0 }, { dust: 10000, candy: 0, xlCandy: 10 }, { dust: 15000, candy: 0, xlCandy: 20 }]);
t.ok('there is no step at the top level or above, and none below level 1', [50, 50.5, 51, 0, 0.5, NaN].every(l => m.powerUpStepCost(l) === null));
// every half-level step reads its cost from the runs
const stepOf = lv => { let run = null; for (const r of RUNS) { if (r[0] <= lv) run = r; else break; } return run; };
let stepsOk = true;
for (let lv = 1; lv < TOP; lv += 0.5) { const s = m.powerUpStepCost(lv), r = stepOf(lv); if (!s || s.dust !== r[1] || s.candy !== r[2] || s.xlCandy !== r[3]) stepsOk = false; }
t.ok('powerUpStepCost reads every half-level from the runs', stepsOk);
const total = m.powerUpCostBetween(1, TOP, {});
let sum = 0; for (let lv = 1; lv < TOP; lv += 0.5) sum += stepOf(lv)[1];
t.eq('powerUpCostBetween(1, top) is the sum of the runs', [total.dust, total.steps, total.reachable], [sum, (TOP - 1) * 2, true]);
t.eq('40 to 50 costs 296 XL Candy and 250,000 Stardust (Hub and GamePress agree)', [m.powerUpCostBetween(40, 50, {}).xlCandy, m.powerUpCostBetween(40, 50, {}).dust], [296, 250000]);

// ---- the Stardust -> levels map derives from the table
const expected = {};
for (let lv = 1; lv < TOP_SEARCH; lv += 0.5) {
  const r = stepOf(lv);
  if (lv >= TOP && r !== RUNS[RUNS.length - 1]) continue;
  (expected[r[1]] = expected[r[1]] || []).push(lv);
}
t.eq('the dust map is every half-level that costs that dust, the last tier reaching the top CPM level', DUST_MAP, expected);
t.eq('4000 Stardust is levels 25 to 26.5 (the candy column changes inside the tier)', DUST_MAP[4000], [25, 25.5, 26, 26.5]);
t.eq('10000 Stardust spans the Candy/XL switch', DUST_MAP[10000], [39, 39.5, 40, 40.5]);
t.eq('15000 Stardust keeps the two levels above 50 (a Pokemon can have them, a Power Up screen cannot show them)', DUST_MAP[15000], [49, 49.5, 50, 50.5]);
t.eq('levelsForPowerUpDust answers from the map', [m.levelsForPowerUpDust(4000), m.levelsForPowerUpDust(2000, { lucky: true }), m.levelsForPowerUpDust(4800, { shadow: true })], [[25, 25.5, 26, 26.5], [25, 25.5, 26, 26.5], [25, 25.5, 26, 26.5]]);
t.eq('a cost no tier matches gives no levels', m.levelsForPowerUpDust(100000), []);

// ---- one level list, one derivation of the top
const levels = [...m.LEVELS];
t.eq('LEVELS is the CPM keys, ascending, in half steps from 1', [levels[0], levels[levels.length - 1], levels.length, levels.every((l, i) => i === 0 || l - levels[i - 1] === 0.5)], [1, 51, 101, true]);
t.eq('LEVELS equals Object.keys(CPM) sorted', levels, Object.keys(read('CPM')).map(Number).sort((a, b) => a - b));
t.eq('MAX_LEVEL_SEARCH is the top CPM level (the generator extends CPM to it)', TOP_SEARCH, levels[levels.length - 1]);
t.ok('LEVELS is frozen', Object.isFrozen(m.LEVELS));
t.ok('no function sorts the CPM keys itself any more', !/Object\.keys\(CPM\)\.map\(Number\)\.filter|Object\.keys\(CPM\)\.map\(Number\)\.sort\(\(a, b\) => a - b\);\n/.test(MECH.replace(/^const LEVELS = .*$/m, '')));

// ---- cpAt / hpAt are the formulas cpFor / hpFor / statProductFor use
const sample = [[[118, 111, 128], [0, 0, 0], 1], [[198, 189, 190], [15, 15, 15], 40], [[116, 93, 118], [3, 14, 7], 25.5], [[251, 218, 214], [1, 15, 9], 51], [[40, 40, 40], [0, 0, 0], 1]];
t.ok('cpFor is cpAt of the stat totals', sample.every(([b, iv, l]) => m.cpFor(b, iv, l) === m.cpAt(b[0] + iv[0], b[1] + iv[1], b[2] + iv[2], read('CPM')[l])));
t.ok('hpFor is hpAt of the stamina total', sample.every(([b, iv, l]) => m.hpFor(b, iv[2], l) === m.hpAt(b[2] + iv[2], read('CPM')[l])));
t.eq('known CP and HP values', [m.cpFor([198, 189, 190], [15, 15, 15], 40), m.hpFor([198, 189, 190], 15, 40), m.cpAt(10, 10, 10, 0.094), m.hpAt(1, 0.094)], [2720, 162, 10, 10]);
const strip = (s, from, to) => { const a = s.indexOf(from), b = s.indexOf(to, a); return s.slice(0, a) + s.slice(b); };
const outsideHot = strip(strip(MECH, 'function _spreadProducts(', 'function bestStatProductUnderCap('), 'function dittoRanking(', 'function dittoRankOf(');
t.eq('the 10 CP and 10 HP floors are written in cpAt and hpAt only, outside the two inlined hot loops (guarded by test_rank_reference.js)', (outsideHot.match(/Math\.max\(10, Math\.floor/g) || []).length, 2);

t.exit();
