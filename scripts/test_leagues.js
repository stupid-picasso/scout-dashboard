#!/usr/bin/env node
// The LEAGUES table (pokemon-mechanics.js) is the one place a league's cap, floor, game-master CP, names, tier table, meta list and
// simulator pool are written. This test pins the table, pins that an unknown league key gets nothing (never Great's data), and checks
// that the component reads those facts through the table: it extracts the league methods from `Scout Dashboard.dc.html`, runs them
// against a mechanics object whose table was changed, and expects the answers to follow the change.
// Run: node scripts/test_leagues.js
const fs = require('fs');
const path = require('path');
const { checker, loadMechanicsContext, REPO } = require('./lib/testkit');

const t = checker();
const { m } = loadMechanicsContext();
const DC = fs.readFileSync(path.join(REPO, 'Scout Dashboard.dc.html'), 'utf8');
const MECH = fs.readFileSync(path.join(REPO, 'pokemon-mechanics.js'), 'utf8');

function methodBody(src, signature) {
  const i = src.indexOf(signature);
  if (i < 0) throw new Error('Could not find "' + signature + '" in the component source: renamed?');
  const b = src.indexOf('{', i);
  let depth = 0, j = b;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(b + 1, j);
}
const method = (sig, thisArg) => new Function(...sig.slice(sig.indexOf('(') + 1, sig.lastIndexOf(')')).split(',').map(s => s.trim()).filter(Boolean), methodBody(DC, sig + ' {')).bind(thisArg);

// ---- the table
const KEYS = ['great', 'ultra', 'little', 'master'];
t.eq('the table holds exactly the four leagues', Object.keys(m.LEAGUES), KEYS);
t.eq('caps', KEYS.map(k => m.LEAGUES[k].cap), [1500, 2500, 500, Infinity]);
t.eq('floors (null for Master: no band)', KEYS.map(k => m.LEAGUES[k].floor), [1300, 2300, 400, null]);
t.eq('game-master CPs', KEYS.map(k => m.LEAGUES[k].gmCp), [1500, 2500, 500, 10000]);
t.eq('labels', KEYS.map(k => m.LEAGUES[k].label), ['Great', 'Ultra', 'Little', 'Master']);
t.eq('names', KEYS.map(k => m.LEAGUES[k].name), ['Great League', 'Ultra League', 'Little Cup', 'Master League']);
t.eq('abbreviations (they are also the saved tag prefixes)', KEYS.map(k => m.LEAGUES[k].abbr), ['GL', 'UL', 'LC', 'ML']);
t.eq('cap text is derived from the cap', KEYS.map(k => m.LEAGUES[k].capText), ['≤ 1500 CP', '≤ 2500 CP', '≤ 500 CP', 'No cap']);
t.ok('every entry names its own key', KEYS.every(k => m.LEAGUES[k].key === k));
t.ok('the table and its entries are frozen', Object.isFrozen(m.LEAGUES) && KEYS.every(k => Object.isFrozen(m.LEAGUES[k])));
t.eq('LEAGUE_CAPS is the table read as key -> cap', KEYS.map(k => m.LEAGUE_CAPS[k]), KEYS.map(k => m.LEAGUES[k].cap));
t.eq('the tier tables are the exported PvPoke tables', KEYS.map(k => m.LEAGUES[k].tierTable), [m.PVP_TIER_GREAT, m.PVP_TIER_ULTRA, m.PVP_TIER_LITTLE, m.PVP_TIER_MASTER]);
t.ok('the table points at the very objects the exports hold', KEYS.every((k, i) => m.LEAGUES[k].tierTable === [m.PVP_TIER_GREAT, m.PVP_TIER_ULTRA, m.PVP_TIER_LITTLE, m.PVP_TIER_MASTER][i]));
t.ok('Great and Ultra have a meta list and a simulator pool, Little and Master have none', m.LEAGUES.great.meta.length > 20 && m.LEAGUES.ultra.meta.length > 20 && m.LEAGUES.great.sim.length > 20 && m.LEAGUES.ultra.sim.length > 20 && !m.LEAGUES.little.meta.length && !m.LEAGUES.master.sim.length);
t.eq('pvpMetaFor reads the meta list from the table', [m.pvpMetaFor('great').length, m.pvpMetaFor('ultra').length], [m.LEAGUES.great.meta.length, m.LEAGUES.ultra.meta.length]);
t.eq('pvpSimPool reads the pool from the table (some rows cannot be built)', m.pvpSimPool('great').length > 20 && m.pvpSimPool('great').length <= m.LEAGUES.great.sim.length, true);
t.eq('pvpTableFor returns each league\'s tier table', KEYS.map(k => m.pvpTableFor(k)), KEYS.map(k => m.LEAGUES[k].tierTable));
t.ok('pvpTableFor(mega) is the Mega Master ranking, a table with no league behind it', m.pvpTableFor('mega') === m.PVP_TIER_MEGA && m.leagueOf('mega') === null);
t.ok('every game-master CP is a ranking the PvPoke importer fetches', KEYS.every(k => new RegExp('rankings-' + m.LEAGUES[k].gmCp + '\\.json').test(fs.readFileSync(path.join(REPO, 'scripts', 'import_pvp_tier_data.py'), 'utf8'))));

