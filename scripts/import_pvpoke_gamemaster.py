#!/usr/bin/env python3
"""
import_pvpoke_gamemaster.py — species info and PvP fast-move numbers from
PvPoke's open-source game master, written into pokemon-mechanics.js.

WHAT IT STORES
--------------
PVP_FAST_MOVES   fast move id -> [type, power, turns, energyGain]  (PvP numbers,
                 which differ from the raid numbers in AUTHORITATIVE_MOVES)
SPECIES_META     species id -> "type1/type2|buddyKm|secondChargedMoveStardust"
                 for every released species. Types here mean the app no longer
                 needs the AI type lookup to know a Pokemon's typing.
PVP_META_GREAT / PVP_META_ULTRA
                 the 25 best-ranked species in each league as
                 [id, atk, def, hp, fastMoveId] using PvPoke's default spread.
                 These are the opponents the IV breakpoint analysis measures
                 damage against.

SOURCES
-------
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/moves.json
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/pokemon.json
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json
https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json

USAGE
-----
    python3 scripts/import_pvpoke_gamemaster.py

Rewrites the PVPOKE_GM GENERATED BLOCK in pokemon-mechanics.js (same convention
as the other import_*.py scripts).
"""
import json
import re
import urllib.request

BASE = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/"
MOVES_URL = BASE + "gamemaster/moves.json"
POKEMON_URL = BASE + "gamemaster/pokemon.json"
GREAT_URL = BASE + "rankings/all/overall/rankings-1500.json"
ULTRA_URL = BASE + "rankings/all/overall/rankings-2500.json"
MECH_PATH = "pokemon-mechanics.js"
META_SIZE = 25


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as r:
        return json.load(r)


def fast_moves(moves):
    out = {}
    for m in moves:
        # Fast moves gain energy and cost none.
        if m.get("energyGain", 0) > 0 and not m.get("energy"):
            turns = m.get("turns") or max(1, round(m.get("cooldown", 500) / 500))
            out[m["moveId"].lower()] = [m["type"].capitalize(), m["power"], turns, m["energyGain"]]
    return out


def species_meta(pokemon):
    out = {}
    for p in pokemon:
        if p.get("released") is False:
            continue
        types = [t for t in p.get("types", []) if t and t != "none"]
        if not types:
            continue
        sid = p["speciesId"].lower()
        out[sid] = "%s|%s|%s" % ("/".join(types), p.get("buddyDistance", ""), p.get("thirdMoveCost", ""))
    return out


def meta_list(rankings):
    rows = []
    for row in rankings:
        st = row.get("stats") or {}
        moveset = row.get("moveset") or []
        if not moveset or "atk" not in st:
            continue
        rows.append([row["speciesId"].lower(), round(st["atk"], 2), round(st["def"], 2), round(st["hp"]), moveset[0].lower()])
        if len(rows) >= META_SIZE:
            break
    return rows


def main():
    fm = fast_moves(fetch(MOVES_URL))
    sm = species_meta(fetch(POKEMON_URL))
    great = meta_list(fetch(GREAT_URL))
    ultra = meta_list(fetch(ULTRA_URL))
    print(f"fast moves: {len(fm)}, species: {len(sm)}, meta great/ultra: {len(great)}/{len(ultra)}")
    print("  spot-check bulbasaur:", sm.get("bulbasaur"), "| acid:", fm.get("acid"), "| top great:", great[0])

    block = (
        "// GENERATED BLOCK: PVPOKE_GM (import_pvpoke_gamemaster.py) — do not hand-edit\n"
        "const PVP_FAST_MOVES = " + json.dumps(fm, separators=(",", ":")) + ";\n"
        "const SPECIES_META = " + json.dumps(sm, separators=(",", ":")) + ";\n"
        "const PVP_META_GREAT = " + json.dumps(great, separators=(",", ":")) + ";\n"
        "const PVP_META_ULTRA = " + json.dumps(ultra, separators=(",", ":")) + ";\n"
        "// END GENERATED BLOCK: PVPOKE_GM"
    )
    with open(MECH_PATH, "r", encoding="utf-8") as f:
        src = f.read()
    pattern = re.compile(r"// GENERATED BLOCK: PVPOKE_GM.*?// END GENERATED BLOCK: PVPOKE_GM", re.DOTALL)
    if pattern.search(src):
        src = pattern.sub(lambda _m: block, src)
        print("Updated existing PVPOKE_GM block.")
    else:
        anchor = "function pvpTierFor(name, isShadow, leagueKey) {"
        idx = src.index(anchor)
        src = src[:idx] + block + "\n\n" + src[idx:]
        print("Inserted new PVPOKE_GM block before pvpTierFor().")
    with open(MECH_PATH, "w", encoding="utf-8") as f:
        f.write(src)


if __name__ == "__main__":
    main()
