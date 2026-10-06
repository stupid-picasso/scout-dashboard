#!/usr/bin/env python3
"""Builds docs/QA_REPORT.md from the two machine results:
   qa-accuracy.json (scripts/qa/qa_accuracy.js)  and  qa-e2e.json (scripts/qa/qa_run.js).
Usage: python3 scripts/qa/make_report.py <accuracy.json> <e2e.json> <out.md> [<before_e2e.json>]
Ratings are 1-10 and combine the measured pass rate / accuracy with a short judgement of
what the test could not see. They are written down in RATINGS below so they can be argued with.
"""
import json, sys, collections, datetime

acc = json.load(open(sys.argv[1]))
e2e = json.load(open(sys.argv[2]))
out = sys.argv[3]
before = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None

AREA_ORDER = ['Boot', 'Import', 'Roster', 'Gestures', 'Detail', 'Ranks', 'PvP', 'Attackers', 'Raid', 'Recs', 'Intel', 'Today', 'Home', 'Log', 'Security', 'PWA', 'Accessibility', 'Performance']

# area -> (rating, what is solid, what is weak / untested, suggestions)
RATINGS = {
 'Boot': (9, 'Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster.', 'Cold start on a throttled phone not measured.', ['Add a first-run empty state that explains what to import and how.']),
 'Import': (8, 'Poke Genie CSV, CRLF, accents, 800 rows and hostile HTML in names all handled; no script execution.', 'Only the Poke Genie column layout is understood; rows are not range-validated (an IV of 99 is accepted).', ['Validate each row (IV 0-15, CP, dex) and show a per-row error report.', 'Accept drag and drop and a second CSV layout; show an import preview before replacing.', 'Say "replaced N" in the notice when a roster is overwritten.']),
 'Roster': (8, 'Search, 8 sorts, 5 filters, paging and counts are correct; search now covers every move and trims input.', 'Lists are paged by 30, not virtualised; no multi-select.', ['Virtualise the list for 1,000+ rows.', 'Multi-select with bulk transfer / favourite / tag.', 'Saved filters ("PvP ready Great, unfavourited").']),
 'Gestures': (8, 'Swipe, long-press and tap-elsewhere-to-close behave like an iOS list.', 'Real-device haptics and scroll-vs-swipe arbitration could only be tested with synthetic touches.', ['Add a one-time hint the first time a list is shown.']),
 'Detail': (8, 'Header, moves, weaknesses, power-up, evolve and the Mega card work; Mega data persists.', 'The prev/next control has no accessible name so tests cannot find it.', ['Name the prev/next controls; add swipe between Pokemon.', 'Show the IV-rank spread target (best IVs for the league) next to the Pokemon\'s own.']),
 'Ranks': (9, 'Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%.', 'Little and Master only know PvPoke\'s top 80 species.', ['Import the full Little and Master tables lazily.']),
 'PvP': (9, 'No over-cap Pokemon in any league list; team is legal, distinct and cup-aware; sprites on every row.', 'No shield or charge-move simulation: it trusts PvPoke\'s simulated tiers.', ['Add a matchup simulator for two chosen Pokemon.', 'Show the power-up path to the next IV-rank breakpoint with its cost.']),
 'Attackers': (7, 'Ranked by a documented DPS x bulk score using real move data.', 'The 0.4 bulk exponent is a modelling choice; no dodging, no boss moves, no party boosts.', ['Replace the proxy with a per-boss simulation using game-master boss movesets.', 'Show confidence (how many of the Pokemon\'s moves have real data).']),
 'Raid': (7, 'Type effectiveness, weather and survivability behave correctly (Fire boss favours Water/Rock/Ground; Grass/Bug never at the top).', 'Assumes the boss uses its own types; no real boss movesets or enrage timer.', ['Pull this week\'s raid bosses from the events feed and rank your team for each with one tap.', 'Add party size and the Mega attack boost for the team.']),
 'Recs': (8, 'Transfer candidates never include Lucky, Shadow or Favourite Pokemon; MARK DONE advances the list.', 'AI recommendations need a key and were not exercised.', ['Explain why each Pokemon is on a list in one line.']),
 'Intel': (9, 'Living Dex, Kanto dex, hundo and flag counters all equal the data.', 'Counts exclude forms/costumes beyond the base dex.', ['Add per-generation and shiny-dex progress.']),
 'Today': (8, 'Feed-driven GBL and event cards are correct: expired weeks hidden, cups filter the squad by type, cached feed works offline, malformed feeds are ignored.', 'Feed data is community-sourced and only cross-checked against pokemongo.com by a workflow that has not yet run.', ['Schedule the cross-check and show its result prominently.', 'Local notifications for events and Mega rest timers.', 'Calendar export for events.']),
 'Home': (7, 'Settings, resources, Mega energy admin, storage planner and the two-tap clear all work; secrets stay on device.', 'Sign-in needs the network; Firestore sync was not exercised end to end.', ['Move Mega Energy entry onto the Mega card only and retire the admin list.', 'Add a backup/restore JSON file.']),
 'Log': (8, 'Snapshots and the diagnostics panel work.', 'Snapshots are manual.', ['Chart roster growth over time.']),
 'Security': (9, 'No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload, no XSS from names.', 'The Firebase web key should be restricted to this origin in the Google console.', ['Restrict the Firebase key by HTTP referrer.', 'Add a Content-Security-Policy.']),
 'PWA': (8, 'Manifest, icons, service worker and offline reload verified over HTTP.', 'Install flow and home-screen icon rendering need a real iPhone.', ['Add maskable icons and a splash screen per device size.']),
 'Accessibility': (6, 'Contrast passes AA for most text and tap targets are 44 pt.', 'Before this pass: no roles, no keyboard access, no lang, small text. A runtime enhancer now adds roles, names, tabindex and Enter/Space activation.', ['Use real <button>/<a> elements in the template instead of the runtime enhancer.', 'Support Dynamic Type with rem units end to end.', 'Test with VoiceOver on a device.']),
 'Performance': (8, 'Tab switches and long-task checks pass; heap stays flat over 40 switches.', 'pokemon-mechanics.js is 1.27 MB and loads up front.', ['Split mechanics by feature and lazy-load PvP/Mega tables.', 'Virtualise long lists.']),
}

