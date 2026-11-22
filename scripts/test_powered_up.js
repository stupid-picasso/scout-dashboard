#!/usr/bin/env node
/**
 * test_powered_up.js - the "Powered-up link" feature of Scout Dashboard.dc.html: findPoweredUpPairs (pure), commitImport (puts the pairs in the receipt),
 * mergePowerUp (retire the old record, carry the owner's data, undo) and revertImportRow (undoing a merged new record brings the old one back).
 * Real method source is extracted from the shipped file; POWERED_SRC=<path> points it at a broken copy (used to prove the tests fail on one).
 *
 * USAGE: node scripts/test_powered_up.js
 */
const fs = require('fs');
const path = require('path');
const { checker } = require('./lib/testkit');

const SRC = fs.readFileSync(process.env.POWERED_SRC || path.join(path.dirname(__dirname), 'Scout Dashboard.dc.html'), 'utf8');
function method(name) {
  const m = new RegExp('\\n  ' + name + '\\(([^)]*)\\) \\{').exec(SRC);
  if (!m) throw new Error('Could not find the method "' + name + '" in the source');
  const open = m.index + m[0].length - 1;
  let depth = 0, j = open;
  for (; j < SRC.length; j++) { if (SRC[j] === '{') depth++; else if (SRC[j] === '}' && --depth === 0) break; }
  return new Function(...m[1].split(',').map(s => s.trim()).filter(Boolean), SRC.slice(open + 1, j));
}
const t = checker(), eq = t.eq, ok = t.ok;
const IV = (a, d, s) => ({ atkIV: a, defIV: d, staIV: s });
const mon = (idx, name, cp, hp, ivs, extra) => ({ idx, name, form: null, cp, hp, ...IV(...(ivs || [10, 11, 12])), ...(extra || {}) });
function makeCtx(state) {
  const ctx = {
    state: { roster: [], addedPokemon: [], ivOverrides: {}, removedIds: [], lastImport: null, ...(state || {}) }, pushes: 0,
    setState(u, cb) { Object.assign(this.state, u); if (cb) cb(); }, pushNow() { this.pushes++; }
  };
  ['findPoweredUpPairs', 'commitImport', 'mergePowerUp', 'revertImportRow', 'monWithOverrides'].forEach(n => { ctx[n] = method(n).bind(ctx); });
  ctx.setStardust = () => {};
  return ctx;
}
const find = (news, pool, removed) => makeCtx().findPoweredUpPairs(news, pool, new Set(removed || [])).map(p => p.n + '>' + p.o);

// ---- findPoweredUpPairs ----
(function pure() {
  const old = mon('o1', 'Machamp', 1500, 120, [10, 11, 12]);
  eq('a confident pair: same species, form, IV triple, lower CP, HP not lower', makeCtx().findPoweredUpPairs([mon('n1', 'Machamp', 1600, 125)], [old], new Set()),
    [{ n: 'n1', o: 'o1', name: 'Machamp', ocp: 1500, ncp: 1600 }]);
  eq('species compared without case', find([mon('n1', 'machamp', 1600, 125)], [old]), ['n1>o1']);
  eq('equal HP is fine', find([mon('n1', 'Machamp', 1600, 120)], [old]), ['n1>o1']);
  eq('the IV triple differs in one number: no pair', find([mon('n1', 'Machamp', 1600, 125, [10, 11, 13])], [old]), []);
  eq('a lower new CP is no pair', find([mon('n1', 'Machamp', 1400, 125)], [old]), []);
  eq('the same CP is no pair', find([mon('n1', 'Machamp', 1500, 125)], [old]), []);
  eq('the new HP is lower than the old: no pair', find([mon('n1', 'Machamp', 1600, 110)], [old]), []);
  eq('HP unknown on the new record does not rule it out', find([mon('n1', 'Machamp', 1600, null)], [old]), ['n1>o1']);
  eq('another species: no pair', find([mon('n1', 'Machoke', 1600, 125)], [old]), []);
  eq('a different form: no pair', find([mon('n1', 'Machamp', 1600, 125, null, { form: 'alolan' })], [old]), []);
  eq('null and normal are the same form', find([mon('n1', 'Machamp', 1600, 125, null, { form: 'normal' })], [old]), ['n1>o1']);
  eq('the same regional form on both sides pairs', find([mon('n1', 'Machamp', 1600, 125, null, { form: 'Alolan' })], [{ ...old, form: 'alolan' }]), ['n1>o1']);
  eq('two old candidates: no pair', find([mon('n1', 'Machamp', 1600, 125)], [old, mon('o2', 'Machamp', 1450, 118)]), []);
  eq('an old record with a higher CP is not a second candidate', find([mon('n1', 'Machamp', 1600, 125)], [old, mon('o2', 'Machamp', 1700, 130)]), ['n1>o1']);
  eq('IVs not known on the new record (a range): no pair', find([mon('n1', 'Machamp', 1600, 125, [null, null, null])], [old]), []);
  eq('IVs not known on the old record: no pair', find([mon('n1', 'Machamp', 1600, 125)], [mon('o1', 'Machamp', 1500, 120, [null, null, null])]), []);
  eq('an old record that is removed: no pair', find([mon('n1', 'Machamp', 1600, 125)], [old], ['o1']), []);
  eq('the new record is never its own old record', find([mon('n1', 'Machamp', 1600, 125)], [mon('n1', 'Machamp', 1600, 125)]), []);
  eq('CP unknown: no pair', find([mon('n1', 'Machamp', null, 125)], [old]), []);
  eq('two new records that claim the same old one: neither pairs', find([mon('n1', 'Machamp', 1600, 125), mon('n2', 'Machamp', 1650, 128)], [old]), []);
  eq('two new records, two different old ones: both pair', find([mon('n1', 'Machamp', 1600, 125), mon('n2', 'Gengar', 1800, 130, [1, 2, 3])], [old, mon('o3', 'Gengar', 1700, 120, [1, 2, 3])]), ['n1>o1', 'n2>o3']);
  eq('no new records, no pairs', find([], [old]), []);
  const news = [Object.freeze(mon('n1', 'Machamp', 1600, 125))], pool = [Object.freeze({ ...old })];
  eq('frozen inputs are fine (nothing is changed)', find(news, pool), ['n1>o1']);
})();

