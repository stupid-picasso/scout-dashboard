#!/usr/bin/env node
/**
 * test_max_levels.js - "Max Moves: record and upgrade levels". Pure parts in pokemon-mechanics.js (learned per-step costs, the cost of a
 * jump, spending that never goes below 0) and the app methods on the real source of Scout Dashboard.dc.html (the scan rule in maxPatch,
 * the level-up confirm with balances, learning and undo). The Dialga figures are what the game's upgrade sheet showed for that species.
 * LEVELS_SRC=<path> and LEVELS_MECH=<path> point it at broken copies (to prove the tests fail on one).
 *
 * USAGE: node scripts/test_max_levels.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { checker } = require('./lib/testkit');

const ROOT = path.dirname(__dirname);
const SRC = fs.readFileSync(process.env.LEVELS_SRC || path.join(ROOT, 'Scout Dashboard.dc.html'), 'utf8');
const MECH = fs.readFileSync(process.env.LEVELS_MECH || path.join(ROOT, 'pokemon-mechanics.js'), 'utf8');
const mctx = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
vm.createContext(mctx); vm.runInContext(MECH, mctx);
const M = mctx.window.PokemonMechanics;
const t = checker(), eq = t.eq, ok = t.ok;

function bodyOf(src, name) {
  const m = new RegExp('\\n  (?:async )?' + name + '\\(([^)]*)\\) \\{').exec(src);
  if (!m) throw new Error('Could not find the method "' + name + '" in the source');
  const open = m.index + m[0].length - 1;
  let depth = 0, j = open;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return { args: m[1].split(',').map(s => s.trim()).filter(Boolean), text: src.slice(open + 1, j) };
}
const methodOf = (src, name) => { const b = bodyOf(src, name); return new Function(...b.args, b.text); };
// The one-line methods (maxLearned and the like) are written on a single line: read them up to the closing brace of the line.
const lineOf = (src, name) => { const m = new RegExp('\\n  ' + name + '\\(([^)]*)\\) \\{ (.*) \\}\\n').exec(src); if (!m) throw new Error('no one-line method ' + name); return new Function(...m[1].split(',').map(s => s.trim()).filter(Boolean), m[2]); };

// ---- DIALGA, as the game showed it (a legendary): per step cost to reach level 1 / 2 / 3 ----
const DIALGA = { 1: { mp: 400, candy: 80, xl: 0 }, 2: { mp: 600, candy: 130, xl: 0 }, 3: { mp: 800, candy: 0, xl: 55 } };
const cost = (mv, a, b, l) => { const c = M.maxUpgradeCostWith(mv, a, b, l); return c && { mp: c.mp, candy: c.candy, xl: c.xl }; };
eq('Dialga Max Attack 1 -> 2', cost('attack', 1, 2, DIALGA), { mp: 600, candy: 130, xl: 0 });
eq('Dialga Max Attack 1 -> MAX', cost('attack', 1, 3, DIALGA), { mp: 1400, candy: 130, xl: 55 });
eq('Dialga Max Guard LOCKED -> 1', cost('guard', 0, 1, DIALGA), { mp: 400, candy: 80, xl: 0 });
eq('Dialga Max Guard LOCKED -> 2', cost('guard', 0, 2, DIALGA), { mp: 1000, candy: 210, xl: 0 });
eq('Dialga Max Spirit LOCKED -> MAX', cost('spirit', 0, 3, DIALGA), { mp: 1800, candy: 210, xl: 55 });

// ---- precedence: learned step beats the estimate, step by step ----
eq('no learned costs: the estimate', cost('attack', 1, 2, null), { mp: 600, candy: 100, xl: 0 });
eq('a learned step 2 replaces the estimate for that step', cost('attack', 1, 2, { 2: { mp: 600, candy: 130, xl: 0 } }), { mp: 600, candy: 130, xl: 0 });
eq('a step that is not learned keeps the estimate', cost('guard', 0, 2, { 2: { mp: 600, candy: 130, xl: 0 } }), { mp: 1000, candy: 180, xl: 0 });
{
  const c = M.maxUpgradeCostWith('guard', 0, 3, { 1: DIALGA[1] });
  eq('mine / est count the steps by source', [c.steps, c.mine, c.est], [3, 1, 2]);
  const all = M.maxUpgradeCostWith('guard', 0, 3, DIALGA);
  eq('all learned', [all.mine, all.est], [3, 0]);
  eq('none learned', [M.maxUpgradeCostWith('guard', 0, 3, {}).mine, M.maxUpgradeCostWith('guard', 0, 3, null).est], [0, 3]);
}
eq('the old function is unchanged', M.maxUpgradeCost('attack', 1, 3), { mp: 1400, candy: 100, xl: 40, steps: 2 });

// ---- a multi-level jump is the sum of its steps, for every pair ----
{
  const L = { 1: { mp: 410, candy: 77, xl: 0 }, 2: { mp: 650, candy: 133, xl: 0 }, 3: { mp: 820, candy: 0, xl: 52 } };
  let bad = null;
  ['attack', 'guard', 'spirit'].forEach(mv => { for (let a = 0; a <= 3; a++) for (let b = 0; b <= 4; b++) {
    for (const learned of [L, { 2: L[2] }, null]) {
      const whole = M.maxUpgradeCostWith(mv, a, b, learned);
      const lo = Math.max(mv === 'attack' ? 1 : 0, a), hi = Math.min(3, b);
      let sum = hi > lo ? { mp: 0, candy: 0, xl: 0 } : null;
      for (let lv = lo + 1; lv <= hi; lv++) { const s1 = M.maxUpgradeCostWith(mv, lv - 1, lv, learned); sum.mp += s1.mp; sum.candy += s1.candy; sum.xl += s1.xl; }
      const got = whole && { mp: whole.mp, candy: whole.candy, xl: whole.xl };
      if (JSON.stringify(got) !== JSON.stringify(sum)) bad = bad || [mv, a, b, got, sum];
    }
  } });
  ok('the cost of a jump equals the sum of its single steps (3 moves x 4 x 5 x 3 learned sets)', !bad, bad);
}

// ---- spending never goes below 0 and unknown stays unknown ----
eq('spend', M.maxSpend({ mp: 5000, candy: 400, xl: 100 }, { mp: 600, candy: 130, xl: 0 }), { mp: 4400, candy: 270, xl: 100 });
eq('spend clamps at 0', M.maxSpend({ mp: 100, candy: 16, xl: 9 }, { mp: 600, candy: 130, xl: 55 }), { mp: 0, candy: 0, xl: 0 });
eq('spend: an unknown balance stays unknown', M.maxSpend({ mp: null, candy: undefined, xl: 9 }, { mp: 600, candy: 130, xl: 5 }), { mp: null, candy: null, xl: 4 });
eq('spend: exactly enough is 0', M.maxSpend({ mp: 600, candy: 130, xl: 0 }, { mp: 600, candy: 130, xl: 0 }), { mp: 0, candy: 0, xl: 0 });
{
  const a = { 2: { mp: 1, candy: 2, xl: 0 } }, b = M.maxLearnStep(a, 3, { mp: 800, candy: '0', xl: 55.9 });
  eq('learn a step', b, { 2: { mp: 1, candy: 2, xl: 0 }, 3: { mp: 800, candy: 0, xl: 55 } });
  eq('learning does not change the old map', a, { 2: { mp: 1, candy: 2, xl: 0 } });
  eq('a bad level learns nothing', [M.maxLearnStep(a, 0, { mp: 1 }), M.maxLearnStep(a, 4, { mp: 1 })], [a, a]);
}

// ---- the scan rule (maxPatch on the real source) ----
const patchOf = methodOf(SRC, 'maxPatch');
const mp = (o, prior) => patchOf.call({}, o, prior);
eq('"MAX" reads as level 3', mp({ maxAttackLevel: 'MAX' }), { maxAttackLevel: 3 });
eq('"MAX!" and "max!" read as level 3', [mp({ maxGuardLevel: 'MAX!' }), mp({ maxSpiritLevel: ' max! ' })], [{ maxGuardLevel: 3 }, { maxSpiritLevel: 3 }]);
eq('"LEVEL 2", "Lv 1", "2" and 2', [mp({ maxAttackLevel: 'LEVEL 2' }), mp({ maxAttackLevel: 'Lv 1' }), mp({ maxAttackLevel: '2' }), mp({ maxAttackLevel: 2 })], [{ maxAttackLevel: 2 }, { maxAttackLevel: 1 }, { maxAttackLevel: 2 }, { maxAttackLevel: 2 }]);
eq('LOCKED, null and junk give no level', mp({ maxAttackLevel: 'LOCKED', maxGuardLevel: null, maxSpiritLevel: 'x', max_guard_level: '' }), {});
eq('out of range gives none', mp({ maxAttackLevel: 0, maxGuardLevel: 4 }), {});
eq('the snake_case record of the server import', mp({ max_attack_level: 'MAX!', max_spirit_level: 2 }), { maxAttackLevel: 3, maxSpiritLevel: 2 });
eq('no prior: a scan fills', mp({ maxAttackLevel: 2 }, null), { maxAttackLevel: 2 });
eq('a scan raises a lower level', mp({ maxAttackLevel: 3, maxGuardLevel: 2 }, { maxAttackLevel: 1, maxGuardLevel: 1 }), { maxAttackLevel: 3, maxGuardLevel: 2 });
eq('a locked 0 is filled by a scan', mp({ maxGuardLevel: 1 }, { maxGuardLevel: 0 }), { maxGuardLevel: 1 });
eq('a scan never lowers a hand-set level', mp({ maxAttackLevel: 1, maxGuardLevel: 1, maxSpiritLevel: 2 }, { maxAttackLevel: 3, maxGuardLevel: 2, maxSpiritLevel: 3 }), {});
eq('an equal level is left alone', mp({ maxAttackLevel: 2 }, { maxAttackLevel: 2 }), {});
eq('the other levels still follow when one is lower', mp({ maxAttackLevel: 1, maxSpiritLevel: 3 }, { maxAttackLevel: 2, maxSpiritLevel: 1 }), { maxSpiritLevel: 3 });
eq('the marks are unchanged', mp({ dynamax: true, gigantamax: true, maxMoveName: 'Max Steelspike' }, { maxAttackLevel: 3 }), { dynamax: true, gigantamax: true, maxMoveName: 'Max Steelspike' });

// ---- the level-up confirm on the real methods ----
const syncKeys = new Set([...(/get SYNC_SCHEMA\(\) \{([\s\S]*?)\n  \}\n/.exec(SRC)[1]).matchAll(/R\('(\w+)'/g)].map(m => m[1]));
function makeCtx(over) {
  const ctx = {
    mechanics: M, undoLabel: '',
    state: { resources: { maxParticles: 5000 }, candyInventory: { dialga: { name: 'Dialga', candy: 400, xlCandy: 100, at: 1 } }, ivOverrides: { d1: {} }, maxUp: null, undoLabel: '', ...(over || {}) },
    setState(u, cb) { Object.assign(this.state, u); if (cb) cb(); }, haptic() {}, pushNow() {}, queueCloudPush() {}, clearDerivedCaches() {}, recalculateAllRanks() {},
    candyKey(n) { return String(n || '').toLowerCase(); },
    candyStockFor(p) { const r = (this.state.candyInventory || {})[this.candyKey(p.name)]; return r ? { candy: r.candy != null ? r.candy : null, xlCandy: r.xlCandy != null ? r.xlCandy : null } : { candy: null, xlCandy: null }; },
    familyCandyFor(p) { return { ...this.candyStockFor(p), name: p.name }; },
    maxInfoFor(p) { return { level: Number(p.maxAttackLevel) || 1, guard: Number(p.maxGuardLevel) || 0, spirit: Number(p.maxSpiritLevel) || 0 }; },
    rec() { return { idx: 'd1', name: 'Dialga', ...(this.state.ivOverrides.d1 || {}) }; }
  };
  ['maxLearned', 'maxCostFor', 'maxLevelKey', 'setMaxUp'].forEach(n => { try { ctx[n] = lineOf(SRC, n).bind(ctx); } catch (e) { ctx[n] = methodOf(SRC, n).bind(ctx); } });
  ['maxUpView', 'confirmMaxUp', 'openMaxUp', 'patchMons', 'patchMon', 'offerUndo', 'performUndo', 'saveResources'].forEach(n => { ctx[n] = methodOf(SRC, n).bind(ctx); });
  return ctx;
}
const open = (c, move, to, typed) => { c.state.maxUp = { idx: 'd1', move, to, take: true, ...(typed || {}) }; };
const snapshot = c => JSON.stringify([c.state.resources, c.state.candyInventory, c.state.ivOverrides]);

{
  const c = makeCtx();
  open(c, 'attack', 2, { mp: '600', candy: '130', xl: '0' });
  const v = c.maxUpView(c.rec());
  eq('the view: from, to, numbers', [v.from, v.to, v.n], [1, 2, { mp: 600, candy: 130, xl: 0 }]);
  c.confirmMaxUp(c.rec());
  eq('level set', c.state.ivOverrides.d1.maxAttackLevel, 2);
  eq('Max Particles reduced', c.state.resources.maxParticles, 4400);
  eq('candy reduced, XL left', [c.state.candyInventory.dialga.candy, c.state.candyInventory.dialga.xlCandy], [270, 100]);
  eq('the typed cost is remembered for the species, for that step', c.state.resources.maxCosts, { dialga: { 2: { mp: 600, candy: 130, xl: 0 } } });
  eq('the panel is closed', c.state.maxUp, null);
  eq('the undo toast names it', c.state.undoLabel, 'Max Attack to level 2');
  // the next level-up of this species starts from what was learned (the unlock of Guard is a different step, still the estimate)
  open(c, 'guard', 2);
  const g = c.maxUpView({ idx: 'd1', name: 'Dialga' });
  eq('learned step 2 is prefilled, step 1 is the estimate', [g.n, g.c.mine, g.c.est], [{ mp: 1000, candy: 180, xl: 0 }, 1, 1]);
  open(c, 'spirit', 2);
  eq('level 2 for another move uses the same learned step', c.maxUpView({ idx: 'd1', name: 'Dialga' }).c.mine, 1);
  // undo restores the level, both balances and the learned cost
  c.performUndo();
  eq('undo: level gone', c.state.ivOverrides.d1.maxAttackLevel, undefined);
  eq('undo: balances and learned cost back', [c.state.resources, c.state.candyInventory.dialga.candy], [{ maxParticles: 5000 }, 400]);
}
{
  // untouched prefill (an estimate accepted as it is) is never saved as "your cost"
  const c = makeCtx();
  open(c, 'guard', 1);
  c.confirmMaxUp(c.rec());
  eq('estimate accepted: level set, estimate paid', [c.state.ivOverrides.d1.maxGuardLevel, c.state.resources.maxParticles, c.state.candyInventory.dialga.candy], [1, 4600, 350]);
  eq('estimate accepted: nothing learned', c.state.resources.maxCosts, undefined);
  // a typed total over several levels is not split into steps
  open(c, 'spirit', 3, { mp: '1800', candy: '210', xl: '55' });
  c.confirmMaxUp(c.rec());
  eq('several levels typed: level set, balances paid', [c.state.ivOverrides.d1.maxSpiritLevel, c.state.resources.maxParticles, c.state.candyInventory.dialga.candy, c.state.candyInventory.dialga.xlCandy], [3, 2800, 140, 45]);
  eq('several levels typed: nothing learned', c.state.resources.maxCosts, undefined);
}
{
  // never below 0, and unknown balances are left unknown
  const c = makeCtx({ resources: { maxParticles: 100 }, candyInventory: { dialga: { name: 'Dialga', candy: 16, xlCandy: 9, at: 1 } } });
  open(c, 'guard', 1, { mp: '400', candy: '80', xl: '0' });
  c.confirmMaxUp(c.rec());
  eq('balances stop at 0 (Particles 100 - 400, candy 16 - 80)', [c.state.resources.maxParticles, c.state.candyInventory.dialga.candy, c.state.candyInventory.dialga.xlCandy], [0, 0, 9]);
  const d = makeCtx({ resources: {}, candyInventory: {} });
  open(d, 'attack', 2, { mp: '600', candy: '130', xl: '0' });
  d.confirmMaxUp(d.rec());
  eq('unknown balances stay unknown, the level is still set', [d.state.resources.maxParticles, d.state.candyInventory, d.state.ivOverrides.d1.maxAttackLevel], [undefined, {}, 2]);
  const e = makeCtx();
  open(e, 'attack', 2); e.state.maxUp.take = false; e.state.maxUp.mp = '600';
  const before = snapshot(e);
  e.confirmMaxUp(e.rec());
  eq('"take it off my balances" off: only the level changes', [JSON.stringify([e.state.resources.maxParticles, e.state.candyInventory.dialga.candy]), e.state.ivOverrides.d1.maxAttackLevel], [JSON.stringify([5000, 400]), 2]);
  ok('the learned cost is still remembered with the box off', e.state.resources.maxCosts && e.state.resources.maxCosts.dialga[2].mp === 600, e.state.resources);
  ok('(the snapshot differs only by the level and the learned cost)', before !== snapshot(e));
}
{
  // sync: everything a confirm changes is a synced key (or the panel itself), and the Resources form keeps the learned costs
  const c = makeCtx();
  const keys0 = Object.keys(c.state);
  open(c, 'attack', 2, { mp: '600', candy: '130', xl: '0' });
  const before = { ...c.state };
  c.confirmMaxUp(c.rec());
  const changed = Object.keys(c.state).filter(k => c.state[k] !== before[k] || !keys0.includes(k));
  ok('every changed key is synced (ivOverrides, candyInventory, resources) or the panel', changed.every(k => syncKeys.has(k) || k === 'maxUp' || k === 'undoLabel'), changed);
  ok('the learned costs are inside a synced key', syncKeys.has('resources') && !!c.state.resources.maxCosts);
  c.state.resourcesDraft = { rareCandy: '5', rareCandyXL: '', fastTM: '', chargedTM: '', eliteFastTM: '', eliteChargedTM: '' };
  c.saveResources();
  eq('saving the Resources form keeps Max Particles and the learned costs', [c.state.resources.maxParticles, !!c.state.resources.maxCosts, c.state.resources.rareCandy], [4400, true, 5]);
}
{
  // the panel belongs to the Pokemon it was opened on
  const c = makeCtx();
  open(c, 'attack', 2);
  eq('another Pokemon does not see the panel', c.maxUpView({ idx: 'other', name: 'Dialga' }), null);
  c.state.maxUp = null;
  c.openMaxUp({ idx: 'd1', name: 'Dialga', maxAttackLevel: 3 }, 'attack');
  eq('nothing to open at Max', c.state.maxUp, null);
  c.openMaxUp({ idx: 'd1', name: 'Dialga', maxAttackLevel: 1 }, 'guard');
  eq('a locked move opens at level 1', [c.state.maxUp.to, c.state.maxUp.take], [1, true]);
}
{
  // a powered-up Pokemon's merge carries the hand-set Max levels and never lowers one the new record already has
  const merge = (oldO, newO) => {
    const c = { state: { roster: [{ idx: 'o1', name: 'Dialga', cp: 1500 }], addedPokemon: [{ idx: 'n1', name: 'Dialga', cp: 1600 }], ivOverrides: { o1: oldO, ...(newO ? { n1: newO } : {}) }, removedIds: [],
      lastImport: { pairs: [{ n: 'n1', o: 'o1', name: 'Dialga', ocp: 1500, ncp: 1600 }] } },
      setState(u, cb) { Object.assign(this.state, u); if (cb) cb(); }, pushNow() {},
      monWithOverrides(i) { return { ...this.state.roster.find(r => r.idx === i), ...(this.state.ivOverrides[i] || {}) }; } };
    c.mergePowerUp = methodOf(SRC, 'mergePowerUp').bind(c);
    c.mergePowerUp('n1');
    const o = c.state.ivOverrides.n1 || {};
    return [o.maxAttackLevel, o.maxGuardLevel, o.maxSpiritLevel];
  };
  eq('the merge carries the old levels', merge({ maxAttackLevel: 2, maxGuardLevel: 3, maxSpiritLevel: 0 }), [2, 3, 0]);
  eq('the merge never lowers a level the new record has', merge({ maxAttackLevel: 2, maxGuardLevel: 1 }, { maxAttackLevel: 3, maxGuardLevel: 1 }), [3, 1, undefined]);
  eq('the merge raises a lower level on the new record', merge({ maxAttackLevel: 3 }, { maxAttackLevel: 1 }), [3, undefined, undefined]);
}

t.exit();