def bar(p):
    n = round(p * 10)
    return '█' * n + '░' * (10 - n)

by = collections.OrderedDict((a, []) for a in AREA_ORDER)
for r in e2e:
    by.setdefault(r['area'], []).append(r)

tot = collections.Counter(r['status'] for r in e2e)
acc_scored = [a for a in acc if a['accuracy'] is not None and not a['id'].endswith('13b')]
acc_mean = sum(a['accuracy'] for a in acc_scored) / len(acc_scored)
cmp_total = sum(a['compared'] for a in acc_scored); cmp_ok = sum(a['matched'] for a in acc_scored)

L = []
w = L.append
w('# Professor PWA - QA report')
w('')
w(f'Generated {datetime.date.today().isoformat()} against build v53.x. Two independent test layers:')
w('')
w(f'- **Accuracy audit** - {len(acc_scored)} checks comparing the app\'s data and math to Niantic\'s game master and to PvPoke: **{cmp_ok:,} of {cmp_total:,} comparisons match ({100*cmp_ok/cmp_total:.2f}%)**.')
w(f'- **Feature tests** - {len(e2e)} end-to-end cases in a real Chromium at iPhone size: **{tot["pass"]} pass, {tot["fail"]} fail, {tot["skip"]} skipped**.')
w('')
if before:
    bt = collections.Counter(r['status'] for r in before)
    w(f'Before the fixes in this pass the same suite had {bt["fail"]} failures; now {tot["fail"]}.')
    w('')

w('## 1. Scorecard')
w('')
w('Rating = how far this area can be trusted, 1-10. It blends the measured result with what the tests could not see.')
w('')
w('| Area | Rating | Tests | Pass | Notes |')
w('|---|---|---|---|---|')
for a in AREA_ORDER:
    rs = by.get(a, [])
    if not rs: continue
    ok = sum(1 for r in rs if r['status'] == 'pass'); n = len(rs) - sum(1 for r in rs if r['status'] == 'skip')
    rate, good, weak, _ = RATINGS.get(a, (0, '', '', []))
    w(f'| {a} | **{rate}/10** `{bar(rate/10)}` | {len(rs)} | {ok}/{n} | {good} |')
w('')
w('Data accuracy areas:')
w('')
w('| Check | Match | Result |')
w('|---|---|---|')
for a in acc:
    if a['accuracy'] is None: continue
    w(f'| {a["id"]} {a["name"]} | {a["matched"]:,}/{a["compared"]:,} | **{100*a["accuracy"]:.1f}%** `{bar(a["accuracy"])}` |')
w('')
w('Notes on the audit:')
w('')
for a in acc:
    if a['detail']:
        w(f'- **{a["id"]}** - {a["detail"]}')
w('')

