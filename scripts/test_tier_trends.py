#!/usr/bin/env python3
"""record_tier_trends: tier changes are diffed per league, merged with history, old entries expire, same-day reruns replace."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import record_tier_trends as t

def table(lg, d, pad=120):
    body = {k: {"tier": v} for k, v in d.items()}
    for i in range(pad):                       # the importer refuses tiny tables, so pad like a real one
        body["filler%d" % i] = {"tier": "C"}
    return "const PVP_TIER_%s = %s;\n" % (lg.upper(), json.dumps(body))

old = table("great", {"azumarill": "C", "melmetal": "S", "gone": "B"}) + table("ultra", {"azumarill": "B"})
new = table("great", {"azumarill": "A", "melmetal": "S", "newcomer": "B"}) + table("ultra", {"azumarill": "B"})
fails = []
def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else "  " + detail))
    if not ok: fails.append(name)

o, n = t.tiers_of(old), t.tiers_of(new)
rows = t.diff(o, n, "2026-10-27")
got = {(r["s"], r["f"], r["t"]) for r in rows}
check("a rising species is recorded", ("azumarill", "C", "A") in got, str(got))
check("a species that became ranked is recorded from '-'", ("newcomer", "-", "B") in got)
check("a species that dropped out is recorded to '-'", ("gone", "B", "-") in got)
check("an unchanged species is not recorded", not any(r["s"] == "melmetal" for r in rows))
src = new + "// END GENERATED BLOCK: EVOLUTION_BRANCHES\n"
first = t.merge(src, rows, "2026-10-27")
block = t.write_block(src, first)
second = t.merge(block, [{"s": "x", "l": "great", "f": "C", "t": "B", "on": "2026-11-03"}], "2026-11-03")
check("history accumulates across weeks", len(second["changes"]) == len(rows) + 1, str(len(second["changes"])))
third = t.merge(t.write_block(src, second), [], "2027-01-20")
check("entries older than 56 days expire", third["changes"] == [], str(third["changes"]))
again = t.merge(block, [{"s": "y", "l": "great", "f": "C", "t": "B", "on": "2026-10-27"}], "2026-10-27")
check("re-running on the same day replaces that day", [c["s"] for c in again["changes"]] == ["y"], str(again["changes"]))
print("%d failed" % len(fails)); sys.exit(1 if fails else 0)
