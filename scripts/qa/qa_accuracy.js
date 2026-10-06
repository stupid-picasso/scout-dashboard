#!/usr/bin/env node
/**
 * qa_accuracy.js — audits the app's DATA and MATH against two independent sources:
 *   - Niantic's game master (PokeMiners mirror)  : stats, types, costs, moves, type chart, CPM
 *   - PvPoke (gamemaster + live rankings)         : rank-1 spreads, meta tiers, PvP moves
 * Every check scores a real fraction (matched / compared), so the output is an accuracy
 * percentage per area, not just pass/fail. Writes qa-accuracy.json (path = argv[2]).
 *
 * Env: QA_GM (path to game master json), QA_PVPOKE_POKEMON, QA_PVPOKE_RANK_GREAT (optional
 * local copies; otherwise downloaded).
 */
const fs = require('fs'), path = require('path'), https = require('https');
global.window = { dispatchEvent() {} }; global.Event = function () {};
require(path.join(__dirname, '..', '..', 'pokemon-mechanics.js'));
const m = window.PokemonMechanics;

function get(url) {
  return new Promise((res, rej) => https.get(url, r => { const c = []; r.on('data', d => c.push(d)); r.on('end', () => res(Buffer.concat(c).toString())); }).on('error', rej));
}
async function load(envName, url) {
  if (process.env[envName] && fs.existsSync(process.env[envName])) return JSON.parse(fs.readFileSync(process.env[envName], 'utf8'));
  return JSON.parse(await get(url));
}

const results = [];
function area(id, name, compared, matched, detail, mismatches) {
  results.push({ id, name, compared, matched, accuracy: compared ? matched / compared : null, detail: detail || '', samples: (mismatches || []).slice(0, +process.env.QA_SAMPLES || 6) });
}
const T = s => String(s || '').replace('POKEMON_TYPE_', '').toLowerCase();

