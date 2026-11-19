#!/usr/bin/env python3
"""
import_species_class.py — which species are Legendary, Mythical or Ultra Beasts, from the game master.

Reads pokemonSettings.pokemonClass (POKEMON_CLASS_LEGENDARY / _MYTHIC / _ULTRA_BEAST) per Pokedex number and writes
the SPECIES_CLASS GENERATED BLOCK in pokemon-mechanics.js:
    SPECIES_CLASS["<dex>"] = "L" | "M" | "U"

Usage: python scripts/import_species_class.py [path-to-latest.json]   (downloads it when no path is given)
"""
import json, re, sys

import gm_lib

MECH_PATH = "pokemon-mechanics.js"
MIN_SPECIES = 100   # fewer classed species than this means the game master changed shape
CODE = {"POKEMON_CLASS_LEGENDARY": "L", "POKEMON_CLASS_MYTHIC": "M", "POKEMON_CLASS_ULTRA_BEAST": "U"}


def main():
    gm = gm_lib.game_master(sys.argv[1] if len(sys.argv) > 1 else None)
    out = {}
    for x in gm:
        m = re.match(r"V(\d{4})_POKEMON_", x["templateId"])
        ps = (x.get("data") or {}).get("pokemonSettings")
        if m and ps and ps.get("pokemonClass") in CODE:
            out[int(m.group(1))] = CODE[ps["pokemonClass"]]
    if len(out) < MIN_SPECIES:
        sys.exit("game master shape changed (only %d classed species); keeping old data" % len(out))
    body = {str(k): v for k, v in sorted(out.items())}
    block = gm_lib.block_text("SPECIES_CLASS", "import_species_class.py", "const SPECIES_CLASS = " + json.dumps(body, separators=(",", ":")) + ";")
    src = gm_lib.replace_block(open(MECH_PATH, encoding="utf-8").read(), "SPECIES_CLASS", block, after="SIZE_DATA")
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    c = {k: sum(1 for v in out.values() if v == k) for k in "LMU"}
    print("classed species:", len(out), c)


if __name__ == "__main__":
    main()
