// Adversarial property test: no valuable Pokemon may appear in any transfer-suggesting output.
// Run: PW_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node fuzz_keep.js [seeds=1,2,3] [rostersPerSeed=4] [maxMinutes=8]
const vm = require('vm'), fs = require('fs');
const REPO = '/home/user/scout-dashboard';
const { session, close } = require(REPO + '/scripts/qa/qa_lib.js');

// ---- mechanics data in node (for generation + ground truth), loaded from the repo file, read-only
const W = { dispatchEvent() {} }; W.window = W; W.Event = function () {};
vm.runInContext(fs.readFileSync(REPO + '/pokemon-mechanics.js', 'utf8'), vm.createContext(W));
const M = W.PokemonMechanics;

const ARGS = process.argv.slice(2);
const SEEDS = (ARGS[0] || '1,2,3').split(',').map(Number);
const PER = +(ARGS[1] || 4), MAXMIN = +(ARGS[2] || 8);
const T0 = Date.now();

function prng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- species pools
const nameOf = d => M.DEX_NAMES[d];
const allDex = Object.keys(M.BASE_STATS).map(Number).filter(d => nameOf(d));
const dexOfName = n => M.resolveDexByName(n);
const evolvers = Object.keys(M.REAL_EVOLUTION_TABLE).filter(k => !k.includes('|')).map(dexOfName).filter(d => d && M.BASE_STATS[d]);
const legends = allDex.filter(d => M.speciesClassFor(d));
const megas = Object.keys(M.MEGA_EVOLUTION_COSTS).map(dexOfName).filter(d => d && M.BASE_STATS[d]);
const tiered = [...Object.keys(M.PVP_TIER_GREAT), ...Object.keys(M.PVP_TIER_ULTRA)].map(dexOfName).filter(d => d && M.BASE_STATS[d]);
const FORMS = {}; Object.keys(M.BASE_STATS_BY_FORM).forEach(k => { const [d, ...f] = k.split('_'); const f2 = f.join('_'); if (/^(alola|galarian|hisuian|paldea|normal)$/.test(f2)) (FORMS[d] = FORMS[d] || []).push(f2); });
const formDex = Object.keys(FORMS).map(Number).filter(d => M.BASE_STATS[d]);
const POOLS = [[evolvers, 3], [legends, 0.8], [megas, 1], [tiered, 1], [formDex, 1], [allDex, 4]];

function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
function pickDex(r) { let tot = POOLS.reduce((a, p) => a + p[1], 0), x = r() * tot; for (const [pool, w] of POOLS) { if ((x -= w) < 0) return pick(r, pool); } return pick(r, allDex); }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function genRoster(r, n) {
  const out = []; let idx = Math.floor(r() * 1e6) * 10 + 1000;
  const nSpecies = Math.max(8, Math.floor(n / 9));
  while (out.length < n) {
    const dex = pickDex(r), name = nameOf(dex);
    let form = ''; const fl = FORMS[dex];
    if (fl && r() < 0.6) form = cap(pick(r, fl) === 'alola' ? 'alola' : pick(r, fl)); // Alola/Galarian/Hisuian/Paldea/Normal
    if (form === 'Normal' && r() < 0.5) form = '';
    const legendary = !!M.speciesClassFor(dex);
    let copies = r() < 0.12 ? 1 : 2 + Math.floor(-Math.log(1 - r()) * (legendary ? 1.5 : 4));
    copies = Math.min(copies, 25);
    for (let c = 0; c < copies && out.length < n; c++) out.push(genMon(r, dex, name, form, ++idx));
    if (out.length > nSpecies * 40) break;
  }
  return out;
}

function baseFor(dex, form) { return (form && M.BASE_STATS_BY_FORM[dex + '_' + String(form).toLowerCase()]) || M.BASE_STATS[dex]; }

