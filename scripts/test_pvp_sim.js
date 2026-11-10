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
const MIN_AGREE = Number(process.env.MIN_AGREE || 0.88);   // regression floor for the combined 1v1 figure; the figure at the time of writing is about 90%
const verbose = process.argv.indexOf('--verbose') >= 0;

const report = {}, deci = { n: 0, ok: 0 };
let comb1 = { n: 0, ok: 0 };
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
        const want = t.rating > 500, good = win === want;
        if (good) ok++; else if (misses.length < 12) misses.push(f.id + ' vs ' + o.id + ' PvPoke ' + t.rating + ' sim ' + r.rating);
        if (sh === 1) { comb1.n++; if (good) comb1.ok++; if (Math.abs(t.rating - 500) >= 100) { deci.n++; if (good) deci.ok++; } }
      }
    }
    report[lk + ' ' + sh + 'v' + sh] = { n, agree: n ? ok / n : 0, misses };
  }
}
Object.keys(report).forEach(k => { const r = report[k]; console.log(k.padEnd(10) + ' compared ' + String(r.n).padStart(5) + '  agree ' + (r.agree * 100).toFixed(1) + '%'); if (verbose) r.misses.forEach(x => console.log('     ' + x)); });
const comb = comb1.n ? comb1.ok / comb1.n : 0;
console.log('combined 1 shield each (the scenario PvPoke lists matchups from): ' + (comb * 100).toFixed(1) + '% of ' + comb1.n + ' (minimum ' + (MIN_AGREE * 100) + '%)');
console.log('decisive matchups only (rating 100+ from even): ' + (deci.n ? deci.ok / deci.n * 100 : 0).toFixed(1) + '% of ' + deci.n);
process.exit(comb >= MIN_AGREE ? 0 : 1);
