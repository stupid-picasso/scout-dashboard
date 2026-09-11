#!/usr/bin/env python3
"""
import_evolution_data.py — pulls real per-species evolution data (next stage,
candy cost, required item) from Niantic's raw GAME_MASTER, same source and
approach as import_move_data.py and import_mega_data.py.

WHY THIS EXISTS
----------------
Scout's evoTable (the roster's evolve-readiness data) was entirely
Gemini-guessed: a species name goes to the model, it returns a guessed
evolvesTo/candy/item, no ground truth involved. That's the same category of
risk the move-data rewrite already fixed once (PvPoke's Trainer Battle stats
being used for Gym & Raid context). This gives evoTable a real floor: for any
species GAME_MASTER covers, the app can use real data instead of a guess, and
only fall back to the AI table for anything GAME_MASTER doesn't have (new
species before a GAME_MASTER update, unusual forms, etc.)

SOURCE
------
  https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json

SCHEMA NOTES
------------
- pokemonSettings.evolutionBranch entries with `evolution` + `candyCost` set
  (and NOT a `temporaryEvolution` — those are Mega/Primal, handled by
  import_mega_data.py) are normal evolutions.
- `evolutionItemRequirement`, when present, is one of only 6 real values
  across the entire dataset (verified by walking every entry): SUN_STONE,
  KINGS_ROCK, METAL_COAT, DRAGON_SCALE, UP_GRADE, GEN4_EVOLUTION_STONE
  (Sinnoh Stone), GEN5_EVOLUTION_STONE (Unova Stone), OTHER_EVOLUTION_STONE_A
  (Gimmighoul Coins, Gholdengo only), and the three Applin MAPLE variants
  (Sweet/Tart/Syrupy Apple, confirmed by cross-referencing which species uses
  each — GAME_MASTER's own naming doesn't say). ITEM_BEANS (Zygarde) is
  deliberately excluded: it's a cell-collection mechanic, not a countable bag
  item the way the others are, so it doesn't fit the evolutionItems tracker.
  Every other classic evolution item (Deep Sea Tooth/Scale, Prism Scale,
  Reaper Cloth, Protector, etc.) is NOT used as an item gate in Pokemon GO —
  confirmed by the fact that walking the entire dataset never produces those
  values; Niantic made those evolutions candy-only here.
- Some species have multiple evolution branches (Eevee's 8 eeveelutions,
  Poliwhirl -> Poliwrath/Politoed, Slowpoke -> Slowbro/Slowking). The current
  app data model (evoTable) only ever stores ONE evolvesTo per species — this
  matches that existing constraint rather than expanding scope; the first
  branch in GAME_MASTER's own array order is used, same arbitrary-but-stable
  choice the AI guesser was already implicitly making.
- Species name matching: the app's roster/candy keys are lowercase, OCR-read
  display names (e.g. "mr. mime", "farfetch'd", "ho-oh"), NOT GAME_MASTER's
  ALL_CAPS pokemonId or the DEX_NAMES table's PokeAPI-style slugs (which are
  a different convention, e.g. "farfetchd", used for sprite URLs elsewhere in
  this codebase — confirmed by inspection before reusing anything from it).
  A small manual override map below handles the known punctuation cases;
  anything not in it gets a plain Title Case conversion. A wrong or missing
  name here just means that species' entry never matches at lookup time and
  the app falls back to evoTable, not a hard failure.
"""
import json
import re
import urllib.request

SOURCE_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"

ITEM_LABELS = {
    "ITEM_SUN_STONE": ("sunStone", "Sun Stone"),
    "ITEM_KINGS_ROCK": ("kingsRock", "King's Rock"),
    "ITEM_METAL_COAT": ("metalCoat", "Metal Coat"),
    "ITEM_DRAGON_SCALE": ("dragonScale", "Dragon Scale"),
    "ITEM_UP_GRADE": ("upgrade", "Upgrade"),
    "ITEM_GEN4_EVOLUTION_STONE": ("sinnohStone", "Sinnoh Stone"),
    "ITEM_GEN5_EVOLUTION_STONE": ("unovaStone", "Unova Stone"),
    "ITEM_OTHER_EVOLUTION_STONE_A": ("gimmighoulCoins", "Gimmighoul Coins"),
    "ITEM_OTHER_EVOLUTION_STONE_MAPLE_A": ("sweetApple", "Sweet Apple"),
    "ITEM_OTHER_EVOLUTION_STONE_MAPLE_B": ("tartApple", "Tart Apple"),
    "ITEM_OTHER_EVOLUTION_STONE_MAPLE_C": ("syrupyApple", "Syrupy Apple"),
    # ITEM_BEANS (Zygarde) intentionally omitted — see module docstring.
}

