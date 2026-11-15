#!/usr/bin/env node
/** test_max.js — the Max (Dynamax / Gigantamax) tables and cost helpers in pokemon-mechanics.js. */
const vm = require('vm'), fs = require('fs'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'pokemon-mechanics.js'), 'utf8');
const ctx = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const m = ctx.window.PokemonMechanics;
let pass = 0, fail = 0;
function check(name, got, want) { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log('FAIL', name, 'got', g, 'want', w); } }

check('max attack power L1-3', [1, 2, 3].map(l => m.maxAttackPower(l, false)), [250, 300, 350]);
check('g-max attack power L1-3', [1, 2, 3].map(l => m.maxAttackPower(l, true)), [350, 400, 450]);
check('levels cap at 3', [m.maxAttackPower(9, false), m.maxAttackPower(9, true)], [350, 450]);
check('guard', [0, 1, 2, 3].map(m.maxGuardHp), [0, 20, 40, 60]);
check('spirit', [0, 1, 2, 3].map(m.maxSpiritPct), [0, 8, 12, 16]);
// costs: guard/spirit 0 -> 3 is 1800 MP, 150 candy, 40 XL; attack 1 -> 3 is 1400 MP, 100 candy, 40 XL
check('guard 0->3', m.maxUpgradeCost('guard', 0, 3), { mp: 1800, candy: 150, xl: 40, steps: 3 });
check('attack 1->3', m.maxUpgradeCost('attack', 1, 3), { mp: 1400, candy: 100, xl: 40, steps: 2 });
check('attack 1->2', m.maxUpgradeCost('attack', 1, 2), { mp: 600, candy: 100, xl: 0, steps: 1 });
check('spirit 1->2 and xl group', m.maxUpgradeCost('spirit', 2, 3, 55), { mp: 800, candy: 0, xl: 55, steps: 1 });
check('nothing to buy', [m.maxUpgradeCost('attack', 3, 3), m.maxUpgradeCost('attack', 2, 1)], [null, null]);
check('attack never below level 1', m.maxUpgradeCost('attack', 0, 2), { mp: 600, candy: 100, xl: 0, steps: 1 });
check('entry cost', [1, 2, 3, 4, 5, 6].map(m.maxEntryCost), [250, 400, 400, 800, 800, 800]);
check('days to earn', [m.maxDaysToEarn(0), m.maxDaysToEarn(800), m.maxDaysToEarn(801), m.maxDaysToEarn(1800)], [0, 1, 2, 3]);
check('species list', [m.isMaxSeedSpecies('Machop'), m.isMaxSeedSpecies('Haunter'), m.isMaxSeedSpecies('Duraludon'), m.isMaxSeedSpecies('Magikarp')], [true, true, true, false]);
check('17 g-max species (Serebii, Nov 2026)', Object.keys(m.MAX_GMAX).length, 17);
check('g-max Duraludon', m.gmaxFor('G-Max Duraludon'), { move: 'G-Max Depletion', type: 'Dragon' });
check('meter', [m.MAX_METER.cap, m.MAX_METER.turns], [100, 3]);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
