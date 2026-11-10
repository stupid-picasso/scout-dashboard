#!/usr/bin/env node
/**
 * test_rank_reference.js — checks pokemon-mechanics.js league ranks against an INDEPENDENT brute-force reference.
 *
 * The reference works from the definition, with none of the engine's shortcuts (no bisection, no caches, no shared
 * helpers): for each of the 4096 spreads, walk every level upward and keep the last one whose CP fits the cap, take
 * the stat product (Atk x Def x floor HP, shadows with +20% Atk / -1/6 Def), and rank. Rank % is product / best
 * product. Only the CP multiplier table is shared (it is game data, read from the engine's own context).
 * It then compares rankPctForLeague, dittoRankOf and spread ties across a spread of species, leagues, shadows and IVs.
 * Pinned anchors from Dittobase's PvP IV checker are listed at the bottom.
 *
 *   node scripts/test_rank_reference.js
 */
const vm = require('vm'), fs = require('fs'), path = require('path');
const code = fs.readFileSync(path.join(__dirname, '..', 'pokemon-mechanics.js'), 'utf8');
const ctx = { window: { dispatchEvent: () => {} }, Event: function () {}, console };
vm.createContext(ctx); vm.runInContext(code, ctx);
const m = ctx.window.PokemonMechanics;
const CPM = vm.runInContext('CPM', ctx);
const LEVELS = Object.keys(CPM).map(Number).filter(l => l <= 50).sort((a, b) => a - b);
const CAPS = { great: 1500, ultra: 2500, little: 500, master: Infinity };

function reference(base, leagueKey, shadow) {
  const cap = CAPS[leagueKey], rows = [];
  const sa = shadow ? 1.2 : 1, sd = shadow ? 5 / 6 : 1;
  for (let a = 0; a <= 15; a++) for (let d = 0; d <= 15; d++) for (let s = 0; s <= 15; s++) {
    let lvl = null;
    for (const L of LEVELS) {
      const c = CPM[L], cp = Math.max(10, Math.floor((base[0] + a) * Math.sqrt(base[1] + d) * Math.sqrt(base[2] + s) * c * c / 10));
      if (cp <= cap) lvl = L; else break;
    }
    if (lvl == null) { rows.push({ ivs: [a, d, s], product: 0 }); continue; }
    const c = CPM[lvl];
    rows.push({ ivs: [a, d, s], lvl, product: (base[0] + a) * sa * c * (base[1] + d) * sd * c * Math.max(10, Math.floor((base[2] + s) * c)) });
  }
  const best = Math.max(...rows.map(r => r.product));
  return { rows, best, of: ivs => { const r = rows.find(x => x.ivs[0] === ivs[0] && x.ivs[1] === ivs[1] && x.ivs[2] === ivs[2]); return { pct: r.product / best * 100, better: rows.filter(x => x.product > r.product).length }; } };
}

let pass = 0, fail = 0; const bad = [];
const ok = (name, cond, detail) => { if (cond) pass++; else { fail++; bad.push('  ' + name + (detail ? '\n    ' + detail : '')); } };

// Seeded spreads so a failure is reproducible.
let seed = 12345; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const dexes = Object.keys(m.BASE_STATS).map(Number).filter(d => Array.isArray(m.BASE_STATS[d]));
const pick = [1, 3, 25, 66, 68, 94, 130, 143, 150, 184, 227, 282, 305, 373, 376, 445, 553, 635, 663, 681, 778, 809, 887, 981];
while (pick.length < 40) { const d = dexes[rnd(dexes.length)]; if (pick.indexOf(d) < 0) pick.push(d); }
let compared = 0, worst = 0;
for (const dex of pick) {
  const base = m.BASE_STATS[dex]; if (!base) continue;
  for (const lk of ['great', 'ultra', 'little', 'master']) for (const sh of [false, true]) {
    const ref = reference(base, lk, sh);
    if (!(ref.best > 0)) continue;
    const spreads = [[0, 0, 0], [15, 15, 15], [0, 15, 15], [15, 0, 0], [1, 14, 15]];
    for (let i = 0; i < 7; i++) spreads.push([rnd(16), rnd(16), rnd(16)]);
    for (const iv of spreads) {
      const r = ref.of(iv), e = m.rankPctForLeague(base, iv, lk, sh), dr = m.dittoRankOf(base, iv, lk, sh);
      compared++;
      if (e != null) worst = Math.max(worst, Math.abs(e - r.pct));
      const tag = dex + ' ' + lk + (sh ? ' shadow' : '') + ' ' + iv.join('/');
      ok('rankPct ' + tag, e != null && Math.abs(e - r.pct) < 0.001, 'engine ' + e + ' reference ' + r.pct);
      ok('ditto pct ' + tag, dr && Math.abs(dr.pct - r.pct) < 0.001, 'ditto ' + (dr && dr.pct) + ' reference ' + r.pct);
      // rank position: tied products share the better rank in the reference; the engine breaks ties, so it may sit lower by the tie size only
      const target = r.pct * ref.best / 100, ties = ref.rows.filter(x => Math.abs(x.product - target) <= 1e-9 * ref.best).length;
      ok('ditto rank ' + tag, dr && dr.rank >= r.better + 1 - ties && dr.rank <= r.better + ties + 1, 'ditto rank ' + (dr && dr.rank) + ' reference better-than ' + r.better + ' ties ' + ties);
    }
  }
}
console.log('compared ' + compared + ' (species x league x shadow x spread); worst difference ' + worst.toExponential(2) + ' percentage points');

// Anchor: Dittobase PvP IV checker, Mimikyu 11/13/13 is 95.3% in Great League (cited by the trainer).
const mim = m.BASE_STATS[778];
if (mim) { const e = m.rankPctForLeague(mim, [11, 13, 13], 'great', false); ok('Dittobase anchor: Mimikyu 11/13/13 Great = 95.3%', Math.abs(e - 95.3) < 0.1, 'engine ' + e); }

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) { console.log(bad.slice(0, +(process.env.SHOW||20)).join("\n")); process.exit(1); }