function genMon(r, dex, name, form, idx) {
  const base = baseFor(dex, form);
  const kind = r();
  let a, d, s;
  if (kind < 0.55) { a = 5 + Math.floor(r() * 6); d = Math.floor(r() * 9); s = Math.floor(r() * 9); }            // junk
  else if (kind < 0.65) { a = Math.floor(r() * 4); d = 11 + Math.floor(r() * 5); s = 11 + Math.floor(r() * 5); } // PvP spread
  else if (kind < 0.69) { a = 13 + Math.floor(r() * 3); d = 13 + Math.floor(r() * 3); s = 13 + Math.floor(r() * 3); } // hundo-ish
  else if (kind < 0.71) { a = 15; d = 15; s = 14 + Math.floor(r() * 2); }
  else { a = Math.floor(r() * 16); d = Math.floor(r() * 16); s = Math.floor(r() * 16); }
  const measured = r() < 0.94;
  const noIv = !measured && r() < 0.25;
  // level: sometimes constrained so CP lands under 500 / 1500 / 2500
  let level, lr = r(); const cpmLevels = Object.keys(M.CPM).map(Number).filter(l => l >= 1 && l <= 50).sort((x, y) => x - y);
  if (lr < 0.25) level = pick(r, cpmLevels.filter(l => l <= 15)); else if (lr < 0.5) level = pick(r, cpmLevels.filter(l => l >= 15 && l <= 30)); else level = pick(r, cpmLevels);
  if (r() < 0.4) { const capCp = pick(r, [500, 1500, 2500]); const ok = cpmLevels.filter(l => M.cpFor(base, [a, d, s], l) <= capCp); if (ok.length) level = ok[ok.length - 1]; }
  const cp = M.cpFor(base, [a, d, s], level), hp = M.hpFor(base, s, level);
  const sp = r();
  const shadowPurified = sp < 0.025 ? '1' : sp < 0.03 ? 1 : sp < 0.045 ? '2' : sp < 0.05 ? 2 : sp < 0.5 ? '0' : '';
  const p = {
    idx, name, dex, form, cp, hp, atkIV: a, defIV: d, staIV: s, ivAvg: Math.round((a + d + s) / 45 * 1000) / 10,
    lvlMin: level, lvlMax: level, ivMeasured: measured, lucky: r() < 0.02, favorite: r() < 0.015, shiny: r() < 0.015, shadowPurified,
    quickMove: r() < 0.8 ? 'Mud Shot' : '', chargeMove: r() < 0.8 ? 'Surf' : '', weight: (Math.round(r() * 300) / 10 + 0.5) + 'kg'
  };
  if (!measured) { p.ivSolved = r() < 0.7; if (r() < 0.3) p.ivRange = { atk: [0, 15], def: [0, 15], sta: [0, 15] }; }
  if (noIv) { p.atkIV = p.defIV = p.staIV = p.ivAvg = null; p.ivSolved = false; p.cp = cp; }
  // height
  const probe = M.sizeInfoFor(dex, form, 1);
  if (probe) { const hr = r(); const ratio = hr < 0.55 ? 0.92 + r() * 0.16 : hr < 0.75 ? 0.6 + r() * 0.3 : 1.08 + r() * 1.2; p.height = (Math.round(probe.baseHeight * ratio * 100) / 100).toFixed(2) + 'm'; }
  else p.height = (0.3 + r() * 2).toFixed(2) + 'm';
  // importer-style league fields: OWN species ranks (evolution overlay is the app's job)
  if (!noIv && r() > 0.05) {
    const iv = [a, d, s], sh = p.shadowPurified === '1' || p.shadowPurified === 1;
    const rk = lg => M.rankPctForLeague(base, iv, lg, sh);
    p.great = { rankPct: rk('great'), evolvesTo: name };
    p.ultra = { rankPct: rk('ultra'), evolvesTo: name };
    p.little = { rankPct: cp <= 500 ? rk('little') : null, evolvesTo: name };
    if (r() < 0.1) p.great.rankPct = null;
  }
  return p;
}

