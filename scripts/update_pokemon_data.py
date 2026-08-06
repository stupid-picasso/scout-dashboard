#!/usr/bin/env python3
"""
Weekly Pokemon data refresh.

Pulls the latest authoritative Pokemon GO base stats from pogoapi.net and
compares against this repo's pokemon-mechanics.js. Two kinds of changes are
possible:

  1. Stat corrections for Pokemon we already track (dex already in
     BASE_STATS/DEX_NAMES, atk/def/sta values differ). These are safe,
     mechanical, low-risk edits -> applied directly and auto-committed.

  2. Brand-new Pokemon (dex number not yet in DEX_NAMES at all, e.g. a new
     game update). These need a name, base stats, AND a sprite -> written to
     a separate file (new_pokemon.json) and left for the workflow to open as
     a PR instead of auto-committing, since a sprite needs fetching/review.

GITHUB_OUTPUT flags tell the workflow what happened so it can decide whether
to commit-to-main, open a PR, both, or do nothing.
"""
import json
import os
import re
import sys
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MECH_PATH = os.path.join(REPO_ROOT, "pokemon-mechanics.js")
NEW_POKEMON_PATH = os.path.join(REPO_ROOT, "data", "new_pokemon.json")
SPRITE_DIR = os.path.join(REPO_ROOT, "sprites")

POGOAPI_STATS_URL = "https://pogoapi.net/api/v1/pokemon_stats.json"
# The two tables the IV solver runs on. Both are derived from Niantic's own
# GAME_MASTER (PokeMiners mirrors the raw file; pogoapi.net republishes the
# relevant slices as clean JSON), which is the same source PokeGenie/CalcyIV
# ultimately read. Hand-typing either one is how the level 41+ Stardust tiers
# ended up wrong, so both are now regenerated from the API on every run.
POGOAPI_CPM_URL = "https://pogoapi.net/api/v1/cp_multiplier.json"
POGOAPI_POWERUP_URL = "https://pogoapi.net/api/v1/pokemon_powerup_requirements.json"
# Public sprite source used only for brand-new dex numbers we don't have a
# local sprite for yet (existing 1025 sprites are untouched).
SPRITE_URL_TEMPLATE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{dex}.png"


USER_AGENT = "scout-dashboard-pokemon-data-updater/1.0 (+https://github.com/stupid-picasso/scout-dashboard)"


def _request(url):
    return urllib.request.Request(url, headers={"User-Agent": USER_AGENT})


