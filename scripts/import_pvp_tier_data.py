#!/usr/bin/env python3
"""
import_pvp_tier_data.py — species-level PVP meta tier (Great League / Ultra
League), sourced from PvPoke's public "overall" rankings.

WHY THIS EXISTS
----------------
The app's existing "Rank %" (bestRank / IV rank) is a per-species IV
percentile: how good THIS individual's IVs are relative to the best possible
IVs for its OWN species under the CP cap. It says nothing about whether the
species itself is any good in the meta — a perfect-IV Pikachu can show
100.0% and still be worthless in Great League. This script pulls a genuine
species-level competitiveness signal (PvPoke's 0-100 "score", which already
accounts for matchup spread across the meta) so the PVP list can sort by
real viability first, IV rank as tiebreak within tier.

SOURCE
------
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json
(1500 = Great League cap, 2500 = Ultra League cap — same CP caps the app
already uses for its own league buckets.)

TIER BUCKETS
------------
Same shape as a typical community tier list, bucketed off PvPoke's own
0-100 score:
  S: score >= 90       A: score >= 75       B: score >= 55       C: below 55

SHADOW HANDLING
---------------
PvPoke lists Shadow forms as separate entries (e.g. "ninetales_shadow").
The app tracks Shadow as a boolean flag on the individual (isShadow(p)),
not baked into the species name, so both the plain-form and shadow-form
scores are kept under the same species key: { score, tier, shadowScore,
shadowTier }. Lookup at call time picks the right one based on isShadow(p).

USAGE
-----
    python3 scripts/import_pvp_tier_data.py

Writes/updates the PVP_TIER_GREAT / PVP_TIER_ULTRA blocks in
pokemon-mechanics.js (same GENERATED BLOCK convention as the other
import_*.py scripts in this repo).
"""
import json
import re
import urllib.request

GREAT_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json"
ULTRA_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json"
MECH_PATH = "pokemon-mechanics.js"


def fetch(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def tier_for(score):
    if score >= 90: return "S"
    if score >= 75: return "A"
    if score >= 55: return "B"
    return "C"


def build_table(rankings):
    table = {}
    for row in rankings:
        sid = row.get("speciesId", "")
        score = row.get("score")
        if score is None:
            continue
        is_shadow = sid.endswith("_shadow")
        base = sid[:-len("_shadow")] if is_shadow else sid
        # Alt forms (e.g. "castform_sunny", "necrozma_dusk_mane") stay under
        # their own distinct key rather than collapsing into the base
        # species — they're mechanically different Pokemon, same as the
        # movepool/evolution import scripts treat them.
        entry = table.setdefault(base, {})
        if is_shadow:
            entry["shadowScore"] = round(score, 1)
            entry["shadowTier"] = tier_for(score)
        else:
            entry["score"] = round(score, 1)
            entry["tier"] = tier_for(score)
    return table


def main():
    great = build_table(fetch(GREAT_URL))
    ultra = build_table(fetch(ULTRA_URL))
    print(f"Great League: {len(great)} species")
    print(f"Ultra League: {len(ultra)} species")

    for name, sample in [("bulbasaur", great.get("bulbasaur")), ("azumarill", great.get("azumarill"))]:
        print(f"  spot-check {name}: {sample}")

    with open(MECH_PATH, "r", encoding="utf-8") as f:
        src = f.read()

    block = (
        "// GENERATED BLOCK: PVP_TIER (import_pvp_tier_data.py) — do not hand-edit\n"
        "const PVP_TIER_GREAT = " + json.dumps(great, separators=(",", ":")) + ";\n"
        "const PVP_TIER_ULTRA = " + json.dumps(ultra, separators=(",", ":")) + ";\n"
        "// END GENERATED BLOCK: PVP_TIER"
    )

    pattern = re.compile(
        r"// GENERATED BLOCK: PVP_TIER.*?// END GENERATED BLOCK: PVP_TIER",
        re.DOTALL,
    )
    if pattern.search(src):
        src = pattern.sub(block, src)
        print("Updated existing PVP_TIER block.")
    else:
        # Must land BEFORE pvpTierFor()/the window.PokemonMechanics export —
        # both reference PVP_TIER_GREAT/PVP_TIER_ULTRA by value at parse
        # time (not just inside a function body), so appending at end of
        # file would leave them referenced before their `const` is
        # initialized (TDZ ReferenceError on load).
        anchor = "function pvpTierFor(name, isShadow, leagueKey) {"
        idx = src.index(anchor)
        src = src[:idx] + block + "\n\n" + src[idx:]
        print("Inserted new PVP_TIER block before pvpTierFor().")

    with open(MECH_PATH, "w", encoding="utf-8") as f:
        f.write(src)


if __name__ == "__main__":
    main()
