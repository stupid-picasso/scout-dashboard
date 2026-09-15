#!/usr/bin/env python3
"""
import_movepool_data.py — pulls each species' real learnable moveset from
Niantic's raw GAME_MASTER: the regular TM pool (quickMoves/cinematicMoves)
and the Elite-TM-only/legacy pool (eliteQuickMove/eliteCinematicMove),
separately. Same source and approach as import_move_data.py,
import_mega_data.py and import_evolution_data.py.

WHY THIS EXISTS
----------------
Two real gaps this closes:
1. The in-app move picker (detail sheet, USE A TM) lets you pick ANY move in
   the whole move database for any Pokemon, with no check against what that
   species can actually learn — nothing stopped you from setting a Water-type
   move on a Fire-type Pokemon. This gives the picker a real per-species list
   to filter against.
2. The AI TM recommendations had to caveat "suggested move is the AI's
   general knowledge, not verified against this app's own data" because there
   was no real per-species movepool to check a suggestion against. This
   closes that gap too.

SOURCE
------
  https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json

SCHEMA NOTES
------------
- pokemonSettings.quickMoves / .cinematicMoves are the REGULAR pool — what a
  plain Fast/Charged TM re-rolls between (random, no player choice).
- pokemonSettings.eliteQuickMove / .eliteCinematicMove are LEGACY/exclusive
  moves (Community Day moves, past-event exclusives, etc.) — only obtainable
  via an Elite TM, which is exactly why Elite TM is worth tracking separately
  from a regular one. Not every species has these; absent means none.
- Move IDs (e.g. "WATER_GUN_FAST", "HYDRO_CANNON", "WEATHER_BALL_FIRE") are
  converted to the app's existing AUTHORITATIVE_MOVES key format (lowercase,
  spaces, no "_FAST"/"_PVP" suffix) by the same transform used to build that
  table — verified against real entries ("hydro cannon", "weather ball fire",
  "hidden power") before trusting it at scale.
- Species name matching follows import_evolution_data.py's approach exactly
  (same NAME_OVERRIDES map, same pretty_name conversion) since the app keys
  everything by lowercase OCR-derived display name, not GAME_MASTER's
  ALL_CAPS pokemonId.
"""
import json
import re
import urllib.request

SOURCE_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"

# Same exceptions as import_evolution_data.py — kept in sync deliberately
# rather than imported, since these two scripts are run independently and a
# shared import would be one more thing to keep straight for no real benefit.
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


def move_key(move_id):
    # WATER_GUN_FAST -> "water gun", HYDRO_CANNON -> "hydro cannon",
    # WEATHER_BALL_FIRE -> "weather ball fire" (kept, it's a real distinct
    # move key in AUTHORITATIVE_MOVES, not a suffix to strip).
    base = re.sub(r"_FAST$", "", move_id)
    return base.replace("_", " ").lower()


def extract_movepools(gamemaster):
    found = {}
    for entry in gamemaster:
        template_id = entry.get("templateId", "")
        if "COPY" in template_id:
            continue
        ps = entry.get("data", {}).get("pokemonSettings")
        if not ps:
            continue
        quick = ps.get("quickMoves")
        cine = ps.get("cinematicMoves")
        if not quick and not cine:
            continue
        pokemon_id = ps.get("pokemonId")
        if not pokemon_id or pokemon_id in found:
            continue
        found[pretty_name(pokemon_id).lower()] = {
            "fast": sorted(set(move_key(m) for m in (quick or []) if isinstance(m, str))),
            "charge": sorted(set(move_key(m) for m in (cine or []) if isinstance(m, str))),
            "fastLegacy": sorted(set(move_key(m) for m in (ps.get("eliteQuickMove") or []) if isinstance(m, str))),
            "chargeLegacy": sorted(set(move_key(m) for m in (ps.get("eliteCinematicMove") or []) if isinstance(m, str))),
        }
    return found


def to_js_literal(table):
    lines = ["const MOVEPOOL_TABLE = {"]
    for name in sorted(table.keys()):
        rec = table[name]
        fast = json.dumps(rec["fast"])
        charge = json.dumps(rec["charge"])
        fast_legacy = json.dumps(rec["fastLegacy"])
        charge_legacy = json.dumps(rec["chargeLegacy"])
        lines.append(
            "  %s: { fast: %s, charge: %s, fastLegacy: %s, chargeLegacy: %s },"
            % (json.dumps(name), fast, charge, fast_legacy, charge_legacy)
        )
    lines.append("};")
    return "\n".join(lines)


if __name__ == "__main__":
    import sys
    local_path = sys.argv[1] if len(sys.argv) > 1 else None
    gm = fetch_gamemaster(local_path)
    table = extract_movepools(gm)
    print("// Generated by scripts/import_movepool_data.py from Niantic GAME_MASTER", file=sys.stderr)
    print("// %d species with movepool data" % len(table), file=sys.stderr)
    print(to_js_literal(table))