// ---- INDEPENDENT ground truth (first principles over the spec, not the app's keepReasons)
const isSh = p => p.shadowPurified === '1' || p.shadowPurified === 1;
const isPur = p => p.shadowPurified === '2' || p.shadowPurified === 2;
function chainOf(p) { const out = [p.name]; let cur = p.name; for (let i = 0; i < 6; i++) { const e = M.evolutionInfoFor(cur, p.form); if (!e || !e.to || out.includes(e.to)) break; out.push(e.to); cur = e.to; } return out; }
function truth(p, all) {
  const R = []; const add = (k, soft, extra) => R.push({ k, soft: !!soft, ...extra });
  if (p.lucky) add('LUCKY'); if (p.favorite) add('FAVORITE'); if (p.shiny) add('SHINY');
  if (isPur(p)) add('PURIFIED');
  const grp = all.filter(q => q.dex === p.dex && (q.form || '') === (p.form || ''));
  const ivp = q => (Number.isFinite(q.atkIV) && Number.isFinite(q.defIV) && Number.isFinite(q.staIV)) ? (q.atkIV + q.defIV + q.staIV) / 45 * 100 : 0;
  const mine = ivp(p);
  if (M.speciesClassFor(p.dex)) {
    const strictlyBetter = grp.filter(q => ivp(q) > mine).length;
    const atLeast = grp.filter(q => q !== p && ivp(q) >= mine).length;
    if (strictlyBetter < 2) add('LEGENDARY_TOP2', atLeast >= 2, { tieOnly: atLeast >= 2 });
  }
  const measuredIv = Number.isFinite(p.atkIV) && Number.isFinite(p.defIV) && Number.isFinite(p.staIV);
  if (mine >= 90 && measuredIv) add('IV90');
  if (!p.ivMeasured || !measuredIv) add('UNMEASURED');
  if (isSh(p) && mine >= 80 && Number.isFinite(p.atkIV) && Number.isFinite(p.defIV) && Number.isFinite(p.staIV)) add('SHADOW_IV80');
  if (p.ivMeasured && p.atkIV === 0 && p.defIV === 0 && p.staIV === 0) add('NONDO');
  const si = p.height ? M.sizeInfoFor(p.dex, p.form, p.height) : null;
  if (si && si.valid && (si.cls === 'XXL' || si.cls === 'XXS')) add('SIZE_' + si.cls);
  if (measuredIv) {
    const iv = [p.atkIV, p.defIV, p.staIV], sh = isSh(p);
    for (const lg of ['great', 'ultra']) {
      const lcap = M.LEAGUE_CAPS[lg]; const capOk = !Number.isFinite(p.cp) || p.cp <= lcap;
      for (const nm of chainOf(p)) {
        const dx = nm === p.name ? p.dex : dexOfName(nm); if (!dx) continue;
        const b = baseFor(dx, p.form); if (!b) continue;
        const rk = M.rankPctForLeague(b, iv, lg, sh); const t = M.pvpTierFor(nm, sh, lg);
        // only the best copy of the species (same shadow status) per league is owed protection; equal ranks all stay
        const better = grp.some(q => q !== p && isSh(q) === sh && q.ivMeasured && [q.atkIV, q.defIV, q.staIV].every(Number.isFinite) && (!Number.isFinite(q.cp) || q.cp <= lcap)
          && chainOf(q).some(n2 => { const d2 = n2 === q.name ? q.dex : dexOfName(n2); const b2 = d2 && baseFor(d2, q.form); const t2 = d2 && M.pvpTierFor(n2, sh, lg); return b2 && t2 && 'SAB'.includes(t2.tier) && M.rankPctForLeague(b2, [q.atkIV, q.defIV, q.staIV], lg, sh) > rk + 1e-9; }));
        if (rk >= 90 && t && 'SAB'.includes(t.tier) && !better) add(lg.toUpperCase() + '_RANK90_TIER_SAB', !capOk, { via: nm, rank: +rk.toFixed(1), tier: t.tier });
      }
    }
    if (Number.isFinite(p.cp) && p.cp <= 500 && chainOf(p).length > 1) {   // Little Cup needs a Pokemon that can still evolve
      const b = baseFor(p.dex, p.form); const rk = M.rankPctForLeague(b, iv, 'little', sh); const betterL = grp.some(q => q !== p && isSh(q) === sh && q.ivMeasured && [q.atkIV, q.defIV, q.staIV].every(Number.isFinite) && q.cp <= 500 && (b2 => b2 && M.rankPctForLeague(b2, [q.atkIV, q.defIV, q.staIV], 'little', sh) > rk + 1e-9)(baseFor(q.dex, q.form))); if (rk >= 90 && !betterL) add('LITTLE_RANK90_CP<=500', false, { rank: +rk.toFixed(1) }); }
    const mega = (M.MEGA_EVOLUTION_COSTS[String(p.name).toLowerCase()] || M.megaFormsFor(p.name) || []).length > 0;
    if (mega && mine >= 80) add('MEGA_IV80');
  }
  return R;
}

