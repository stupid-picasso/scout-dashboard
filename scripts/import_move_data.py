#!/usr/bin/env python3
"""
import_move_data.py — converts PvPoke's gamemaster.json move list into the
exact record shape pokemon-mechanics.js / Scout Dashboard.dc.html expect
(`{ type, power, energy, durationMs, kind }`, keyed by lowercased move name),
and writes it out as an embeddable JS object literal.

WHY THIS EXISTS
----------------
moveDB was previously populated per-user by asking Gemini "what's this
move's power/energy/duration" — an LLM guess, not verified data, and every
user had to burn API calls to fill in their own copy. gamemaster.json is
community-maintained from Niantic's actual GAME_MASTER (via PokeMiners),
same authority tier the base-stats table already uses. This script produces
a table baked directly into pokemon-mechanics.js so every user gets complete,
accurate move data with zero setup and zero API calls — the AI-fetch flow
stays only as a fallback for anything genuinely missing.

DURATION MAPPING NOTE
----------------------
gamemaster.json's `cooldown` field is PVP-specific simulation timing (it
includes buffering Niantic added for the turn-based PVP system) — NOT the
real animation length. For gym/raid DPS (what this app's attackerScore /
cycleDps actually compute), the correct duration is `turns * 500ms`, the
standard convention GamePress and other raid calculators use. Using
`cooldown` here would silently produce wrong DPS numbers for raids while
looking plausible.

USAGE
-----
  python3 scripts/import_move_data.py [path-to-gamemaster.json]

  Defaults to fetching the latest gamemaster.json from GitHub if no local
  path is given. Writes scripts/_authoritative_moves.js.snippet — paste
  its contents into pokemon-mechanics.js manually (kept as a separate,
  reviewable step rather than auto-editing the source file, since this
  touches a hand-maintained constants block).
"""
import sys
import os
import json
import urllib.request

GAMEMASTER_URL = "https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json"
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_authoritative_moves.js.snippet")


def load_gamemaster(path_arg):
    if path_arg:
        with open(path_arg) as f:
            return json.load(f)
    with urllib.request.urlopen(GAMEMASTER_URL, timeout=30) as resp:
        return json.loads(resp.read())


def title_case_type(t):
    return t[:1].upper() + t[1:].lower() if t else t


def convert(gamemaster):
    moves = gamemaster.get("moves", [])
    by_key = {}
    skipped = []
    conflicting_keys = set()
    for m in moves:
        name = m.get("name")
        move_type = m.get("type")
        power = m.get("power")
        turns = m.get("turns")
        if not name or not move_type or power is None or turns is None:
            skipped.append(m.get("moveId", "?"))
            continue
        is_fast = bool(m.get("energyGain"))
        key = name.strip().lower()
        record = {
            "type": title_case_type(move_type),
            "power": power,
            "energy": m.get("energyGain") if is_fast else m.get("energy", 0),
            "durationMs": turns * 500,
            "kind": "fast" if is_fast else "charged",
        }
        if key in by_key and by_key[key] != record:
            # Same display name, different stats — usually a Niantic move
            # rebalance where the gamemaster retains a legacy stat block
            # under the same name (e.g. an older Community Day exclusive),
            # or a form-dependent move (Morpeko's Aura Wheel). No reliable
            # way to tell which record actually applies to a given roster
            # entry, so exclude the name entirely rather than silently
            # picking one that might be wrong — it falls back to the
            # existing AI-lookup path instead, same as any move this table
            # doesn't cover.
            conflicting_keys.add(key)
            skipped.append(f"{name} (conflicting stats under one name, excluded — see gamemaster for detail)")
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

    print(f"Converted {len(moves_dict)} moves.")
    if skipped:
        print(f"Skipped {len(skipped)} entries (missing required fields or name collision):")
        for s in skipped[:20]:
            print(f"  {s}")
    print(f"\nWrote {OUT_PATH}")
    print("Paste its contents into pokemon-mechanics.js as a new top-level const,")
    print("and add AUTHORITATIVE_MOVES to the window.PokemonMechanics export list.")


if __name__ == "__main__":
    main()