# Known punctuation/casing exceptions where a plain Title Case conversion of
# the GAME_MASTER pokemonId would not match the app's OCR-derived display name.
NAME_OVERRIDES = {
    "MR_MIME": "Mr. Mime",
    "MR_RIME": "Mr. Rime",
    "MIME_JR": "Mime Jr.",
    "FARFETCHD": "Farfetch'd",
    "SIRFETCHD": "Sirfetch'd",
    "HO_OH": "Ho-Oh",
    "PORYGON_Z": "Porygon-Z",
    "JANGMO_O": "Jangmo-o",
    "HAKAMO_O": "Hakamo-o",
    "KOMMO_O": "Kommo-o",
    "NIDORAN_FEMALE": "Nidoran\u2640",
    "NIDORAN_MALE": "Nidoran\u2642",
    "TYPE_NULL": "Type: Null",
    "FLABEBE": "Flab\u00e9b\u00e9",
    "WO_CHIEN": "Wo-Chien",
    "CHIEN_PAO": "Chien-Pao",
    "TING_LU": "Ting-Lu",
    "CHI_YU": "Chi-Yu",
}


def fetch_gamemaster(path=None):
    if path:
        with open(path) as f:
            return json.load(f)
    with urllib.request.urlopen(SOURCE_URL) as r:
        return json.load(r)


def pretty_name(pokemon_id):
    if pokemon_id in NAME_OVERRIDES:
        return NAME_OVERRIDES[pokemon_id]
    words = pokemon_id.replace("-", "_").split("_")
    return " ".join(w.capitalize() for w in words)


def extract_evolutions(gamemaster):
    found = {}
    for entry in gamemaster:
        template_id = entry.get("templateId", "")
        if "COPY" in template_id:
            continue
        ps = entry.get("data", {}).get("pokemonSettings")
        if not ps:
            continue
        branch = ps.get("evolutionBranch")
        if not branch:
            continue
        normal = [
            b for b in branch
            if b.get("evolution") and b.get("candyCost") is not None
            and not b.get("temporaryEvolution")
        ]
        if not normal:
            continue
        pokemon_id = ps.get("pokemonId")
        if not pokemon_id or pokemon_id in found:
            continue
        # Branch selection: most branching species (Eevee, Wurmple, Tyrogue,
        # Kirlia, etc.) split on gender/nature/friendship, not items, and
        # picking any one branch is an equally arbitrary simplification of
        # this app's single-target data model. Poliwhirl and Slowpoke are
        # different — their second branch (Politoed, Slowking) is the ONLY
        # item-gated evolution for that species, and item-readiness is
        # exactly what this table exists to surface, so those two names
        # specifically prefer the item branch over plain array order.
        b = normal[0]
        if pokemon_id in ("POLIWHIRL", "SLOWPOKE"):
            item_branch = next((x for x in normal if x.get("evolutionItemRequirement")), None)
            if item_branch:
                b = item_branch
        item_req = b.get("evolutionItemRequirement")
        item_key = item_label = None
        if item_req and item_req in ITEM_LABELS:
            item_key, item_label = ITEM_LABELS[item_req]
        found[pretty_name(pokemon_id).lower()] = {
            "to": pretty_name(b["evolution"]),
            "candy": b["candyCost"],
            "itemKey": item_key,
            "itemLabel": item_label,
        }
    return found


def to_js_literal(table):
    lines = ["const REAL_EVOLUTION_TABLE = {"]
    for name in sorted(table.keys()):
        rec = table[name]
        item_key = json.dumps(rec["itemKey"]) if rec["itemKey"] else "null"
        item_label = json.dumps(rec["itemLabel"]) if rec["itemLabel"] else "null"
        lines.append(
            "  %s: { to: %s, candy: %d, itemKey: %s, itemLabel: %s },"
            % (json.dumps(name), json.dumps(rec["to"]), rec["candy"], item_key, item_label)
        )
    lines.append("};")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    local_path = sys.argv[1] if len(sys.argv) > 1 else None
    gm = fetch_gamemaster(local_path)
    table = extract_evolutions(gm)
    print("// Generated by scripts/import_evolution_data.py from Niantic GAME_MASTER", file=sys.stderr)
    print("// %d species with real evolution data" % len(table), file=sys.stderr)
    print(to_js_literal(table))
