#!/usr/bin/env python3
"""
import_move_data.py — converts Niantic's raw GAME_MASTER (via PokeMiners'
community mirror) into the exact record shape pokemon-mechanics.js /
Scout Dashboard.dc.html expect (`{ type, power, energy, durationMs, kind }`,
keyed by lowercased move name), and writes it out as an embeddable JS object
literal.

WHY THIS EXISTS (and why it changed from pulling PvPoke's gamemaster.json)
----------------------------------------------------------------------------
This app never simulates a PvP battle — it only ranks Pokemon for PvP via
CP/stat-product (rankPctForLeague), which needs no move data at all. Every
place move data actually gets used (Attackers board, Raid Counters, the move
detail damage/DPS display) is a Gym & Raid context.

The previous version of this script pulled from PvPoke's gamemaster.json.
PvPoke is a PvP battle simulator, so its move list is built entirely from
Niantic's `combatMove` templates — the Trainer-Battle-specific stat overrides
— not the base Gym & Raid `moveSettings` templates. For a lot of moves these
two contexts have genuinely different power, energy cost, and duration
(Niantic balances them separately), so every damage number this app ever
displayed was quietly using PvP stats for a screen that is never PvP:

    Move       | Gym & Raid (moveSettings)   | Trainer Battle (combatMove)
    -----------|-----------------------------|------------------------------
    Mud Shot   | power 4,  energy +6, 0.5s   | power 3,  energy +9
    Sand Tomb  | power 60, energy -33, 4.0s  | power 40, energy -40
    Outrage    | power 110, energy -50, 4.0s | power 110, energy -60

Verified directly against PokeMiners/game_masters' raw latest.json — see
each template's `data.moveSettings` (Gym & Raid, this script's source) versus
`data.combatMove` (PvP, explicitly NOT used here) for the exact fields.

SOURCE
------
  https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json

This is the actual Niantic GAME_MASTER dump (PokeMiners mines and republishes
it verbatim, un-modified) — the same authority tier the base-stats table
already uses, and a primary source rather than a derivative of one.

SCHEMA NOTES
------------
- A template counts as move data if `data.moveSettings` exists (the base,
  non-"COMBAT_"-prefixed template). `data.combatMove` templates are the PvP
  override and are deliberately never read.
- kind (fast vs charged) is decided by the SIGN of `energyDelta`, not by
  templateId naming — most fast moves have a `_FAST` suffix, but at least
  one real exclusive move (Blastoise's Community Day Water Gun) does not,
  while every fast move without exception has energyDelta > 0 and every
  charged move has energyDelta <= 0.
- `energy` is stored as a positive number in both directions (an amount
  gained for fast, an amount spent for charged) — the sign is implicit in
  `kind`, matching how the rest of this app already reads the field.
- Display name comes from `movementId` (e.g. "MUD_SHOT_FAST" -> "Mud Shot"),
  stripping a trailing "_FAST" before title-casing.
- No duplicate movementIds were found in Gym & Raid `moveSettings` templates
  as of this writing (checked directly against the raw dump) — unlike the
  old PvP-sourced table, there is no "legacy move" ambiguity to resolve here,
  since Niantic doesn't appear to keep old Gym & Raid stat blocks the way it
  keeps old PvP-season stat blocks. If a future GAME_MASTER update
  introduces one, this script excludes the name entirely (see `convert()`)
  rather than silently guessing, same policy as before.

USAGE
-----
  python3 scripts/import_move_data.py [path-to-latest.json]

  Defaults to fetching the latest raw GAME_MASTER from PokeMiners' GitHub
  mirror if no local path is given. Writes
  scripts/_authoritative_moves.js.snippet — paste its contents into
  pokemon-mechanics.js manually (kept as a separate, reviewable step rather
  than auto-editing the source file, since this touches a hand-maintained
  constants block).
"""
import sys
import os
import json
import urllib.request

GAMEMASTER_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_authoritative_moves.js.snippet")

