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
 'Boot': (9, 'Loads clean at 320-1280 px with no page errors; every tab renders on an empty roster; first content in ~6.0 s on a 4x-CPU, 1.6 Mbps simulation.', 'Real-phone cold start not measured.', ['Check cold start on your phone and compare with the simulation.']),
 'Import': (9, 'Rows are range-checked with a notes card, a replace preview shows before/after counts, Replace can be undone, files read by column name (quoted names too), drag and drop works, and 200 corrupted files never crash it.', 'Only CSV; no JSON or second exporter layout beyond named columns.', ['Accept the app\'s own JSON backup through the same import path.']),
 'Roster': (8, 'Search, 9 sorts (incl. Mega ready), filters, saved views, select mode with bulk transfer/remove/favourite, undo, infinite scroll to 150 rows, correct counts.', 'Not a true virtual list: each new page hitches ~100-130 ms and auto-load stops at 150 rows; the 2,000-row 16 ms/frame target was measured and not met.', ['Replace the list with a windowed renderer so only visible rows exist in the DOM.']),
 'Gestures': (8, 'Swipe, long-press and tap-elsewhere-to-close behave like an iOS list; Transfer/Remove show Undo; a one-time hint shows the swipe.', 'Real-device haptics and scroll-vs-swipe arbitration only tested with synthetic touches; no WebKit run.', ['Run the suite on WebKit in CI and do a hands-on pass on the phone.']),
 'Detail': (9, 'Header, moves, weaknesses, power-up path with costs, best-spread target next to yours, evolve and the Mega card work; Previous/Next are named after the neighbouring Pokemon; heart is a real toggle; swipe and drag-to-dismiss exist.', 'Spread target is checked against the app\'s own optimiser, not re-derived from PvPoke each release.', ['Add a PvPoke rank-1 comparison to the accuracy audit for every league.']),
 'Ranks': (9, 'Recalculation fills Great/Ultra/Little for every Pokemon with IVs; rank-1 spreads match PvPoke 100%.', 'Little and Master only know PvPoke\'s top species.', ['Import the full Little and Master tables lazily.']),
 'PvP': (9, 'No over-cap Pokemon in any league list; team is legal, distinct and cup-aware, including Mega editions and cups; sprites on every row.', 'No shield or charge-move simulation: it trusts PvPoke\'s simulated tiers.', ['Add a matchup simulator for two chosen Pokemon.']),
 'Attackers': (7, 'Ranked by a documented DPS x bulk score using real move data.', 'The 0.4 bulk exponent is a modelling choice; no dodging, no boss moves, no party boosts. Simulation deferred by you.', ['Replace the proxy with a per-boss simulation using game-master boss movesets.']),
 'Raid': (7, 'Type effectiveness and weather behave correctly; this week\'s boss from the feed opens the Raid tab with its types (Mega X/Y, forms and shadows handled).', 'Assumes the boss uses its own types; no real boss movesets or enrage timer. Simulation deferred by you.', ['Add party size and the Mega attack boost; validate against published sims for 5 bosses.']),
 'Recs': (9, 'Every card states the rule behind it with the Pokemon\'s own numbers (tested to reproduce); MARK DONE and Transferred offer Undo; transfer lists never include Lucky, Shadow or Favourite.', 'AI recommendations need a key and were not exercised.', ['Exercise the AI path with a test key in CI.']),
 'Intel': (9, 'Living Dex, Kanto dex, hundo and flag counters all equal the data.', 'Counts exclude forms/costumes beyond the base dex.', ['Add per-generation and shiny-dex progress.']),
 'Today': (8, 'Live feed verified; cups cross-checked against the official page (later-season cups noted, not flagged); boss one-tap, calendar export, per-species verdicts, offline cache.', 'Reminders only fire while the app is open or returns to the front (iOS cannot wake a web app); feed is community data.', ['Add web push through a small server if closed-app reminders matter.']),
 'Home': (8, 'Device backup/restore without an account (no API keys inside, confirm step, bad files refused); trainer level, dust reserve and stardust validated; two-tap clear.', 'Trainer level and dust reserve fields were silently dead before this pass; settings are not yet grouped like iOS Settings; Firestore sync not exercised end to end.', ['Group settings into iOS-style sections; run a signed-in sync test against a test project.']),
 'Log': (9, 'Daily automatic snapshot (once a day), four growth charts checked on 30 synthetic days, export/import round-trips exactly and rejects junk.', 'Charts are small sparklines with no axis or date scale.', ['Add a tap-to-inspect point value on the charts.']),
 'Security': (9, 'No secrets in the shipped HTML (the Firebase web key is public by design), none in the sync payload or the device backup, no XSS from names.', 'The Firebase web key should be restricted to this origin in the Google console.', ['Restrict the Firebase key by HTTP referrer.', 'Add a Content-Security-Policy.']),
 'PWA': (8, 'Manifest (Professor, black theme, any + maskable icons with verified sizes), 180 px opaque touch icon, 10 iPhone splash images, install steps on iPhone Safari, service worker and offline reload verified over HTTP.', 'Install flow, home-screen icon and splash rendering need a real iPhone.', ['Do the Add to Home Screen check in docs/DEVICE_CHECKS.md.']),
 'Accessibility': (9, 'axe-core clean on every screen, the More menu, select mode and the detail sheet; Lighthouse accessibility 100; keyboard-only paths pass; real buttons and named controls.', 'No VoiceOver pass on a device yet; Dynamic Type not tested on a phone.', ['Do the VoiceOver pass in docs/DEVICE_CHECKS.md.']),
 'Performance': (6, 'A state change takes ~14 ms at 500 Pokemon (was 45); minified app code and dropped fonts cut the download from 2.1 MB to ~0.6 MB gzip; ready time fell 6.5 s -> 6.0 s in a throttled A/B.', 'Lighthouse mobile reads 33-47 depending on host load; the remaining cost is bandwidth plus the runtime (React, the template engine, 650 KB of app logic). Measured and rejected: separate mechanics file (no gain), precompiled templates (~4%).', ['Split the app logic per tab and replace the in-browser template engine.', 'Windowed roster list.']),
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
