#!/usr/bin/env node
/** test_max_data.js — the Max Battle tables written by import_max_data.py (MAX_TIER_GROUP, MAX_GROUP_COSTS, MAX_MOVE_IDS) and how the
 *  cost helpers in pokemon-mechanics.js use them. Pure: reads only pokemon-mechanics.js. */
const { checker, loadMechanics } = require('./lib/testkit');
const m = loadMechanics();
const t = checker(), check = t.eq, ok = t.ok;

// ---- MAX_TIER_GROUP: dex -> group -------------------------------------------------------------------------------------------
const tg = m.MAX_TIER_GROUP;
ok('species mapped (about a thousand)', Object.keys(tg).length >= 1000, Object.keys(tg).length);
ok('keys are dex numbers (or dex_form), values are known groups', Object.entries(tg).every(([k, v]) => /^\d+(_[a-z0-9_]+)?$/.test(k) && ['1', '2', '3', '4', '8', 'Z'].includes(v)));
check('Dialga (483) is group 4', [tg['483'], m.maxGroupFor('Dialga'), m.maxGroupFor(483)], ['4', '4', '4']);
check('Zacian (888) and Zamazenta (889) are group Z', [tg['888'], tg['889'], m.maxGroupFor('Zacian'), m.maxGroupFor(889)], ['Z', 'Z', 'Z', 'Z']);
check('Eternatus (890) is group 8', tg['890'], '8');
check('Pikachu is group 1', m.maxGroupFor('Pikachu'), '1');
check('only two species are group Z', Object.values(tg).filter(v => v === 'Z').length, 2);
check('unknown species has no group', [m.maxGroupFor('Not A Pokemon'), m.maxGroupFor(99999)], [null, null]);

// ---- MAX_GROUP_COSTS ---------------------------------------------------------------------------------------------------------
const gc = m.MAX_GROUP_COSTS;
check('groups with costs', Object.keys(gc).sort(), ['1', '2', '3', '4', '8', 'Z']);
ok('every group a species uses has costs', Object.values(tg).every(g => gc[g]));
ok('shape: attack has 2 steps, guard and spirit 3', Object.values(gc).every(g => g.attack.length === 2 && g.guard.length === 3 && g.spirit.length === 3));
ok('only known fields, all positive whole numbers', Object.values(gc).every(g => ['attack', 'guard', 'spirit'].every(k => g[k].every(s => Object.entries(s).every(([f, v]) => ['mp', 'candy', 'xl', 'dust'].includes(f) && Number.isInteger(v) && v > 0)))));
check('group 4 attack (Dialga: 600 MP + 130 candy, then 800 MP + 55 XL)', gc['4'].attack, [{ mp: 600, candy: 130 }, { mp: 800, xl: 55 }]);
check('group 4 guard', gc['4'].guard, [{ mp: 400, candy: 80 }, { mp: 600, candy: 130 }, { mp: 800, xl: 55 }]);
check('last step XL by group 1-4', ['1', '2', '3', '4'].map(g => gc[g].attack[1].xl), [40, 45, 50, 55]);
check('group Z pays Stardust and no Max Particles', gc.Z.guard, [{ candy: 80, dust: 25000 }, { candy: 130, dust: 50000 }, { xl: 55, dust: 100000 }]);
check('group Z attack', gc.Z.attack, [{ candy: 130, dust: 50000 }, { xl: 55, dust: 100000 }]);
check('group 8 last step also needs candy', gc['8'].attack[1], { mp: 800, candy: 1200, xl: 320 });
check('the built-in estimate is group 1', [1, 2, 3].map(l => m.maxStepCost(null, 'guard', l)), [1, 2, 3].map(l => m.maxStepCost('1', 'guard', l)));

// ---- cost helpers with a group -----------------------------------------------------------------------------------------------
check('Dialga attack 1->3', m.maxUpgradeCost('attack', 1, 3, undefined, m.maxGroupFor('Dialga')), { mp: 1400, candy: 130, xl: 55, steps: 2 });
check('group beats the xl argument', m.maxUpgradeCost('attack', 2, 3, 40, '4').xl, 55);
check('no group: old estimate and xl argument', m.maxUpgradeCost('attack', 2, 3, 47).xl, 47);
check('Zacian guard 0->3 costs Stardust, not Particles', m.maxUpgradeCost('guard', 0, 3, undefined, 'Z'), { mp: 0, candy: 210, xl: 55, steps: 3, dust: 175000 });
check('a Particle group has no dust field', 'dust' in m.maxUpgradeCost('guard', 0, 3, undefined, '2'), false);
check('learned step wins, the rest is group estimate', m.maxUpgradeCostWith('attack', 1, 3, { 2: { mp: 1, candy: 2, xl: 3 } }, undefined, '4'), { mp: 801, candy: 2, xl: 58, steps: 2, mine: 1, est: 1 });
check('learned Stardust step', m.maxUpgradeCostWith('spirit', 0, 1, { 1: { mp: 0, candy: 7, xl: 0, dust: 9 } }, undefined, 'Z'), { mp: 0, candy: 7, xl: 0, steps: 1, mine: 1, est: 0, dust: 9 });
check('estimate for Zacian is flagged est', m.maxUpgradeCostWith('attack', 1, 2, null, undefined, 'Z'), { mp: 0, candy: 130, xl: 0, steps: 1, mine: 0, est: 1, dust: 50000 });
check('spend takes Stardust only when the cost has it', [m.maxSpend({ mp: 900, candy: 5, xl: 5, dust: 200000 }, { mp: 0, candy: 1, xl: 0, dust: 50000 }).dust, 'dust' in m.maxSpend({ mp: 9 }, { mp: 5, candy: 0, xl: 0 })], [150000, false]);
check('learn keeps Stardust', m.maxLearnStep({}, 2, { mp: 0, candy: 130, xl: 0, dust: 50000 }), { 2: { mp: 0, candy: 130, xl: 0, dust: 50000 } });

// ---- MAX_MOVE_IDS ------------------------------------------------------------------------------------------------------------
const ids = m.MAX_MOVE_IDS;
check('one Max Move per type, ids 001-018', Object.values(ids.types).sort(), Array.from({ length: 18 }, (_, i) => 'VN_BM_' + String(i + 1).padStart(3, '0')));
check('Fire and Dark ids', [ids.types.Fire, ids.types.Dark], ['VN_BM_001', 'VN_BM_016']);
check('same 18 types as MAX_MOVE_BY_TYPE', Object.keys(ids.types).sort(), Object.keys(m.MAX_MOVE_BY_TYPE).sort());
check('g-max entries: id, type, vfxName', ids.gmax.length > 0 && ids.gmax.every(e => e.length === 3 && /^VN_BM_\d{3}$/.test(e[0]) && ids.types[e[1]] && /^gmax_/.test(e[2])), true);
check('g-max Pikachu is Volt Crash', ids.gmax.find(e => e[2] === 'gmax_voltcrash'), ['VN_BM_021', 'Electric', 'gmax_voltcrash']);
check('g-max ids are unique', new Set(ids.gmax.map(e => e[0])).size, ids.gmax.length);
// every G-Max species in the hand list is a move the game master has, with the same type
const slug = s => s.toLowerCase().replace(/^g-?max /, '').replace(/[^a-z]/g, '');
check('MAX_GMAX moves all exist in the game master with the same type', Object.values(m.MAX_GMAX).filter(([mv, ty]) => !ids.gmax.some(e => e[2].replace(/^gmax_/, '').replace(/_/g, '') === slug(mv) && e[1] === ty)), []);

t.exit(t.pass + ' passed, ' + t.fail + ' failed');
