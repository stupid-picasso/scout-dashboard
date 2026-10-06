#!/usr/bin/env python3
"""
import_mega_levels.py — Mega Level rules from Niantic's game master (PokeMiners
mirror): per-level rest period, Mega Energy cost to skip the rest period, the
Mega Evolutions needed per level, and which species have a Super Max level.

HOW THE GAME USES THESE (templates MEGA_EVOLUTION_LEVEL_<n>[_V<dex>_POKEMON_<X>]
and MEGA_EVO_SETTINGS in the game master):
  - Level 0 = never Mega Evolved. `bypassCostInitial` is the first-time cost.
  - After a Mega Evolution the Pokemon rests for the level's `cooldown`. The
    energy cost to Mega Evolve during the rest is bypassCostInitial scaled by
    the rest left (verified against a 4-days-left Beedrill reading 11 energy:
    20 * 4/7 = 11.4). With no rest left it costs nothing.
  - Level 1/2/3 need 1 / 7 / 30 Mega Evolutions (pointsRequired, one point per
    Mega Evolution, at most one per rest period). Super Max (level 4) is
    unlocked by spending megaEnergyCostToUnlock energy.
  - A species with no template of its own uses the generic level template.

Writes the MEGA_LEVEL_DATA GENERATED BLOCK in pokemon-mechanics.js.
"""
import json, re, sys, urllib.request

URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
MECH_PATH = "pokemon-mechanics.js"


def main():
    with urllib.request.urlopen(URL, timeout=120) as r:
        gm = json.load(r)
    levels = {}  # species ('*' = generic) -> {level: settings}
    evo = None
    for x in gm:
        d = x.get("data", {})
        if x["templateId"] == "MEGA_EVO_SETTINGS":
            evo = d.get("megaEvoSettings")
        if "megaEvoLevelSettings" in d:
            m = re.match(r"MEGA_EVOLUTION_LEVEL_(\d)(?:_V\d+_POKEMON_(.*))?$", x["templateId"])
            if m:
                sp = (m.group(2) or "*").lower()
                levels.setdefault(sp, {})[int(m.group(1))] = d["megaEvoLevelSettings"]
    gen = levels.get("*")
    if not gen or sorted(gen) != [0, 1, 2, 3] or not evo:
        sys.exit("game master shape changed; keeping old data")
    days = lambda s: round(int(s["cooldown"]["durationMs"]) / 86400000, 4)
    out = {
        "evolveHours": int(evo["evolutionLengthMs"]) / 3600000,
        # MEGA_EVO_SETTINGS.numMegaLevels: the number of Mega Level dots the game draws
        # for every species (Super Max is a dot too, even where it is not unlocked yet).
        "dots": evo["numMegaLevels"],
        "generic": {
            "cost": [gen[l]["cooldown"]["bypassCostInitial"] for l in range(4)],
            "restDays": [days(gen[l]) for l in range(4)],
            "evosNeeded": [0] + [gen[l]["progression"]["pointsRequired"] for l in (1, 2, 3)],
        },
        "species": {},
    }
    unlock = None
    for sp, lv in sorted(levels.items()):
        if sp == "*":
            continue
        n = max(lv)
        if 0 not in lv or n < 3:
            continue
        ent = {"cost": [lv[l]["cooldown"]["bypassCostInitial"] for l in range(n + 1)],
               "restDays": [days(lv[l]) for l in range(n + 1)]}
        if n == 4:
            unlock = lv[4].get("megaEnergyCostToUnlock", unlock)
        out["species"][sp] = ent
    out["superMaxUnlock"] = unlock
    # Mega forms: base stats and types, for raid / PvP ratings of the Mega Evolved Pokemon.
    # tempEvoId TEMP_EVOLUTION_MEGA[_X|_Y]; Primal Reversion is a different mechanic (no energy).
    forms = {}
    for x in gm:
        ps = x.get("data", {}).get("pokemonSettings")
        if not ps or not re.match(r"V\d+_POKEMON_", x["templateId"]) or not ps.get("tempEvoOverrides"):
            continue
        sp = ps["pokemonId"].lower()
        for t in ps["tempEvoOverrides"]:
            m = re.fullmatch(r"TEMP_EVOLUTION_MEGA(?:_([XY]))?", t.get("tempEvoId", ""))
            st = t.get("stats") or {}
            if not m or not st:
                continue
            types = [t[k].replace("POKEMON_TYPE_", "").title() for k in ("typeOverride1", "typeOverride2") if t.get(k)]
            if any(f["form"] == (m.group(1) or "").lower() for f in forms.get(sp, [])):
                continue  # the same Mega appears on several templates (e.g. form variants)
            forms.setdefault(sp, []).append({"form": (m.group(1) or "").lower(), "base": [st["baseAttack"], st["baseDefense"], st["baseStamina"]], "types": types})
    out["forms"] = forms
    block = ("// GENERATED BLOCK: MEGA_LEVEL_DATA (import_mega_levels.py) — do not hand-edit\n"
             "const MEGA_LEVEL_DATA = " + json.dumps(out, separators=(",", ":")) + ";\n"
             "// END GENERATED BLOCK: MEGA_LEVEL_DATA")
    src = open(MECH_PATH, encoding="utf-8").read()
    pat = re.compile(r"// GENERATED BLOCK: MEGA_LEVEL_DATA.*?// END GENERATED BLOCK: MEGA_LEVEL_DATA", re.S)
    if pat.search(src):
        src = pat.sub(lambda _: block, src)
    else:
        a = "function megaEvolveCostFor(name, everMegaEvolved) {"
        src = src.replace(a, block + "\n\n" + a, 1)
    open(MECH_PATH, "w", encoding="utf-8").write(src)
    print("species with own levels:", len(out["species"]), "superMaxUnlock:", unlock, "evolveHours:", out["evolveHours"])
    print(json.dumps(out["generic"]), json.dumps(out["species"].get("beedrill")), json.dumps(out["species"].get("mewtwo")))


if __name__ == "__main__":
    main()