// Root-cause bucket for a violation (heuristic, from effective-record diagnostics)
function classify(v) {
  const p = v.pokemon, d = v.diag || {}, ks = v.violates.join(' ');
  if (/^UNMEASURED/.test(v.violates[0]) || v.violates.some(x => x.startsWith('UNMEASURED'))) return 'UNMEASURED_NOT_FLAGGED (ivMeasured falsy, IVs present, ivSolved falsy)';
  if (/RANK90|LITTLE/.test(ks) && !v.recalc && !p.great && !p.ultra) return 'NO_LEAGUE_DATA (importer gave no great/ultra and recalculateAllRanks was not run)';
  if (/RANK90/.test(ks)) {
    // does the app's OWN effective record already hold a qualifying (rank>=90, tier S/A/B) league entry? then pvpBest/isPvpWorthy hid it
    const qual = ['great', 'ultra'].some(lg => { const e = d[lg]; if (!e || !(e.rankPct >= 90)) return false; const t = M.pvpTierFor(e.evolvesTo || p.name, isSh(p), lg); return t && 'SAB'.includes(t.tier) && (!Number.isFinite(p.cp) || p.cp <= M.LEAGUE_CAPS[lg]); });
    if (qual) return 'PVPBEST_PICKS_TIER_FIRST (a qualifying league entry exists in the effective record but pvpBest returns the higher-TIER, lower-rank league, so isPvpWorthy is false)';
    return 'EVO_OVERLAY_TIER (overlay keeps only the best-RANK evolution and judges tier on that form; another stage of the same chain, e.g. the own species, has rank>=90 + tier S/A/B but is discarded)';
  }
  return 'OTHER';
}

// ---- in-page collection of every transfer-suggesting output
function collectInPage(sampleStep) {
  let L = null;
  for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.buildOptimizePlan) { L = f.stateNode.logic; break; } if (L) break; }
  const t0 = performance.now(); const timing = {};
  const roster = L.effectiveRosterForMatch();
  const o = { rosterIdx: roster.map(p => p.idx), errors: [] };
  const tryit = (name, fn) => { const t = performance.now(); try { fn(); } catch (e) { o.errors.push(name + ': ' + e.message); } timing[name] = Math.round(performance.now() - t); };
  tryit('cutSafeSummary', () => { const s = L.cutSafeSummary(roster, roster.length); o.cutShow = s.show.map(r => r.p.idx); o.cutSafeAll = s.safe.length; o.cutProtected = s.protectedCount; });
  tryit('cutSafeSummary_small', () => { const s = L.cutSafeSummary(roster, Math.max(1, Math.floor(roster.length * 0.2))); o.cutShowSmall = s.show.map(r => r.p.idx); });
  tryit('triageQueue', () => { o.triage = L.triageQueue().map(t => t.p.idx); });
  tryit('dominatedDuplicates', () => { o.dominated = L.dominatedDuplicates(roster).map(x => x.loser.idx); });
  tryit('buildOptimizePlan', () => {
    const base = L.state, done = []; o.optimize = [];
    try {
      for (let i = 0; i < 400; i++) {
        L.state = Object.assign({}, base, { completedIds: done.slice() });
        const ts = L.buildOptimizePlan(roster).transferSafe; if (!ts.length) break;
        ts.forEach(p => { o.optimize.push(p.idx); done.push(p.idx); });
      }
    } finally { L.state = base; }
  });
  tryit('verdictFor', () => {
    o.verdictTransfer = []; o.verdictChecked = 0;
    const pool = o.triage.slice(0, 40); roster.forEach((p, i) => { if (i % sampleStep === 0) pool.push(p.idx); });
    for (const id of new Set(pool)) { const p = roster.find(q => q.idx === id); const v = L.verdictFor(p); o.verdictChecked++; if (v && v.verdict === 'TRANSFER') o.verdictTransfer.push(id); }
  });
  const listed = new Set([].concat(o.cutShow || [], o.cutShowSmall || [], o.triage || [], o.dominated || [], o.optimize || [], o.verdictTransfer || []));
  o.diag = {};
  roster.forEach(p => { if (!listed.has(p.idx)) return; let pb = null; try { pb = L.pvpBest(p); } catch (e) {} o.diag[p.idx] = { great: p.great, ultra: p.ultra, little: p.little, needsAppraisal: L.needsAppraisal(p), keep: L.keepReasons(p), pvpBest: pb && { league: pb.league, rank: pb.rank, tier: pb.tier }, pvpBestIsWorthy: L.isPvpWorthy(p) }; });
  o.timing = timing; o.totalMs = Math.round(performance.now() - t0);
  return o;
}

