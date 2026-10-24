#!/usr/bin/env python3
"""
import_size_data.py — per-species size data from Niantic's game master (PokeMiners mirror).

For every species and regional form: the Pokedex height (m) and weight (kg), and the six size
cut-offs the game uses (pokemonExtendedSettings.sizeSettings, in metres of HEIGHT):
    below xsLowerBound            -> XXS   (xxsLowerBound is the smallest height that exists)
    xsLowerBound .. mLowerBound   -> XS
    mLowerBound  .. mUpperBound   -> normal
    mUpperBound  .. xlUpperBound  -> XL
    above xlUpperBound            -> XXL   (xxlUpperBound is the tallest height that exists)
The meaning of the bounds is read from their values (for most species they are fixed ratios of the
Pokedex height: 0.49, 0.5, 0.75, 1.25, 1.5, 1.75), not from documentation; the game does not publish it.

Writes the SIZE_DATA GENERATED BLOCK in pokemon-mechanics.js:
    SIZE_DATA["<dex>"] or SIZE_DATA["<dex>_<form>"] = [heightM, weightKg, xxsLo, xsLo, mLo, mUp, xlUp, xxlUp]
Forms kept: alola, galarian, hisuian, paldea (the ones BASE_STATS_BY_FORM also knows).

Usage: python scripts/import_size_data.py [path-to-latest.json]   (downloads it when no path is given)
"""
import json, re, sys, urllib.request

URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
MECH_PATH = "pokemon-mechanics.js"
FORMS = {"alola", "galarian", "hisuian", "paldea"}


def key_for(dex, species, form):
    if not form:
        return str(dex)
    suffix = re.sub(r"^" + re.escape(species) + "_", "", form).lower()
    if suffix == "normal":
        return str(dex)
    return "%d_%s" % (dex, suffix) if suffix in FORMS else None


def main():
    if len(sys.argv) > 1:
        gm = json.load(open(sys.argv[1]))
    else:
        with urllib.request.urlopen(URL, timeout=180) as r:
            gm = json.load(r)
    body, bounds = {}, {}
    for x in gm:
        d = x.get("data", {})
        m = re.match(r"V(\d{4})_POKEMON_", x["templateId"])
        ps = d.get("pokemonSettings")
        if m and ps and ps.get("pokedexHeightM") and ps.get("pokedexWeightKg"):
            k = key_for(int(m.group(1)), ps["pokemonId"], ps.get("form"))
            if k and (k not in body or not ps.get("form") or ps["form"].endswith("_NORMAL")):
                body[k] = (ps["pokedexHeightM"], ps["pokedexWeightKg"])
        m = re.match(r"EXTENDED_V(\d{4})_POKEMON_", x["templateId"])
        ex = d.get("pokemonExtendedSettings")
        if m and ex and ex.get("sizeSettings"):
            s = ex["sizeSettings"]
            if all(k in s for k in ("xxsLowerBound", "xsLowerBound", "mLowerBound", "mUpperBound", "xlUpperBound", "xxlUpperBound")):
                k = key_for(int(m.group(1)), ex["uniqueId"], ex.get("form"))
                if k and (k not in bounds or not ex.get("form") or ex["form"].endswith("_NORMAL")):
                    bounds[k] = [s["xxsLowerBound"], s["xsLowerBound"], s["mLowerBound"], s["mUpperBound"], s["xlUpperBound"], s["xxlUpperBound"]]
    out = {}
    for k, (h, w) in body.items():
        if k in bounds:
            out[k] = [h, w] + [round(v, 4) for v in bounds[k]]
    if len(out) < 800:
        sys.exit("game master shape changed (only %d species with size data); keeping old data" % len(out))
    out = dict(sorted(out.items(), key=lambda kv: (int(kv[0].split("_")[0]), kv[0])))
    block = ("// GENERATED BLOCK: SIZE_DATA (import_size_data.py) — do not hand-edit\n"
             "const SIZE_DATA = " + json.dumps(out, separators=(",", ":")) + ";\n"
             "// END GENERATED BLOCK: SIZE_DATA")
    src = open(MECH_PATH, encoding="utf-8").read()
    pat = re.compile(r"// GENERATED BLOCK: SIZE_DATA.*?// END GENERATED BLOCK: SIZE_DATA", re.S)
    if pat.search(src):
        src = pat.sub(lambda _: block, src)
    else:
        anchor = "// END GENERATED BLOCK: MEGA_LEVEL_DATA"
        assert anchor in src
        src = src.replace(anchor, anchor + "\n\n" + block, 1)
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    print("species/forms with size data:", len(out), "| forms:", sum(1 for k in out if "_" in k))
    print(json.dumps({k: out[k] for k in ("1", "38", "38_alola") if k in out}))


if __name__ == "__main__":
    main()