def fetch_json(url):
    with urllib.request.urlopen(_request(url), timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_bytes(url):
    with urllib.request.urlopen(_request(url), timeout=60) as resp:
        return resp.read()


def load_current():
    content = open(MECH_PATH, encoding="utf-8").read()

    m = re.search(r"const BASE_STATS = \{(.*?)\n\};", content, re.S)
    base_stats = {}
    for match in re.finditer(r"(\d+):\[(\d+),(\d+),(\d+)\]", m.group(1)):
        base_stats[int(match.group(1))] = [
            int(match.group(2)), int(match.group(3)), int(match.group(4))
        ]

    m2 = re.search(r'const DEX_NAMES = \{(.*?)\n\};', content, re.S)
    dex_names = {}
    for match in re.finditer(r'(\d+):"([^"]+)"', m2.group(1)):
        dex_names[int(match.group(1))] = match.group(2)

    return content, base_stats, dex_names, max(dex_names)


def build_authoritative():
    """dex -> (name, [atk,def,sta]), preferring the Normal form entry."""
    raw = fetch_json(POGOAPI_STATS_URL)
    by_dex = {}
    for entry in raw:
        dex = entry["pokemon_id"]
        stats = [entry["base_attack"], entry["base_defense"], entry["base_stamina"]]
        form = entry.get("form") or ""
        is_normal = form.lower() in ("normal", "")
        if dex not in by_dex or is_normal:
            by_dex[dex] = (entry["pokemon_name"], stats, is_normal)
    return {dex: (name, stats) for dex, (name, stats, _) in by_dex.items()}


def build_cpm_block():
    """Rebuilds the CPM literal from the authoritative CP-multiplier table."""
    raw = fetch_json(POGOAPI_CPM_URL)

    def pick(entry, *names):
        for n in names:
            if n in entry:
                return entry[n]
        raise KeyError(f"none of {names} in cp_multiplier entry {entry!r}")

    rows = sorted(
        (
            (
                float(pick(e, "level", "pokemon_level")),
                float(pick(e, "multiplier", "cp_multiplier")),
            )
            for e in raw
        ),
        key=lambda r: r[0],
    )
    if not rows:
        raise ValueError("cp_multiplier.json returned no rows")

    def fmt_level(level):
        return str(int(level)) if level == int(level) else str(level)

    def fmt_mult(mult):
        text = f"{mult:.8f}".rstrip("0")
        return text + "0" if text.endswith(".") else text

    cells = [f"{fmt_level(lvl)}: {fmt_mult(mult)}" for lvl, mult in rows]
    lines = ["  " + ", ".join(cells[i:i + 6]) + "," for i in range(0, len(cells), 6)]
    lines[-1] = lines[-1].rstrip(",")
    return "const CPM = {\n" + "\n".join(lines) + "\n};", len(rows)


def build_dust_tier_block():
    """Rebuilds _DUST_TIER_START_LEVEL: the first level of each Stardust tier.

    The API gives a cost per half-level. A tier is a RUN of consecutive
    half-levels sharing one cost, so the runs are derived here rather than
    assuming every tier spans exactly four half-levels -- that assumption is
    what let the hand-typed level 41+ values drift out of sync with the game.
    """
    raw = fetch_json(POGOAPI_POWERUP_URL)
    rows = sorted(
        ((float(v["current_level"]), int(v["stardust_to_upgrade"])) for v in raw.values()),
        key=lambda r: r[0],
    )
    if not rows:
        raise ValueError("pokemon_powerup_requirements.json returned no rows")

    tiers = []
    prev_dust = None
    for level, dust in rows:
        if dust != prev_dust:
            tiers.append((level, dust))
            prev_dust = dust

    cells = [f"[{level:.1f}, {dust}]" for level, dust in tiers]
    lines = ["  " + ", ".join(cells[i:i + 5]) + "," for i in range(0, len(cells), 5)]
    return "const _DUST_TIER_START_LEVEL = [\n" + "\n".join(lines) + "\n];", len(tiers)


def replace_block(content, start_marker, end_marker, new_block):
    """Swaps the text from start_marker through the FIRST following end_marker.

    Returns (content, changed). A missing marker is a warning, not a crash: a
    failed refresh must leave the existing (working) table in place.
    """
    start = content.find(start_marker)
    if start == -1:
        print(f"WARNING: could not find {start_marker!r} to regenerate", file=sys.stderr)
        return content, False
    end = content.find(end_marker, start + len(start_marker))
    if end == -1:
        print(f"WARNING: no {end_marker!r} after {start_marker!r}", file=sys.stderr)
        return content, False
    end += len(end_marker)
    if content[start:end] == new_block:
        return content, False
    return content[:start] + new_block + content[end:], True


def main():
    content, base_stats, dex_names, last_dex = load_current()
    authoritative = build_authoritative()

    stat_fixes = {}  # dex -> new [atk,def,sta]
    new_pokemon = {}  # dex -> {name, stats}

    for dex, (name, stats) in authoritative.items():
        if dex in base_stats:
            if base_stats[dex] != stats:
                stat_fixes[dex] = stats
        else:
            new_pokemon[dex] = {"name": name, "stats": stats}

    changed_mech = False

    # Mechanics tables first: these drive every IV / CP / level calculation, so
    # drift here is worse than a missing species. Each refresh is independently
    # guarded -- an API outage leaves the existing table alone rather than
    # blanking the solver's inputs.
    mech_table_fixes = 0

    try:
        cpm_block, cpm_rows = build_cpm_block()
        content, did = replace_block(content, "const CPM = {", "\n};", cpm_block)
        if did:
            changed_mech = True
            mech_table_fixes += 1
            print(f"Regenerated CPM table from pogoapi.net ({cpm_rows} levels)")
    except Exception as e:
        print(f"WARNING: CPM refresh failed, keeping existing table: {e}", file=sys.stderr)

    try:
        dust_block, dust_tiers = build_dust_tier_block()
        content, did = replace_block(
            content, "const _DUST_TIER_START_LEVEL = [", "\n];", dust_block
        )
        if did:
            changed_mech = True
            mech_table_fixes += 1
            print(f"Regenerated Stardust power-up tiers from pogoapi.net ({dust_tiers} tiers)")
    except Exception as e:
        print(f"WARNING: Stardust tier refresh failed, keeping existing table: {e}", file=sys.stderr)

    if stat_fixes:
        for dex, stats in stat_fixes.items():
            pattern = re.compile(r"(?<!\d)" + str(dex) + r":\[\d+,\d+,\d+\]")
            replacement = f"{dex}:[{stats[0]},{stats[1]},{stats[2]}]"
            new_content, count = pattern.subn(replacement, content, count=1)
            if count == 1:
                content = new_content
                changed_mech = True
            else:
                print(f"WARNING: could not locate dex {dex} entry to patch", file=sys.stderr)

    sprite_fetch_log = []
    if new_pokemon:
        os.makedirs(os.path.dirname(NEW_POKEMON_PATH), exist_ok=True)
        os.makedirs(SPRITE_DIR, exist_ok=True)

        # Append new entries into BASE_STATS and DEX_NAMES so the PR branch
        # is ready-to-merge (reviewer just eyeballs the sprite/name, no manual
        # data entry needed).
        base_stats_insert = ""
        dex_names_insert = ""
        for dex in sorted(new_pokemon):
            info = new_pokemon[dex]
            stats = info["stats"]
            base_stats_insert += f"  {dex}:[{stats[0]},{stats[1]},{stats[2]}],\n"
            dex_names_insert += f'  {dex}:"{info["name"]}",\n'

        content = re.sub(
            r"(const BASE_STATS = \{)",
            r"\1\n" + base_stats_insert.rstrip("\n"),
            content, count=1,
        )
        content = re.sub(
            r"(const DEX_NAMES = \{)",
            r"\1\n" + dex_names_insert.rstrip("\n"),
            content, count=1,
        )
        changed_mech = True

        payload = []
        for dex, info in sorted(new_pokemon.items()):
            sprite_path = os.path.join(SPRITE_DIR, f"{dex}.png")
            sprite_fetched = False
            if not os.path.exists(sprite_path):
                try:
                    img = fetch_bytes(SPRITE_URL_TEMPLATE.format(dex=dex))
                    with open(sprite_path, "wb") as sf:
                        sf.write(img)
                    sprite_fetched = True
                except Exception as e:
                    print(f"WARNING: could not fetch sprite for dex {dex}: {e}", file=sys.stderr)
            entry = {
                "dex": dex, "name": info["name"], "stats": info["stats"],
                "sprite_fetched": sprite_fetched,
            }
            payload.append(entry)
            sprite_fetch_log.append(entry)
        with open(NEW_POKEMON_PATH, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        print(f"Found {len(new_pokemon)} new Pokemon not yet in DEX_NAMES/BASE_STATS -> added to pokemon-mechanics.js + wrote {NEW_POKEMON_PATH}")

    if changed_mech:
        with open(MECH_PATH, "w", encoding="utf-8", newline="\n") as f:
            f.write(content)
        if stat_fixes:
            print(f"Applied {len(stat_fixes)} base-stat correction(s) to pokemon-mechanics.js")

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as f:
            f.write(f"stat_fixes={len(stat_fixes) + mech_table_fixes}\n")
            f.write(f"new_pokemon={len(new_pokemon)}\n")


if __name__ == "__main__":
    main()
