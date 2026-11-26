#!/usr/bin/env python3
"""
import_max_data.py — Max Battle data from the game master (Niantic calls Max Battles "BREAD").

Writes three GENERATED BLOCKs in pokemon-mechanics.js:

  MAX_TIER_GROUP   Pokedex number -> upgrade group, from pokemonSettings.breadTierGroup ("1", "2", "3", "4", "8", "Z").
                   All forms of a species share a group today; if one ever differs, it is added as "<dex>_<form>".
  MAX_GROUP_COSTS  group -> { attack: [..], guard: [..], spirit: [..] }, each step { mp, candy, xl, dust } with zero
                   fields left out, from the BREAD_MOVE_LEVEL_SETTINGS_* templates (aSettings = Attack, bSettings = Guard,
                   cSettings = Spirit). Guard and Spirit have three steps (reaching level 1, 2, 3); Attack has two (reaching
                   level 2, 3), because the game master's first Attack step is a placeholder (Attack starts at level 1).
                   Group Z (Zacian, Zamazenta) pays Stardust instead of Max Particles.
  MAX_MOVE_IDS     { types: { Fire: "VN_BM_001", .. }, gmax: [[id, type, vfxName], ..] }: the Max Move id of each type
                   (BREAD_MOVE_MAPPING_SETTINGS) and the G-Max moves (VN_BM_* templates whose vfxName starts with gmax_).
                   The game master has no power numbers for them, so none are written.

It ALSO writes data/max_data.json ({generatedAt, source, tierGroup, groupCosts, moveIds}: the same three tables), which the app
fetches in "Refresh everything" so the data stays current without a new app build; the baked blocks are the offline fallback.
generatedAt only changes when the tables do, so an unchanged game master leaves the file untouched.

Usage: python scripts/import_max_data.py [path-to-latest.json]   (downloads it when no path is given)
"""
import datetime, json, os, re, sys
from collections import Counter

import gm_lib

MECH_PATH = "pokemon-mechanics.js"
JSON_PATH = os.path.join("data", "max_data.json")
SOURCE = "PokeMiners/game_masters, latest game master"
ANCHOR = "// ---- Max (Dynamax / Gigantamax) data"   # the blocks sit just above the hand-written Max constants
MIN_SPECIES = 500   # fewer mapped species than this means the game master changed shape
STEP_FIELDS = (("mp", "mpCost"), ("candy", "candyCost"), ("xl", "xlCandyCost"), ("dust", "stardustCost"))


def step(raw):
    return {k: int(raw[src]) for k, src in STEP_FIELDS if int(raw.get(src) or 0) > 0}


def group_costs(gm):
    out = {}
    for x in gm:
        s = (x.get("data") or {}).get("breadMoveLevelSettings")
        if not s:
            continue
        g = str(s["group"]).replace("GROUP_", "")
        a, b, c = s["aSettings"], s["bSettings"], s["cSettings"]
        if not (len(a) == len(b) == len(c) == 3):
            sys.exit("game master shape changed (%s does not have 3 steps per move); keeping old data" % x["templateId"])
        rec = {"attack": [step(r) for r in a[1:]], "guard": [step(r) for r in b], "spirit": [step(r) for r in c]}
        if g in out and out[g] != rec:
            sys.exit("two templates disagree about group %s; keeping old data" % g)
        out[g] = rec
    return out


def tier_groups(gm):
    by_dex = {}
    for x in gm:
        m = re.match(r"V(\d{4})_POKEMON_", x["templateId"])
        ps = (x.get("data") or {}).get("pokemonSettings")
        if not (m and ps and ps.get("breadTierGroup")):
            continue
        by_dex.setdefault(int(m.group(1)), []).append((ps.get("form"), str(ps["breadTierGroup"]).replace("GROUP_", "")))
    out = {}
    for dex, rows in sorted(by_dex.items()):
        base = Counter(g for _, g in rows).most_common(1)[0][0]
        out[str(dex)] = base
        for form, g in rows:
            if g != base and form:
                out["%d_%s" % (dex, form.lower())] = g
    return out


def move_ids(gm):
    types, gmax = {}, []
    for x in gm:
        mm = (x.get("data") or {}).get("breadMoveMappings")
        if mm:
            for r in mm["mappings"]:
                types[r["type"].replace("POKEMON_TYPE_", "").capitalize()] = r["move"]
    for x in gm:
        ms = (x.get("data") or {}).get("moveSettings")
        if ms and re.match(r"VN_BM_\d+$", x["templateId"]) and str(ms.get("vfxName", "")).startswith("gmax_"):
            gmax.append([x["templateId"], ms["pokemonType"].replace("POKEMON_TYPE_", "").capitalize(), ms["vfxName"]])
    return {"types": types, "gmax": sorted(gmax)}


def write_json(groups, costs, ids):
    tables = {"tierGroup": groups, "groupCosts": costs, "moveIds": ids}
    try:
        with open(JSON_PATH, encoding="utf-8") as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    if all(old.get(k) == v for k, v in tables.items()):
        return   # nothing changed: keep the old file (and its date) byte for byte
    out = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"), "source": SOURCE, **tables}
    os.makedirs(os.path.dirname(JSON_PATH), exist_ok=True)
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")


def main():
    gm = gm_lib.game_master(sys.argv[1] if len(sys.argv) > 1 else None)
    groups, costs, ids = tier_groups(gm), group_costs(gm), move_ids(gm)
    if len(groups) < MIN_SPECIES or not costs or len(ids["types"]) < 18 or not ids["gmax"]:
        sys.exit("game master shape changed (%d species, %d groups, %d types, %d g-max); keeping old data"
                 % (len(groups), len(costs), len(ids["types"]), len(ids["gmax"])))
    missing = sorted(set(groups.values()) - set(costs))
    if missing:
        sys.exit("species use groups with no cost template: %s; keeping old data" % missing)

    def dump(o):
        return json.dumps(o, separators=(",", ":"))

    src = open(MECH_PATH, encoding="utf-8").read()
    for name, obj in (("MAX_TIER_GROUP", groups), ("MAX_GROUP_COSTS", costs), ("MAX_MOVE_IDS", ids)):
        block = gm_lib.block_text(name, "import_max_data.py", "const %s = %s;" % (name, dump(obj)))
        src = gm_lib.replace_block(src, name, block, before=ANCHOR)
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    write_json(groups, costs, ids)
    print("species mapped:", len(groups), dict(sorted(Counter(groups.values()).items())), "| groups:", sorted(costs),
          "| max moves:", len(ids["types"]), "| g-max:", len(ids["gmax"]))


if __name__ == "__main__":
    main()
