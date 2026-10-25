#!/usr/bin/env python3
"""
import_species_class.py — which species are Legendary, Mythical or Ultra Beasts, from the game master.

Reads pokemonSettings.pokemonClass (POKEMON_CLASS_LEGENDARY / _MYTHIC / _ULTRA_BEAST) per Pokedex number and writes
the SPECIES_CLASS GENERATED BLOCK in pokemon-mechanics.js:
    SPECIES_CLASS["<dex>"] = "L" | "M" | "U"

Usage: python scripts/import_species_class.py [path-to-latest.json]   (downloads it when no path is given)
"""
import json, re, sys, urllib.request

URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
MECH_PATH = "pokemon-mechanics.js"
CODE = {"POKEMON_CLASS_LEGENDARY": "L", "POKEMON_CLASS_MYTHIC": "M", "POKEMON_CLASS_ULTRA_BEAST": "U"}


def main():
    if len(sys.argv) > 1:
        gm = json.load(open(sys.argv[1]))
    else:
        with urllib.request.urlopen(URL, timeout=180) as r:
            gm = json.load(r)
    out = {}
    for x in gm:
        m = re.match(r"V(\d{4})_POKEMON_", x["templateId"])
        ps = (x.get("data") or {}).get("pokemonSettings")
        if m and ps and ps.get("pokemonClass") in CODE:
            out[int(m.group(1))] = CODE[ps["pokemonClass"]]
    if len(out) < 100:
        sys.exit("game master shape changed (only %d classed species); keeping old data" % len(out))
    body = {str(k): v for k, v in sorted(out.items())}
    block = ("// GENERATED BLOCK: SPECIES_CLASS (import_species_class.py) — do not hand-edit\n"
             "const SPECIES_CLASS = " + json.dumps(body, separators=(",", ":")) + ";\n"
             "// END GENERATED BLOCK: SPECIES_CLASS")
    src = open(MECH_PATH, encoding="utf-8").read()
    pat = re.compile(r"// GENERATED BLOCK: SPECIES_CLASS.*?// END GENERATED BLOCK: SPECIES_CLASS", re.S)
    if pat.search(src):
        src = pat.sub(lambda _: block, src)
    else:
        anchor = "// END GENERATED BLOCK: SIZE_DATA"
        assert anchor in src
        src = src.replace(anchor, anchor + "\n\n" + block, 1)
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    c = {k: sum(1 for v in out.values() if v == k) for k in "LMU"}
    print("classed species:", len(out), c)


if __name__ == "__main__":
    main()