(async () => {
  const stats = { rosters: 0, pokemon: 0, reasonCounts: {}, reasonOnlyCounts: {}, reasonWithheld: {}, outputs: {}, violations: [], errors: [], softViolations: [] };
  const OUTS = ['cutShow', 'cutShowSmall', 'triage', 'dominated', 'optimize', 'verdictTransfer'];
  OUTS.forEach(k => stats.outputs[k] = { listed: 0, rosterTotal: 0 });
  let safeSum = 0, safeAvailSum = 0;
  const s = await session({ feed: false });
  await s.load(REPO + '/scripts/fixtures/smoke.csv');
  const seenViol = new Set();
  outer: for (const seed of SEEDS) {
    const r = prng(seed * 7919 + 13);
    for (let k = 0; k < PER; k++) {
      if ((Date.now() - T0) / 60000 > MAXMIN) { console.log('time budget reached'); break outer; }
      const n = 250 + Math.floor(r() * 650);
      const roster = genRoster(r, n); const recalc = r() < 0.7;
      await s.set({ addedPokemon: roster, roster: [], removedIds: [], ivOverrides: {}, completedIds: [], transferQueue: [], triageKeep: {} });
      if (recalc) { await s.call('recalculateAllRanks'); await s.page.waitForFunction(() => true); await s.page.waitForTimeout(600); for (let i = 0; i < 40 && (await s.state()).recalcBusy; i++) await s.page.waitForTimeout(200); }
      const eff = await s.page.evaluate(() => { for (const e of document.querySelectorAll('*')) { const k = Object.keys(e).find(x => x.startsWith('__reactFiber')); if (!k) continue; for (let f = e[k]; f; f = f.return) if (f.stateNode && f.stateNode.logic && f.stateNode.logic.effectiveRosterForMatch) return f.stateNode.logic.effectiveRosterForMatch().length; } return -1; });
      const o = await s.page.evaluate(collectInPage, Math.max(1, Math.floor(roster.length / 25)));
      stats.rosters++; stats.pokemon += roster.length;
      o.errors.forEach(e => stats.errors.push(`seed ${seed} roster ${k}: ${e}`));
      if (eff !== roster.length) stats.errors.push(`effective roster ${eff} != generated ${roster.length}`);
      // ground truth on the same Pokemon (with the evolution overlay NOT applied: it is derived from first principles)
      const byIdx = new Map(roster.map(p => [p.idx, p]));
      const T = new Map(roster.map(p => [p.idx, truth(p, roster)]));
      const hard = idx => T.get(idx).filter(x => !x.soft);
      let valuable = 0;
      for (const p of roster) {
        const t = T.get(p.idx); const names = [...new Set(t.map(x => x.k))];
        if (t.some(x => !x.soft)) valuable++;
        names.forEach(kk => { stats.reasonCounts[kk] = (stats.reasonCounts[kk] || 0) + 1; });
        const hk = [...new Set(t.filter(x => !x.soft).map(x => x.k))];
        if (hk.length === 1) stats.reasonOnlyCounts[hk[0]] = (stats.reasonOnlyCounts[hk[0]] || 0) + 1;
        const listedAny = OUTS.some(kk => (o[kk] || []).includes(p.idx));
        if (!listedAny) names.forEach(kk => { stats.reasonWithheld[kk] = (stats.reasonWithheld[kk] || 0) + 1; });
      }
      OUTS.forEach(kk => { stats.outputs[kk].listed += (o[kk] || []).length; stats.outputs[kk].rosterTotal += roster.length; });
      safeSum += o.cutSafeAll; safeAvailSum += roster.length;
      const hardNonValuable = roster.length - valuable;
      stats.rosterHardValuable = (stats.rosterHardValuable || 0) + valuable;
      stats.rosterNotValuable = (stats.rosterNotValuable || 0) + hardNonValuable;
      for (const out of OUTS) for (const idx of new Set(o[out] || [])) {
        const t = T.get(idx); if (!t) { stats.errors.push('unknown idx ' + idx + ' in ' + out); continue; }
        if (!t.length) continue;
        const h = t.filter(x => !x.soft), tie = h.length && h.every(x => x.tieOnly);
        const key = out + ':' + idx + ':' + seed + ':' + k; if (seenViol.has(key)) continue; seenViol.add(key);
        const rec = { seed, roster: k, recalc, output: out, severity: h.length ? (tie ? 'tie-only' : 'HARD') : 'soft (CP over league cap)', violates: t.map(x => x.k + (x.soft ? '(soft)' : '') + (x.via ? ` via ${x.via} ${x.rank}% tier ${x.tier}` : '')), pokemon: byIdx.get(idx), diag: o.diag[idx], group: roster.filter(q => q.dex === byIdx.get(idx).dex) }; rec.cause = classify(rec);
        (h.length && !tie ? stats.violations : stats.softViolations).push(rec);
      }
      console.log(`seed ${seed} roster ${k} n=${roster.length} recalc=${recalc}: cutSafe=${o.cutSafeAll} (${(100 * o.cutSafeAll / roster.length).toFixed(1)}%) triage=${o.triage.length} dominated=${o.dominated.length} optimizeAll=${o.optimize.length} verdictTransfer=${o.verdictTransfer.length}/${o.verdictChecked} ms=${o.totalMs} hardViol=${stats.violations.length}`);
    }
  }
  await s.close(); await close();
  const dedup = {};
  stats.violations.forEach(v => { const key = v.cause + ' @ ' + v.output; (dedup[key] = dedup[key] || []).push(v); });
  const uniq = {}; stats.violations.forEach(v => { (uniq[v.cause] = uniq[v.cause] || new Set()).add(v.pokemon.idx); });
  console.log('\n===== SUMMARY =====');
  console.log('rosters', stats.rosters, 'pokemon', stats.pokemon, 'safe fraction (cutSafeSummary.safe / roster):', (safeSum / safeAvailSum).toFixed(3), '; truth-valuable fraction:', (stats.rosterHardValuable / stats.pokemon).toFixed(3));
  console.log('outputs listed / roster total:'); Object.entries(stats.outputs).forEach(([k, v]) => console.log('  ', k, v.listed, '/', v.rosterTotal));
  console.log('ground-truth reason counts (Pokemon having reason | having ONLY that hard reason | withheld from every output):');
  Object.keys(stats.reasonCounts).sort().forEach(k => console.log('  ', k.padEnd(34), String(stats.reasonCounts[k]).padStart(6), String(stats.reasonOnlyCounts[k] || 0).padStart(6), String(stats.reasonWithheld[k] || 0).padStart(6)));
  console.log('HARD violations:', stats.violations.length, ' soft/tie violations:', stats.softViolations.length, ' errors:', stats.errors.length);
  stats.errors.slice(0, 10).forEach(e => console.log('ERR', e));
  console.log('distinct violating Pokemon by root cause:'); Object.entries(uniq).forEach(([k, v]) => console.log('  ', v.size, k)); console.log('violation rows by cause @ output:'); Object.entries(dedup).forEach(([k, v]) => console.log('  ', v.length, k));
  const soft = {}; stats.softViolations.forEach(v => { const key = v.severity + ' ' + v.violates.join('|') + '@' + v.output; (soft[key] = soft[key] || []).push(v); });
  const sc = {}; stats.softViolations.forEach(v => { sc[v.output] = (sc[v.output] || 0) + 1; }); console.log('soft (CP-over-cap / tie-only) violations by output:', JSON.stringify(sc));
  const outFile = '/tmp/fuzz_keep_result.json';
  fs.writeFileSync(outFile, JSON.stringify({ seeds: SEEDS, violations: stats.violations.slice(0, 200), softViolations: stats.softViolations.slice(0, 100), stats: { ...stats, violations: undefined, softViolations: undefined } }, null, 1));
  console.log('details ->', outFile);
  process.exit(stats.violations.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