// ---- commitImport: the pairs go in the receipt, only when there are some ----
(function commit() {
  const newRec = mon('video-1', 'Machamp', 1600, 125), old = mon('r1', 'Machamp', 1500, 120);
  const patch = more => ({ ivOverrides: {}, addedPokemon: [newRec], candyInventory: {}, typeTable: {}, removedIds: [], recentChanged: { ids: ['video-1'] },
    lastImport: { at: 1, rows: [{ idx: 'video-1', kind: 'new' }], revert: { 'video-1': { kind: 'insert' } } }, importSheetOpen: false, ...more });
  let c = makeCtx({ roster: [old] });
  c.commitImport(patch());
  eq('the receipt carries the pair', c.state.lastImport.pairs, [{ n: 'video-1', o: 'r1', name: 'Machamp', ocp: 1500, ncp: 1600 }]);
  c = makeCtx({ roster: [old] });
  c.commitImport(patch({ recentChanged: { ids: ['video-1', 'r1'] } }));
  ok('an old record seen in this same import is not a candidate', !c.state.lastImport.pairs);
  c = makeCtx({ roster: [mon('r2', 'Gengar', 1000, 90)] });
  c.commitImport(patch());
  ok('no pair: the receipt has no pairs key at all', !('pairs' in c.state.lastImport));
  c = makeCtx({ roster: [old] });
  c.commitImport(patch({ removedIds: ['r1'] }));
  ok('a removed old record is not offered', !c.state.lastImport.pairs);
  c = makeCtx({ roster: [{ ...old, atkIV: 1, defIV: 1, staIV: 1 }] });
  c.commitImport(patch({ ivOverrides: { r1: IV(10, 11, 12) } }));
  eq('the owner overrides count as the old record\'s values', c.state.lastImport.pairs.length, 1);
  c = makeCtx({ roster: [old] });
  c.commitImport(patch({ lastImport: { at: 1, rows: [{ idx: 'video-1', kind: 'updated' }], revert: { 'video-1': { kind: 'update' } } } }));
  ok('a record that was updated, not inserted, is not a new one', !c.state.lastImport.pairs);
})();

