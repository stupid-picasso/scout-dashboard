#!/usr/bin/env python3
"""update_pokemon_data: the POWERUP_RUNS block is generated from pogoapi.net's power-up table, run-length encoded, and the generator's
output is byte-identical to the block in pokemon-mechanics.js (so a refresh that changes nothing changes nothing). Offline: the API table is
rebuilt from the runs in the file."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_pokemon_data as u

fails = []
def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else "  " + detail))
    if not ok: fails.append(name)

def api_rows(costs, top):
    """costs: [(first_level, dust, candy, xl)] runs -> the endpoint's per-half-level dict."""
    out = {}
    for i, (lv, dust, candy, xl) in enumerate(costs):
        end = costs[i + 1][0] if i + 1 < len(costs) else top
        while lv < end:
            out[str(lv)] = {"current_level": lv, "level_after_powering": lv + 0.5, "stardust_to_upgrade": dust, "candy_to_upgrade": candy, "xl_candy_to_upgrade": xl}
            lv += 0.5
    return out

# synthetic table covering a Candy change inside a Stardust tier and the switch to XL Candy
rows = api_rows([(1, 200, 1, 0), (2, 400, 1, 0), (3, 400, 2, 0), (4, 400, 0, 5)], 5)
block, n = u.powerup_block_from(rows)
want = (u.POWERUP_HEADER + "const _POWERUP_RUNS = [\n  [1, 200, 1, 0], [2, 400, 1, 0], [3, 400, 2, 0], [4, 400, 0, 5]\n];\nconst MAX_POKEMON_LEVEL = 5;\n" + u.POWERUP_END_MARKER)
check("a run starts wherever stardust, candy or XL candy changes", block == want and n == 4, block)
check("the block opens with the marker the splicer looks for", block.startswith(u.POWERUP_START_MARKER) and block.endswith(u.POWERUP_END_MARKER))

try:
    gap = dict(rows); del gap["2.5"]
    u.powerup_block_from(gap)
    check("a missing half-level is refused", False)
except ValueError:
    check("a missing half-level is refused", True)
try:
    bad = dict(rows); bad["1"] = dict(bad["1"], level_after_powering=2.0)
    u.powerup_block_from(bad)
    check("a step that does not end half a level higher is refused", False)
except ValueError:
    check("a step that does not end half a level higher is refused", True)
try:
    u.powerup_block_from({})
    check("an empty table is refused", False)
except ValueError:
    check("an empty table is refused", True)

# round trip against the real file: runs -> API rows -> generator == the block in the file
mech = open(u.MECH_PATH, encoding="utf-8").read()
a = mech.index(u.POWERUP_START_MARKER); b = mech.index(u.POWERUP_END_MARKER) + len(u.POWERUP_END_MARKER)
cur = mech[a:b]
runs = [tuple(int(x) for x in r) for r in re.findall(r"\[(\d+), (\d+), (\d+), (\d+)\]", cur)]
top = int(re.search(r"const MAX_POKEMON_LEVEL = (\d+);", cur).group(1))
regen, _ = u.powerup_block_from(api_rows(runs, top))
check("the generator reproduces the block in pokemon-mechanics.js exactly", regen == cur, "differs")
spliced, changed = u.replace_block(mech, u.POWERUP_START_MARKER, u.POWERUP_END_MARKER, regen)
check("splicing the regenerated block changes nothing", spliced == mech and changed is False)
check("the old tier-list generator is gone", not hasattr(u, "build_dust_tier_block"))
print("%d failed" % len(fails)); sys.exit(1 if fails else 0)