TYPE_PREFIX = "POKEMON_TYPE_"


def load_gamemaster(path_arg):
    if path_arg:
        with open(path_arg) as f:
            return json.load(f)
    with urllib.request.urlopen(GAMEMASTER_URL, timeout=60) as resp:
        return json.loads(resp.read())


def title_case_type(raw_type):
    # "POKEMON_TYPE_GROUND" -> "Ground"
    t = raw_type[len(TYPE_PREFIX):] if raw_type and raw_type.startswith(TYPE_PREFIX) else (raw_type or "")
    return t[:1].upper() + t[1:].lower() if t else t


def display_name(movement_id, template_id=""):
    if not isinstance(movement_id, str) or not movement_id:
        # Rare PokeMiners obfuscation gap (movementId left as a raw int for a
        # few templates, e.g. Aura Wheel's two forms, Dynamax Cannon) — fall
        # back to the templateId itself: "V0482_MOVE_DYNAMAX_CANNON" -> the
        # part after "_MOVE_".
        parts = template_id.split("_MOVE_", 1)
        movement_id = parts[1] if len(parts) == 2 else template_id
    base = movement_id[:-len("_FAST")] if movement_id.endswith("_FAST") else movement_id
    return " ".join(w.capitalize() for w in base.split("_"))


def convert(gamemaster):
    by_key = {}
    skipped = []
    conflicting_keys = set()
    for entry in gamemaster:
        data = entry.get("data", {})
        ms = data.get("moveSettings")
        if not ms:
            continue  # combatMove (PvP) or unrelated template — not this script's source
        movement_id = ms.get("movementId")
        move_type = ms.get("pokemonType")
        power = ms.get("power")
        duration_ms = ms.get("durationMs")
        energy_delta = ms.get("energyDelta", 0)
        if not movement_id or not move_type or power is None or duration_ms is None:
            skipped.append(entry.get("templateId", "?"))
            continue
        is_fast = energy_delta > 0
        key = display_name(movement_id, entry.get("templateId", "")).strip().lower()
        record = {
            "type": title_case_type(move_type),
            "power": power,
            "energy": abs(energy_delta),
            "durationMs": duration_ms,
            "kind": "fast" if is_fast else "charged",
        }
        if key in by_key and by_key[key] != record:
            conflicting_keys.add(key)
            skipped.append(f"{key} (conflicting Gym & Raid stats under one name, excluded)")
            continue
        by_key[key] = record

    out = {k: v for k, v in by_key.items() if k not in conflicting_keys}
    return out, skipped


def to_js_object_literal(moves_dict):
    lines = ["const AUTHORITATIVE_MOVES = {"]
    for key in sorted(moves_dict.keys()):
        r = moves_dict[key]
        lines.append(
            "  %s: { type: %s, power: %d, energy: %d, durationMs: %d, kind: %s },"
            % (
                json.dumps(key),
                json.dumps(r["type"]),
                r["power"],
                r["energy"],
                r["durationMs"],
                json.dumps(r["kind"]),
            )
        )
    lines.append("};")
    return "\n".join(lines)


def main():
    path_arg = sys.argv[1] if len(sys.argv) > 1 else None
    gamemaster = load_gamemaster(path_arg)
    moves_dict, skipped = convert(gamemaster)

    js = to_js_object_literal(moves_dict)
    with open(OUT_PATH, "w") as f:
        f.write(js + "\n")

    print(f"Converted {len(moves_dict)} moves (Gym & Raid stats, from raw GAME_MASTER moveSettings).")
    if skipped:
        print(f"Skipped {len(skipped)} entries (missing required fields or name collision):")
        for s in skipped[:20]:
            print(f"  {s}")
    print(f"\nWrote {OUT_PATH}")
    print("Paste its contents into pokemon-mechanics.js as a new top-level const,")
    print("and add AUTHORITATIVE_MOVES to the window.PokemonMechanics export list.")


if __name__ == "__main__":
    main()