// ---- an unknown league key gets nothing, never Great
const UNKNOWN = ['', 'bogus', 'GREAT', 'season', 'constructor', 'toString', '__proto__', 'hasOwnProperty', undefined, null, 0, 1500, {}];
t.ok('leagueOf is null for every unknown key', UNKNOWN.every(k => m.leagueOf(k) === null));
t.ok('pvpTableFor is null for every unknown key (it used to answer Great\'s table)', UNKNOWN.every(k => m.pvpTableFor(k) === null));
t.ok('pvpTierFor is null for an unknown key, for a species Great ranks', m.pvpTierFor('melmetal', false, 'great') != null && UNKNOWN.every(k => m.pvpTierFor('melmetal', false, k) === null));
t.ok('pvpMetaFor and pvpSimPool are empty for an unknown key', UNKNOWN.every(k => m.pvpMetaFor(k).length === 0 && m.pvpSimPool(k).length === 0));
t.ok('pvpTableFor of an unknown cup is still null', m.pvpTableFor('cup:no-such-cup@1500') === null);
t.eq('leagueKeyForCp', [500, 1500, 2500, 10000, 12000, Infinity].map(m.leagueKeyForCp), ['little', 'great', 'ultra', 'master', 'master', 'master']);
t.ok('leagueKeyForCp is null for a CP that is no league\'s', [0, 1, 499, 501, 1499, 1501, 2499, 9999, NaN, null, undefined, '1500'].every(c => m.leagueKeyForCp(c) === null));

// ---- no second copy of a league fact anywhere in the source
t.eq('the mechanics file writes the Great cap once, in the table', (MECH.match(/\bcap: 1500\b/g) || []).length, 1);
t.ok('no league cap literal object is left in either file', !/great:\s*1500|ultra:\s*2500|little:\s*500/.test(DC) && !/great:\s*1500|ultra:\s*2500|little:\s*500/.test(MECH.replace(/^.*\bdurationMs\b.*$/gm, '')));
t.ok('the component has no cap-to-league ladder', !/\b(cp|ck) === (500|1500|2500)\b/.test(DC) && !/>= 10000 \? 'master'/.test(DC) && !/capOf = \{/.test(DC) && !/FLOORS/.test(DC));
t.ok('the component has no `|| { great: ...}` fallback', !/\|\| \{ great:/.test(DC));
t.ok('the component never reads LEAGUE_CAPS (it reads the table)', !/LEAGUE_CAPS/.test(DC));
t.ok('the mechanics ladders are gone', !/leagueKey === 'ultra' \?/.test(MECH) && !/: PVP_TIER_GREAT;/.test(MECH));
// The one league-name ternary left is the saved team's default name (see PROJECT_HANDOFF: unifying it renames saved teams for Little/Master).
t.eq('only the saved-team default name still spells Great/Ultra by ternary', (DC.match(/league === 'ultra' \? 'Ultra' : 'Great'/g) || []).length, 1);

// ---- the component's league methods follow the table
function fakeMechanics(patch) {
  const LEAGUES = {};
  KEYS.forEach(k => { LEAGUES[k] = { ...m.LEAGUES[k], ...(patch[k] || {}) }; });
  return { ...m, LEAGUES, leagueOf: k => (Object.prototype.hasOwnProperty.call(LEAGUES, k) ? LEAGUES[k] : null), leagueKeyForCp: cp => (cp >= LEAGUES.master.gmCp ? 'master' : (KEYS.map(x => LEAGUES[x]).find(l => l.gmCp === cp) || {}).key || null) };
}
{
  const real = { mechanics: m };
  const moved = { mechanics: fakeMechanics({ great: { cap: 1600, floor: 1400, gmCp: 1600 } }) };
  const band = c => method('leagueBand(leagueKey)', c);
  const usable = c => method('leagueUsable(p, leagueKey)', c);
  t.eq('leagueBand reads cap and floor from the table', [band(real)('great'), band(moved)('great')], [{ cap: 1500, floor: 1300, slack: 75 }, { cap: 1600, floor: 1400, slack: 75 }]);
  t.eq('leagueBand is null for Master and for an unknown key', [band(real)('master'), band(real)('bogus'), band(real)('season')], [null, null, null]);
  t.eq('leagueUsable follows the table cap', [usable(real)({ cp: 1550 }, 'great'), usable(moved)({ cp: 1550 }, 'great'), usable(real)({ cp: 1550 }, 'ultra')], [false, true, true]);
  t.eq('leagueUsable gives an unknown key the benefit of the doubt', usable(real)({ cp: 99999 }, 'bogus'), true);
  t.eq('leagueUsable has no cap for Master', usable(real)({ cp: 99999 }, 'master'), true);
  // the feed's CP -> league key, through the table
  const opts = c => method('seasonOptions(now)', Object.assign(c, { state: { feed: { gbl: [{ start: '2000-01-01', end: '2999-01-01', leagues: [{ name: 'A', cp: 1500 }, { name: 'B', cp: 1600 }, { name: 'C', cp: 10000 }, { name: 'D', cp: 777 }] }] } }, validFeed: () => true }));
  t.eq('seasonOptions maps the feed CP through the table (777 is no league: dropped)', opts({ mechanics: m })().map(o => [o.name, o.league]), [['A', 'great'], ['C', 'master']]);
  t.eq('seasonOptions follows a changed game-master CP', opts({ mechanics: moved.mechanics })().map(o => [o.name, o.league]), [['B', 'great'], ['C', 'master']]);
  // the search presets: CP bounds from the caps
  const presetState = {};
  const apply = c => method('applySearchPreset(key)', Object.assign(c, { setState: s => Object.assign(presetState, s) }));
  apply({ mechanics: m })('ultra');
  t.eq('the Ultra search preset is cap(Great)+1 to the Ultra cap', [presetState.srchCpMin, presetState.srchCpMax], ['1501', '2500']);
  apply({ mechanics: moved.mechanics })('great');
  t.eq('the Great search preset follows the table', presetState.srchCpMax, '1600');
}

t.exit();