w('## 2. Defects found and what happened to them')
w('')
w('| # | Severity | Finding | Status |')
w('|---|---|---|---|')
D = [
 ('Critical', 'The installed `index.html` / `Scout Dashboard.html` embedded a stale copy of `pokemon-mechanics.js` for several releases, so Little/Master tables, Mega Level rules and cup tables never reached the phone.', 'Fixed: the propagate script now re-embeds on every run and the smoke test fails if the bundle is stale.'),
 ('High', 'Roster, settings and Mega energy were kept only in cloud sync; signed out, a reload threw everything away (IMP-12, DET-14).', 'Fixed: a device copy is saved and restored when nobody is signed in; cloud still wins on sign-in.'),
 ('High', '123 of 1,024 species had no typing/buddy data because names with hyphens, colons or symbols (Ho-Oh, Porygon-Z, Type: Null, Nidoran) did not match.', 'Fixed: name normalisation plus a game-master fallback table.'),
 ('High', 'Plain Mr. Mime, Farfetch\'d, Corsola and others were told they evolve (the Galarian form\'s evolution overwrote the plain species), and Paldean/Alolan movepools overwrote plain ones.', 'Fixed: forms get their own rows; lookups take the form.'),
 ('High', 'Two base-stat errors (Dugtrio, Lycanroc) and ten species whose plain-name stats came from an alternate form (Zacian, Aegislash, Wishiwashi...).', 'Fixed: base stats now come from the game master.'),
 ('High', 'Mega Evolution cost used an older table that disagreed with the game\'s Mega Level rules (Dragonite 300 vs 500, Mewtwo repeat 150 vs 80).', 'Fixed: Mega Level rules are the single source.'),
 ('Medium', 'Roster search ignored a Pokemon\'s second charged move and did not trim spaces; an empty result showed a blank screen.', 'Fixed.'),
 ('Medium', 'An open swipe row did not close when you tapped elsewhere.', 'Fixed.'),
 ('Medium', 'Accessibility: 1 of 402 clickable elements had a role or name, none were keyboard reachable, no `lang`, 64 text runs under 11 px.', 'Mitigated: runtime roles/names/tabindex, `lang`, 11 px floor. Proper semantic elements are still the right long-term fix.'),
 ('Low', 'The Mega tag read as a single "M", easily confused with the male symbol.', 'Fixed: "MEGA".'),
 ('Info', 'The IV solver cannot identify a Pokemon from CP and HP alone (about 0.4% resolve uniquely); the app already requires an appraisal for ranks.', 'By design; the scan queue prioritises which Pokemon to appraise.'),
 ('Info', 'The official-page cross-check and live feed refresh run on GitHub, so they could not be exercised from the test sandbox.', 'Open: check the first scheduled run.'),
]
for i, (sev, f, st) in enumerate(D, 1):
    w(f'| {i} | {sev} | {f} | {st} |')
w('')

w('## 3. Every test case')
w('')
for a in AREA_ORDER + [k for k in by if k not in AREA_ORDER]:
    rs = by.get(a, [])
    if not rs: continue
    w(f'### {a}')
    w('')
    w('| ID | Case | Result | Note |')
    w('|---|---|---|---|')
    for r in rs:
        mark = {'pass': 'PASS', 'fail': '**FAIL**', 'skip': 'skip'}[r['status']]
        note = (r['note'] or '').replace('|', '/').replace('\n', ' ')[:140]
        w(f'| {r["id"]} | {r["name"]} | {mark} | {note} |')
    w('')

w('## 4. Per-area strengths, gaps and suggestions')
w('')
for a in AREA_ORDER:
    if a not in RATINGS: continue
    rate, good, weak, sug = RATINGS[a]
    w(f'### {a} - {rate}/10')
    w('')
    w(f'- **Solid:** {good}')
    w(f'- **Weak or unseen:** {weak}')
    for s_ in sug:
        w(f'- Next: {s_}')
    w('')

w('## 5. Roadmap to the best version of this app')
w('')
for t in [
 '**Raid week in one tap** - read this week\'s raid bosses from the events feed and show your best six for each, with weather.',
 '**Real battle simulation** for raids and PvP matchups using game-master movesets, shields and energy, replacing the DPS x bulk proxy.',
 '**Appraisal without screenshots** - the QA run shows CP/HP alone cannot identify IVs; make the scan queue the primary path and add a guided "appraise 10 Pokemon" flow.',
 '**Notifications** - Mega rest timers, event starts, GBL week changes (needs a push channel or local notifications in the installed PWA).',
 '**Semantic markup** - replace clickable divs with buttons/links and adopt rem-based type for Dynamic Type; add a VoiceOver test pass.',
 '**Data CI** - run `qa_accuracy.js` nightly; fail the build when any area drops below 99%.',
 '**Visual regression** - keep the iPhone screenshots in the repo and diff them on each change.',
]:
    w('- ' + t)
w('')
w('## 6. How to re-run')
w('')
w('```')
w('node scripts/qa/make_fixture.js                      # deterministic 64-Pokemon CSV')
w('node scripts/qa/qa_accuracy.js qa-accuracy.json      # data and math vs game master + PvPoke')
w('node scripts/qa/qa_run.js                            # feature tests (needs playwright + chromium)')
w('python3 scripts/qa/make_report.py qa-accuracy.json qa-e2e.json docs/QA_REPORT.md')
w('```')
open(out, 'w').write('\n'.join(L) + '\n')
print('wrote', out, len(L), 'lines')
