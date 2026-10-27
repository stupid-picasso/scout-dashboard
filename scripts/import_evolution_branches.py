#!/usr/bin/env python3
"""
import_evolution_branches.py — every species whose next step branches into DIFFERENT species (Eevee, Poliwhirl,
Gloom, Slowpoke, Kirlia, Snorunt, Tyrogue, Wurmple, Clamperl, Burmy, Cosmoem, Applin, Charcadet, ...), with each
branch's own candy cost and requirement, from the game master.

The app's REAL_EVOLUTION_TABLE keeps ONE target per species (Eevee -> Vaporeon). This writes the EVOLUTION_BRANCHES
GENERATED BLOCK in pokemon-mechanics.js so the app can offer the real list to choose from:
    EVOLUTION_BRANCHES["eevee"] = [{to, candy, itemKey, itemLabel, gender, time, buddyKm, lure, task}, ...]
A species whose branches only differ by FORM of the same species (Dunsparce, Rockruff, Toxel, Meowstic, ...) is not a
branch and is left out.

Usage: python scripts/import_evolution_branches.py [path-to-latest.json]   (downloads it when no path is given)
"""
import json, re, sys, urllib.request

sys.path.insert(0, __file__.rsplit("/", 1)[0] if "/" in __file__ else ".")
from import_evolution_data import ITEM_LABELS, pretty_name  # same item and name conventions as REAL_EVOLUTION_TABLE

URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
MECH_PATH = "pokemon-mechanics.js"


def branches_of(gm):
    out = {}
    for entry in gm:
        if "COPY" in entry.get("templateId", ""):
            continue
        ps = (entry.get("data") or {}).get("pokemonSettings")
        if not ps or not ps.get("pokemonId"):
            continue
        form = ps.get("form")
        if form and not (form.endswith("_NORMAL") or form.endswith("_PLANT")):
            continue   # regional / alternate forms evolve on their own; only the plain species row is wanted
        raw = [b for b in ps.get("evolutionBranch", []) if b.get("evolution") and not b.get("temporaryEvolution") and b.get("candyCost") is not None]
        rows, seen = [], set()
        for b in raw:
            if b["evolution"] in seen:
                continue   # the same species again in another form (Dudunsparce two/three segments)
            seen.add(b["evolution"])
            item = ITEM_LABELS.get(b.get("evolutionItemRequirement") or "", (None, None))
            lure = b.get("lureItemRequirement") or ""
            rows.append({
                "to": pretty_name(b["evolution"]), "candy": b["candyCost"], "itemKey": item[0], "itemLabel": item[1],
                "gender": (b.get("genderRequirement") or "").lower() or None,
                "time": "day" if b.get("onlyDaytime") else "night" if b.get("onlyNighttime") else None,
                "buddyKm": b.get("kmBuddyDistanceRequirement") if b.get("mustBeBuddy") else None,
                "lure": "mossy" if "MOSSY" in lure else "glacial" if "GLACIAL" in lure else None,
                "task": bool(b.get("questDisplay")),
            })
        if len(rows) >= 2:
            out.setdefault(pretty_name(ps["pokemonId"]).lower(), rows)
    return out


def main():
    if len(sys.argv) > 1:
        gm = json.load(open(sys.argv[1]))
    else:
        with urllib.request.urlopen(URL, timeout=180) as r:
            gm = json.load(r)
    table = branches_of(gm)
    if len(table) < 10 or "eevee" not in table:
        sys.exit("game master shape changed (%d branching species); keeping old data" % len(table))
    # keep the block small: drop empty keys
    slim = {k: [{f: v for f, v in r.items() if v not in (None, False)} for r in rows] for k, rows in sorted(table.items())}
    block = ("// GENERATED BLOCK: EVOLUTION_BRANCHES (import_evolution_branches.py) — do not hand-edit\n"
             "const EVOLUTION_BRANCHES = " + json.dumps(slim, separators=(",", ":"), ensure_ascii=False) + ";\n"
             "// END GENERATED BLOCK: EVOLUTION_BRANCHES")
    src = open(MECH_PATH, encoding="utf-8").read()
    pat = re.compile(r"// GENERATED BLOCK: EVOLUTION_BRANCHES.*?// END GENERATED BLOCK: EVOLUTION_BRANCHES", re.S)
    if pat.search(src):
        src = pat.sub(lambda _: block, src)
    else:
        anchor = "// END GENERATED BLOCK: SPECIES_CLASS"
        assert anchor in src
        src = src.replace(anchor, anchor + "\n\n" + block, 1)
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    print("branching species:", len(slim), ", ".join(slim))


if __name__ == "__main__":
    main()
