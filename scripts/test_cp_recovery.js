#!/usr/bin/env node
/** test_cp_recovery.js — cpCandidatesFor (CP hidden behind the Pokemon) in pokemon-mechanics.js. */
const { checker, loadMechanics } = require('./lib/testkit');
const m = loadMechanics();
const t = checker(), check = t.ok;

const kingdra = m.BASE_STATS[230];
check('Kingdra base stats exist', Array.isArray(kingdra) && kingdra.length === 3, kingdra);
// the screenshot: Kingdra, 155 HP, Power Up 11,000 stardust (level 41 / 41.5), CP 2656 with the middle digits hidden
const hidden = m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000, pattern: '2??6' });
check('2656 is among the candidates for 2??6', hidden.cps.indexOf(2656) >= 0, hidden);
check('the candidates all fit the pattern', hidden.cps.every(c => /^2\d\d6$/.test(String(c))), hidden.cps);
check('the dust cost narrows the level', hidden.dustMatched === true && hidden.levels.every(l => l >= 41 && l <= 42.5), hidden.levels);
const withXl = m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000, xlCandy: 10, pattern: '2??6' });
check('the 10 Candy XL fixes it to level 41 or 41.5', withXl.levels.join() === '41,41.5' && withXl.cps.indexOf(2656) >= 0 && withXl.cps.length <= hidden.cps.length, withXl);
check('far fewer CPs than a bare 2??6 range', hidden.cps.length < 40, hidden.cps.length);
// a read CP is checked, not searched
check('the right CP fits', m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000, cp: 2656 }).fits === true);
check('a wrong CP does not fit', m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000, cp: 1856 }).fits === false);
// IVs narrow it further
const ivs = (() => { for (const L of [41, 41.5]) for (let s = 0; s <= 15; s++) if (m.hpFor(kingdra, s, L) === 155) for (let a = 0; a <= 15; a++) for (let d = 0; d <= 15; d++) if (m.cpFor(kingdra, [a, d, s], L) === 2656) return [a, d, s]; return null; })();
check('a spread for 2656 exists', Array.isArray(ivs), ivs);
const narrowed = m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000, pattern: '2??6', ivs });
check('known IVs leave only that CP', narrowed.cps.length >= 1 && narrowed.cps.indexOf(2656) >= 0 && narrowed.cps.length <= hidden.cps.length, narrowed.cps);
// no information at all gives no pattern filter, dust still limits the level
const bare = m.cpCandidatesFor([kingdra], { hp: 155, dust: 11000 });
check('no digits visible: the range is wide but bounded', bare.cps.length > hidden.cps.length && bare.cps.every(c => c > 1000));
// junk
check('no base stats gives nothing', m.cpCandidatesFor([], { hp: 100 }).cps.length === 0);
check('unmatched dust is reported', m.cpCandidatesFor([kingdra], { hp: 155, dust: 123 }).dustMatched === false);
// lucky halves the stardust
const lucky = m.cpCandidatesFor([kingdra], { hp: 155, dust: 5500, lucky: true, pattern: '2??6' });
check('a lucky Kingdra with half the stardust finds the same level', lucky.cps.indexOf(2656) >= 0 && lucky.dustMatched === true, lucky);
t.exit(t.pass + ' passed, ' + t.fail + ' failed');
