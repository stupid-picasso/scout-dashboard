#!/usr/bin/env python3
"""
record_tier_trends.py — remembers which species moved up or down a PvPoke tier, so the app can protect a species that is
RISING before its tier is high enough for the normal keep rules.

Run in the weekly refresh right after import_pvpoke_gamemaster.py. It compares the tier tables in the committed
pokemon-mechanics.js (git HEAD) with the freshly imported ones in the working tree and appends every change, with the
date, to the TIER_TRENDS GENERATED BLOCK. Changes older than 56 days are dropped.

    TIER_TRENDS = {"updated": "YYYY-MM-DD", "changes": [{"s": "melmetal", "l": "great", "f": "B", "t": "A", "on": "YYYY-MM-DD"}]}
    f = tier before ("-" = not ranked), t = tier now ("-" = no longer ranked)

Usage: python scripts/record_tier_trends.py [old-mechanics.js] [today YYYY-MM-DD]   (old defaults to `git show HEAD:pokemon-mechanics.js`)
"""
import datetime, json, re, subprocess, sys

MECH_PATH = "pokemon-mechanics.js"
LEAGUES = ("great", "ultra", "little", "master")
KEEP_DAYS = 56


def tiers_of(src):
    out = {}
    for lg in LEAGUES:
        m = re.search(r"const PVP_TIER_%s = (\{.*?\});\n" % lg.upper(), src)
        if not m:
            continue
        try:
            out[lg] = {name: v.get("tier") for name, v in json.loads(m.group(1)).items() if v.get("tier")}
        except ValueError:
            pass
    return out


def diff(old, new, today):
    rows = []
    for lg in LEAGUES:
        o, n = old.get(lg), new.get(lg)
        if not o or not n:
            continue   # a league missing on either side is a parse problem, not a change
        for sp in sorted(set(o) | set(n)):
            if o.get(sp) != n.get(sp):
                rows.append({"s": sp, "l": lg, "f": o.get(sp, "-"), "t": n.get(sp, "-"), "on": today})
    return rows


def merge(src_new, rows, today):
    m = re.search(r"const TIER_TRENDS = (\{.*?\});\n", src_new)
    try:
        prev = json.loads(m.group(1)).get("changes", []) if m else []
    except ValueError:
        prev = []
    cutoff = (datetime.date.fromisoformat(today) - datetime.timedelta(days=KEEP_DAYS)).isoformat()
    keep = [c for c in prev if c.get("on", "") >= cutoff and not (c["on"] == today)]   # re-running the same day replaces that day
    return {"updated": today, "changes": keep + rows}


def write_block(src, trends):
    block = ("// GENERATED BLOCK: TIER_TRENDS (record_tier_trends.py) — do not hand-edit\n"
             "const TIER_TRENDS = " + json.dumps(trends, separators=(",", ":")) + ";\n"
             "// END GENERATED BLOCK: TIER_TRENDS")
    pat = re.compile(r"// GENERATED BLOCK: TIER_TRENDS.*?// END GENERATED BLOCK: TIER_TRENDS", re.S)
    if pat.search(src):
        return pat.sub(lambda _: block, src)
    anchor = "// END GENERATED BLOCK: EVOLUTION_BRANCHES"
    assert anchor in src, "run import_evolution_branches.py first"
    return src.replace(anchor, anchor + "\n\n" + block, 1)


def main():
    old_src = open(sys.argv[1], encoding="utf-8").read() if len(sys.argv) > 1 else subprocess.check_output(["git", "show", "HEAD:" + MECH_PATH], text=True)
    today = sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat()
    new_src = open(MECH_PATH, encoding="utf-8").read()
    old, new = tiers_of(old_src), tiers_of(new_src)
    if len(new.get("great", {})) < 100 or len(old.get("great", {})) < 100:
        sys.exit("tier tables not found; keeping old trends")
    rows = diff(old, new, today)
    trends = merge(new_src, rows, today)
    open(MECH_PATH, "w", encoding="utf-8").write(write_block(new_src, trends))
    print("tier changes recorded: %d (kept in history: %d)" % (len(rows), len(trends["changes"])))


if __name__ == "__main__":
    main()