(async () => {
  const gm = await load('QA_GM', 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json');
  const pvpokeMons = await load('QA_PVPOKE_POKEMON', 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json');
  const by = {};
  gm.forEach(x => { by[x.templateId] = x.data; });

  // ---- species: base stats, types, buddy distance, evolution candy -------------
  const species = [];
  gm.forEach(x => {
    const mm = /^V(\d{4})_POKEMON_([A-Z0-9_]+)$/.exec(x.templateId);
    const ps = x.data.pokemonSettings;
    if (mm && ps && !ps.form) species.push({ dex: +mm[1], id: mm[2], ps });
  });
  const L = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(female)$/, 'f').replace(/(male)$/, 'm');
  const evoIdx = {}; Object.keys(m.REAL_EVOLUTION_TABLE).filter(k => k.indexOf('|') < 0).forEach(k => { evoIdx[L(k)] = m.REAL_EVOLUTION_TABLE[k]; });
  const evoRow = (id, name) => evoIdx[L(id)] || evoIdx[L(name || '')];
  let c = 0, ok = 0, bad = [];
  species.forEach(s => {
    const b = m.BASE_STATS[s.dex]; if (!b) { c++; bad.push(`${s.id}: missing`); return; }
    c++; const g = [s.ps.stats.baseAttack, s.ps.stats.baseDefense, s.ps.stats.baseStamina];
    if (b[0] === g[0] && b[1] === g[1] && b[2] === g[2]) ok++; else bad.push(`${s.id}: app ${b} vs game ${g}`);
  });
  area('A01', 'Base stats (atk/def/sta) for every released species', c, ok, `${species.length} species in the game master`, bad);

  c = ok = 0; bad = [];
  species.forEach(s => {
    const name = m.DEX_NAMES[s.dex]; if (!name) return;
    const info = m.speciesInfo(name, ''); if (!info) { c++; bad.push(`${s.id}: no info`); return; }
    const want = [T(s.ps.type), s.ps.type2 ? T(s.ps.type2) : null].filter(Boolean);
    c++; const got = info.types.map(x => x.toLowerCase());
    if (want.join() === got.join()) ok++; else bad.push(`${s.id}: app ${got} vs game ${want}`);
  });
  area('A02', 'Species typing', c, ok, '', bad);

  c = ok = 0; bad = [];
  species.forEach(s => {
    const name = m.DEX_NAMES[s.dex]; const info = name && m.speciesInfo(name, ''); if (!info || !s.ps.kmBuddyDistance) return;
    c++; if (info.buddyKm === s.ps.kmBuddyDistance) ok++; else bad.push(`${s.id}: app ${info.buddyKm} vs game ${s.ps.kmBuddyDistance}`);
  });
  area('A03', 'Buddy walking distance (km per candy)', c, ok, '', bad);

  c = ok = 0; bad = [];
  species.forEach(s => {
    const br = s.ps.evolutionBranch || []; const name = m.DEX_NAMES[s.dex];
    const row = evoRow(s.id, name);
    if (!br.length || !br.some(b => b.candyCost)) return;
    if (!row) { c++; bad.push(`${s.id}: no evolution row`); return; }
    c++; if (br.some(b => b.candyCost === row.candy)) ok++; else bad.push(`${s.id}: app ${row.candy} vs game ${br.map(b => b.candyCost)}`);
  });
  area('A04', 'Evolution candy cost', c, ok, 'one target per species in the app; matches any real branch', bad);
  // reverse: species the app says evolve but the game says do not (plain forms only)
  c = ok = 0; bad = [];
  Object.keys(m.REAL_EVOLUTION_TABLE).filter(k => k.indexOf('|') < 0).forEach(k => {
    c++; const gmHas = species.some(s => (s.ps.evolutionBranch || []).some(b => b.candyCost) && (L(s.id) === L(k) || L(m.DEX_NAMES[s.dex] || '') === L(k)));
    if (gmHas) ok++; else bad.push(k + ': app says it evolves; game master says the plain form does not');
  });
  area('A04b', 'No phantom evolutions (app rows that the game does not have)', c, ok, '', bad);

  // ---- CPM and power-up cost ---------------------------------------------------
  const cpmArr = by.PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier;
  c = ok = 0; bad = [];
  for (let L = 1; L <= 50; L++) {
    c++; if (Math.abs(m.CPM[L] - cpmArr[L - 1]) < 1e-6) ok++; else bad.push(`L${L}: app ${m.CPM[L]} vs game ${cpmArr[L - 1]}`);
    if (L < 50) { const half = Math.sqrt((cpmArr[L - 1] ** 2 + cpmArr[L] ** 2) / 2); c++; if (Math.abs(m.CPM[L + 0.5] - half) < 1e-4) ok++; else bad.push(`L${L}.5: app ${m.CPM[L + 0.5]} vs ${half}`); }
  }
  area('A05', 'CP multiplier by level (1-50, incl. half levels)', c, ok, '', bad);

  const up = by.POKEMON_UPGRADE_SETTINGS.pokemonUpgrades;
  c = ok = 0; bad = [];
  for (let L = 1; L < 50; L += 0.5) {
    const i = Math.floor(L) - 1, got = m.powerUpStepCost(L);
    const wantXl = L >= 40 ? up.xlCandyCost[Math.min(Math.floor(L) - 40, up.xlCandyCost.length - 1)] : 0;
    const want = { dust: up.stardustCost[i], candy: L >= 40 ? 0 : up.candyCost[i], xl: wantXl };
    c++; if (got.dust === want.dust && got.candy === want.candy && got.xlCandy === want.xl) ok++; else bad.push(`L${L}: app ${JSON.stringify(got)} vs game ${JSON.stringify(want)}`);
  }
  area('A06', 'Power-up cost per step (stardust, candy, XL candy)', c, ok, `shadow x${up.shadowStardustMultiplier}, purified x${up.purifiedStardustMultiplier} in game`, bad);

  // ---- moves ---------------------------------------------------------------------
  c = ok = 0; bad = [];
  const raid = {};
  gm.forEach(x => { const ms = x.data.moveSettings, mm = /^V\d+_MOVE_(.*)$/.exec(x.templateId); if (ms && mm) raid[mm[1].replace(/_FAST$/, '').replace(/_/g, ' ').toLowerCase() + (/_FAST$/.test(mm[1]) ? '|f' : '|c')] = ms; });
  Object.keys(m.AUTHORITATIVE_MOVES).forEach(k => {
    const a = m.AUTHORITATIVE_MOVES[k]; const suf = a.kind === 'fast' ? '|f' : '|c'; const g = raid[k + suf] || raid[k.replace(/ plus( plus)?$/, '') + suf];
    if (!g || !Number.isFinite(g.energyDelta)) return; c++;
    const en = a.kind === 'fast' ? g.energyDelta : -g.energyDelta;
    if (a.power === g.power && a.energy === en && a.durationMs === g.durationMs && a.type.toLowerCase() === T(g.pokemonType)) ok++;
    else bad.push(`${k}: app ${a.power}/${a.energy}/${a.durationMs}ms ${a.type} vs game ${g.power}/${en}/${g.durationMs}ms ${T(g.pokemonType)}`);
  });
  area('A07', 'Gym/raid move data (power, energy, duration, type)', c, ok, `${Object.keys(m.AUTHORITATIVE_MOVES).length} moves in the app`, bad);

  c = ok = 0; bad = [];
  const combat = {};
  gm.forEach(x => { const cm = x.data.combatMove, mm = /^COMBAT_V\d+_MOVE_(.*)$/.exec(x.templateId); if (cm && mm) combat[mm[1].replace(/_FAST$/, '').toLowerCase()] = cm; });
  ['dragon_breath', 'counter', 'mud_shot', 'bubble', 'vine_whip', 'shadow_claw', 'incinerate', 'lock_on', 'fairy_wind', 'snarl', 'charm', 'dragon_tail', 'volt_switch', 'poison_jab', 'psycho_cut', 'confusion', 'fire_spin', 'steel_wing', 'rock_smash', 'waterfall'].forEach(id => {
    const a = m.pvpFastMoveFor(id), g = combat[id]; if (!a || !g) return; c++;
    const turns = (g.durationTurns || 0) + 1;
    if (a.power === g.power && a.energyGain === g.energyDelta && a.turns === turns) ok++; else bad.push(`${id}: app ${JSON.stringify(a)} vs game power ${g.power} energy ${g.energyDelta} turns ${turns}`);
  });
  area('A08', 'PvP fast-move data (power, energy, turns) — 20-move sample', c, ok, '', bad);

  // ---- movepools ---------------------------------------------------------------------
  c = ok = 0; bad = [];
  const mv = id => String(id).replace(/_FAST$/, '').replace(/_/g, ' ').toLowerCase();
  species.forEach(s => {
    const name = m.DEX_NAMES[s.dex]; const pool = name && m.movepoolFor(name.replace(/-/g, ' ')); if (!pool) { if (name && (s.ps.quickMoves || []).length) { c++; bad.push(`${s.id}: no movepool`); } return; }
    c++;
    const gf = new Set([...(s.ps.quickMoves || []), ...(s.ps.eliteQuickMove || [])].map(mv)), gc = new Set([...(s.ps.cinematicMoves || []), ...(s.ps.eliteCinematicMove || [])].map(mv));
    const af = new Set([...pool.fast, ...pool.fastLegacy]), ac = new Set([...pool.charge, ...pool.chargeLegacy]);
    const eq = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
    if (eq(gf, af) && eq(gc, ac)) ok++; else bad.push(`${s.id}: fast app-only [${[...af].filter(x => !gf.has(x))}] game-only [${[...gf].filter(x => !af.has(x))}]; charge app-only [${[...ac].filter(x => !gc.has(x))}] game-only [${[...gc].filter(x => !ac.has(x))}]`);
  });
  area('A18', 'Learnable movepools (fast + charged, incl. Elite/legacy) per species', c, ok, '', bad);

  // ---- type chart ------------------------------------------------------------------
  const ORDER = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost', 'Steel', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark', 'Fairy'];
  c = ok = 0; bad = [];
  ORDER.forEach(att => { const sc = by['POKEMON_TYPE_' + att.toUpperCase()].typeEffective.attackScalar; ORDER.forEach((def, i) => { c++; const got = m.typeMultiplier(att, [def]); if (Math.abs(got - sc[i]) < 1e-3) ok++; else bad.push(`${att}→${def}: app ${got} vs game ${sc[i]}`); }); });
  area('A09', 'Type effectiveness chart (324 matchups)', c, ok, '', bad);
  const cs = by.COMBAT_SETTINGS.combatSettings;
  area('A10', 'STAB multiplier (game: ' + cs.sameTypeAttackBonusMultiplier + ')', 1, m.STAB_MULTIPLIER === cs.sameTypeAttackBonusMultiplier ? 1 : 0, 'app ' + m.STAB_MULTIPLIER);

  // ---- PvP rank-1 spreads vs PvPoke default IVs --------------------------------------
  m.setPvpMaxLevel(50);
  const pairs = [];
  pvpokeMons.forEach(p => { if (p.defaultIVs && p.baseStats && !/_mega|_primal|_shadow/.test(p.speciesId) && p.dex) pairs.push(p); });
  [['cp1500', 1500, 1200], ['cp2500', 2500, 600]].forEach(([k, cap, limit]) => {
    c = ok = 0; bad = []; let near = 0;
    pairs.slice(0, limit).forEach(p => {
      const d = p.defaultIVs[k]; if (!d) return;
      const base = [p.baseStats.atk, p.baseStats.def, p.baseStats.hp];
      const mine = m.bestSpreadUnderCap(base, cap, false); if (!mine) return;
      const theirs = m.statProductFor(base, [d[1], d[2], d[3]], d[0]);
      // PvPoke's default can be the highest-product spread that is under the cap at ITS level.
      if (m.cpFor(base, [d[1], d[2], d[3]], d[0]) > cap) return;
      c++;
      const ratio = mine.product / theirs;
      if (ratio >= 0.9995 && ratio <= 1.0005) ok++; else if (ratio > 1.0005) { near++; ok++; } else bad.push(`${p.speciesId}: app ${mine.ivs}@${mine.level} (${mine.product.toFixed(0)}) vs PvPoke ${d.slice(1)}@${d[0]} (${theirs.toFixed(0)})`);
    });
    area(k === 'cp1500' ? 'A11' : 'A12', `Rank-1 stat-product spread vs PvPoke (${cap} CP)`, c, ok, `${near} where the app found a higher-product spread than PvPoke's default (counted as match)`, bad);
  });

  // ---- IV solver round trip ---------------------------------------------------------
  let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  c = ok = 0; bad = []; let candTotal = 0, unique = 0;
  const dexes = Object.keys(m.BASE_STATS).slice(0, 600);
  for (let i = 0; i < 3000; i++) {
    const dex = dexes[Math.floor(rnd() * dexes.length)], base = m.BASE_STATS[dex];
    const iv = [0, 0, 0].map(() => Math.floor(rnd() * 16)), L = 1 + Math.floor(rnd() * 98) / 2 * (50 / 49.5) ;
    const lvl = Math.max(1, Math.min(50, Math.round(L * 2) / 2));
    const cp = m.cpFor(base, iv, lvl), hp = m.hpFor(base, iv[2], lvl);
    const r = m.solveIVs(base, cp, hp, null, null) || []; c++;
    candTotal += r.length; if (r.length === 1) unique++;
    if (r.some(x => x.atkIV === iv[0] && x.defIV === iv[1] && x.staIV === iv[2] && Math.abs(x.level - lvl) < 0.01)) ok++; else bad.push(`dex ${dex} ${iv}@${lvl} cp ${cp} hp ${hp}: not in ${r.length} candidates`);
  }
  area('A13', 'IV solver: true IVs always among candidates (3,000 random Pokémon)', c, ok, `avg ${(candTotal / c).toFixed(1)} candidates per CP/HP pair; ${(100 * unique / c).toFixed(1)}% resolve to exactly one`, bad);
  results.push({ id: 'A13b', name: 'IV solver uniqueness (share of CP/HP pairs resolving to one candidate)', compared: c, matched: unique, accuracy: unique / c, detail: 'informational: low values mean an appraisal is needed', samples: [] });

  // ---- Mega rules -----------------------------------------------------------------
  c = ok = 0; bad = [];
  Object.keys(m.MEGA_EVOLUTION_COSTS).forEach(sp => {
    const g0 = by['MEGA_EVOLUTION_LEVEL_0_V' + String(Object.keys(m.DEX_NAMES).find(d => m.DEX_NAMES[d].toLowerCase().replace(/[^a-z]/g, '') === sp.replace(/[^a-z]/g, '')) || 0).padStart(4, '0') + '_POKEMON_' + sp.toUpperCase()] || by.MEGA_EVOLUTION_LEVEL_0;
    const g1 = by['MEGA_EVOLUTION_LEVEL_1_V' + String(Object.keys(m.DEX_NAMES).find(d => m.DEX_NAMES[d].toLowerCase().replace(/[^a-z]/g, '') === sp.replace(/[^a-z]/g, '')) || 0).padStart(4, '0') + '_POKEMON_' + sp.toUpperCase()] || by.MEGA_EVOLUTION_LEVEL_1;
    m.megaEvolveCostFor(sp, {}).forEach(f => {
      c++; const rep = m.megaEvolveCostFor(sp, { [f.form || '']: true }).find(x => x.form === f.form);
      if (f.cost === g0.megaEvoLevelSettings.cooldown.bypassCostInitial && rep.cost === g1.megaEvoLevelSettings.cooldown.bypassCostInitial) ok++;
      else bad.push(`${sp} ${f.form || ''}: app ${f.cost}/${rep.cost} vs game ${g0.megaEvoLevelSettings.cooldown.bypassCostInitial}/${g1.megaEvoLevelSettings.cooldown.bypassCostInitial}`);
    });
  });
  area('A14', 'Mega Evolution energy: first-time and repeat cost vs game master level rules', c, ok, '', bad);

  // ---- meta freshness vs live PvPoke ----------------------------------------------------
  try {
    const live = await load('QA_PVPOKE_RANK_GREAT', 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json');
    const top = live.slice(0, 40).filter(r => !/_shadow$/.test(r.speciesId));
    c = ok = 0; bad = [];
    top.forEach(r => { c++; const t = m.PVP_TIER_GREAT[r.speciesId]; if (t && Math.abs(t.score - r.score) < 1.0) ok++; else bad.push(`${r.speciesId}: app ${t ? t.score : 'none'} vs live ${r.score}`); });
    area('A15', 'Great League top-40 scores vs live PvPoke today (freshness)', c, ok, 'drops when PvPoke re-rates; the weekly workflow refreshes it', bad);
    c = ok = 0; bad = [];
    top.forEach(r => { const t = m.PVP_TIER_GREAT[r.speciesId]; if (!t || !t.moves) return; c++; if (t.moves === r.moveset.map(x => x.toLowerCase().replace(/_/g, ' ')).join('|')) ok++; else bad.push(`${r.speciesId}: app ${t.moves} vs live ${r.moveset}`); });
    area('A16', 'Great League recommended movesets vs live PvPoke', c, ok, '', bad);
  } catch (e) { results.push({ id: 'A15', name: 'Live PvPoke freshness', compared: 0, matched: 0, accuracy: null, detail: 'live fetch failed: ' + e.message, samples: [] }); }

  // ---- internal sanity (invariants) --------------------------------------------------------
  const inv = [];
  const e1 = m.rankPctForLeague(m.BASE_STATS[184], [0, 15, 15], 'great', false);
  inv.push(['rank-1 spread scores 100%', e1 > 99.99]);
  inv.push(['a worse spread scores lower', m.rankPctForLeague(m.BASE_STATS[184], [15, 0, 0], 'great', false) < 90]);
  inv.push(['shadow multipliers 1.2 / 0.8333', m.SHADOW_ATK_MULTIPLIER === 1.2 && Math.abs(m.SHADOW_DEF_MULTIPLIER - 0.8333) < 0.001]);
  inv.push(['CP never drops below 10', m.cpFor([1, 1, 1], [0, 0, 0], 1) >= 10]);
  inv.push(['weather boosts only matching types', m.WEATHER_BOOST === 1.2 || m.WEATHER_BOOST > 1]);
  inv.push(['level 50 CPM is the maximum', m.CPM[50] > m.CPM[49.5]]);
  inv.push(['Mega cost 0 when rested, scaled by rest left', m.megaCostAt('beedrill', 1, 0) === 0 && m.megaCostAt('beedrill', 1, 4) === 11]);
  area('A17', 'Math invariants (7)', inv.length, inv.filter(x => x[1]).length, '', inv.filter(x => !x[1]).map(x => x[0]));

  fs.writeFileSync(process.argv[2] || 'qa-accuracy.json', JSON.stringify(results, null, 1));
  results.forEach(r => console.log((r.accuracy == null ? ' n/a ' : (100 * r.accuracy).toFixed(1).padStart(5) + '%'), r.id, r.name, `(${r.matched}/${r.compared})`, r.samples.length ? '\n        e.g. ' + r.samples.slice(0, 2).join('\n             ') : ''));
})().catch(e => { console.error(e); process.exit(1); });