// ---- mergePowerUp: retire the old, carry the owner's data, undo ----
function mergeCtx(oldExtra, ovOld, ovNew) {
  const newRec = mon('video-1', 'Machamp', 1600, 125, null, { scanDate: '2026-11-22' }), old = mon('r1', 'Machamp', 1500, 120, null, oldExtra);
  return makeCtx({ roster: [old], addedPokemon: [newRec], ivOverrides: { ...(ovOld ? { r1: ovOld } : {}), ...(ovNew ? { 'video-1': ovNew } : {}) },
    lastImport: { at: 1, rows: [{ idx: 'video-1', kind: 'new', name: 'Machamp', cp: 1600, text: 'x' }], revert: { 'video-1': { kind: 'insert' } }, pairs: [{ n: 'video-1', o: 'r1', name: 'Machamp', ocp: 1500, ncp: 1600 }] } });
}
(function merge() {
  const c = mergeCtx({ favorite: true, catchDate: '2024-05-01' }, { ivMeasured: true, ivManual: true, formReviewed: true, nameReviewed: true, typeReviewed: true, lucky: true, costume: true, noEvolve: true, evoPick: 'Machamp', shiny: true, shinyState: null,
    cp: 1500, hp: 120, level: 20, pendingPowerUps: 2, powerUpsSinceScan: 1 }, { level: 25 });
  const before = JSON.parse(JSON.stringify(c.state));
  c.mergePowerUp('video-1');
  eq('the old record is retired like a transferred one', c.state.removedIds, ['r1']);
  eq('the owner data is carried onto the new record, what the scan measured is kept',
    c.state.ivOverrides['video-1'], { level: 25, ivMeasured: true, ivManual: true, favorite: true, lucky: true, costume: true, noEvolve: true, evoPick: 'Machamp', typeReviewed: true, formReviewed: true, nameReviewed: true, shiny: true, shinyState: null, catchDate: '2024-05-01' });
  ok('CP, HP and the power-up counters of the old record are not carried', !('cp' in c.state.ivOverrides['video-1']) && !('hp' in c.state.ivOverrides['video-1']) && !('pendingPowerUps' in c.state.ivOverrides['video-1']));
  eq('the old record keeps its own override (it is only hidden)', c.state.ivOverrides.r1.ivManual, true);
  eq('the row now reads as merged', c.state.lastImport.pairs[0].done, true);
  ok('the change is pushed to the cloud', c.pushes === 1);
  c.mergePowerUp('video-1');
  eq('Undo brings the old record back', c.state.removedIds, []);
  eq('Undo puts the new record\'s own override back', c.state.ivOverrides['video-1'], { level: 25 });
  eq('Undo leaves the pair offered again', [c.state.lastImport.pairs[0].done, c.state.lastImport.pairs.length], [false, 1]);
  eq('the lists are back as they were', JSON.stringify([c.state.roster, c.state.addedPokemon, c.state.ivOverrides, c.state.removedIds]), JSON.stringify([before.roster, before.addedPokemon, before.ivOverrides, before.removedIds]));
  const d = mergeCtx(null, null, null);
  d.mergePowerUp('video-1');
  eq('nothing to carry: the new record gets an empty override, the old is retired', [d.state.ivOverrides['video-1'], d.state.removedIds], [{}, ['r1']]);
  d.mergePowerUp('video-1');
  ok('Undo removes the empty override again', !('video-1' in d.state.ivOverrides));
  const e = mergeCtx(null, { shiny: true, shinyState: 'suspected', favorite: false, evoPick: '' }, null);
  e.mergePowerUp('video-1');
  eq('a suspected shiny and false or empty values are not carried', e.state.ivOverrides['video-1'], {});
  const f = mergeCtx({ favorite: false }, null, { favorite: true, lucky: true });
  f.mergePowerUp('video-1');
  eq('the new record keeps its own flags', f.state.ivOverrides['video-1'], { favorite: true, lucky: true });
  const g = mergeCtx();
  g.mergePowerUp('nope');
  ok('an unknown row changes nothing', g.state.removedIds.length === 0 && g.pushes === 0);
  const h = mergeCtx(); h.state.removedIds = ['x9'];
  h.mergePowerUp('video-1'); eq('other removed ids are kept', h.state.removedIds, ['x9', 'r1']);
  h.mergePowerUp('video-1'); eq('and kept on undo', h.state.removedIds, ['x9']);
})();

// ---- revertImportRow with a merged pair ----
(function revert() {
  const c = mergeCtx({}, { favorite: true }, null);
  c.mergePowerUp('video-1');
  c.revertImportRow('video-1');
  eq('undoing the new record after a merge brings the old record back', c.state.removedIds, []);
  eq('and the new record is gone', c.state.addedPokemon, []);
  ok('and the receipt is cleared', c.state.lastImport === null);
  const two = () => { const x = mergeCtx({}, null, null); x.state.lastImport.rows.push({ idx: 'video-2', kind: 'new' }); x.state.lastImport.revert['video-2'] = { kind: 'insert' }; x.state.addedPokemon.push(mon('video-2', 'Gengar', 900, 80)); return x; };
  const d = two();
  d.revertImportRow('video-1');
  ok('undoing a new record that was not merged drops its pair and keeps the rest', d.state.lastImport.pairs.length === 0 && d.state.lastImport.rows.length === 1 && d.state.removedIds.length === 0);
  const e = two();
  e.revertImportRow('video-2');
  eq('undoing another row leaves the pair', e.state.lastImport.pairs.length, 1);
})();

t.exit(t.pass + ' passed, ' + t.fail + ' failed');
