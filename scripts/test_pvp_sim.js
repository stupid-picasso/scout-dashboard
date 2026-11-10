#!/usr/bin/env node
/**
 * test_pvp_sim.js — how often does the 1v1 simulator in pokemon-mechanics.js agree with PvPoke's own matchup ratings?
 *
 * PvPoke's stored tables list, for each ranked species, its best matchups (rating over 500 = a win) and worst (under 500 =
 * a loss). Each listed pair that both sides of exist in the simulator pool is fought at 0v0, 1v1 and 2v2 shields and the
 * winner compared with PvPoke's. Prints the agreement per scenario and per league and fails if the best scenario falls
 * under MIN_AGREE. Not a ground truth for every matchup (the lists are the extremes, which is the easy end), but it
 * catches a broken simulator and tells you how far to trust it.
 *
 *   node scripts/test_pvp_sim.js [--verbose]
 */
const vm = require('vm'), fs = require('fs'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'pokemon-mechanics.js'), 'utf8');
const ctx = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const m = ctx.window.PokemonMechanics;
const MIN_AGREE = Number(process.env.MIN_AGREE || 0.70);
const verbose = process.argv.indexOf('--verbose') >= 0;

let best = 0;
const report = {};
for (const lk of ['great', 'ultra']) {
  const pool = m.pvpSimPool(lk), by = new Map(pool.map(f => [f.id, f]));
  for (const sh of [0, 1, 2]) {
    let n = 0, ok = 0; const misses = [];
    for (const f of pool) {
      const mu = m.pvpMatchupsFor(f.id.replace(/_shadow$/, ''), /_shadow$/.test(f.id), lk, '');
      if (!mu) continue;
      for (const t of [...mu.matchups, ...mu.counters]) {
        const o = by.get(t.id); if (!o || t.rating === 500) continue;
        const r = m.pvpSimulate(f, o, sh, sh);
        const win = r.winner === 1 ? true : r.winner === 2 ? false : null;
        n++;
        const want = t.rating > 500;
        if (win === want) ok++; else if (misses.length < 12) misses.push(f.id + ' vs ' + o.id + ' PvPoke ' + t.rating + ' sim ' + r.rating);
      }
    }
    report[lk + ' ' + sh + 'v' + sh] = { n, agree: n ? ok / n : 0, misses };
    best = Math.max(best, n ? ok / n : 0);
  }
}
Object.keys(report).forEach(k => { const r = report[k]; console.log(k.padEnd(10) + ' compared ' + String(r.n).padStart(5) + '  agree ' + (r.agree * 100).toFixed(1) + '%'); if (verbose) r.misses.forEach(x => console.log('     ' + x)); });
console.log('best scenario ' + (best * 100).toFixed(1) + '% (minimum ' + (MIN_AGREE * 100) + '%)');
process.exit(best >= MIN_AGREE ? 0 : 1);
