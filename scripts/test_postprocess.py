#!/usr/bin/env python3
"""Offline tests for the video-import post-processing (name snapping, type casing, merge flags)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pogo_extract as px

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", name, detail)


check("typo snapped", px.canonical_name("Sheigon") == ("Shelgon", True), str(px.canonical_name("Sheigon")))
check("exact name untouched", px.canonical_name("Pikachu") == ("Pikachu", False))
check("case fixed", px.canonical_name("pikachu") == ("Pikachu", True))
check("form prefix untouched", px.canonical_name("Alolan Raichu") == ("Alolan Raichu", False))
check("unknown far name untouched", px.canonical_name("Zzyzxqq") == ("Zzyzxqq", False))
check("short unrelated not mangled", px.canonical_name("Xyz")[1] is False)
check("type upper", px.normalize_type("NORMAL / FLYING") == "Normal / Flying")
check("type lower", px.normalize_type("electric") == "Electric")
check("type null", px.normalize_type(None) is None)
items = [{"name": "Sheigon", "type": "DRAGON"}, {"name": "Bagon", "type": "dragon"}]
check("clean counts fixes", px.clean_video_items(items) == 1 and items[0]["name"] == "Shelgon" and items[0]["type"] == "Dragon", str(items))

recs = [{"name": "Pidgeot", "cp": 848, "hp": 120, "favorite": False}, {"name": "Pidgeot", "cp": None, "hp": 120, "favorite": True, "weight": "30kg"},
        {"name": "Pidgey", "cp": 100, "hp": 30}, {"name": "Pidgey", "cp": 120, "hp": 30}, {"name": "Pidgey", "cp": None, "hp": 30},
        {"name": "Mankey", "cp": 300, "hp": 60, "weight": "28kg"}, {"name": "Mankey", "cp": None, "hp": 60, "weight": "30kg"}]
out, n = px.absorb_cpless(recs)
check("unique match folded", n == 1 and len(out) == 6, str(n))
check("folded record gains fields", [r for r in out if r["name"] == "Pidgeot"][0].get("weight") == "30kg" and [r for r in out if r["name"] == "Pidgeot"][0]["favorite"] is True)
check("ambiguous match kept", sum(1 for r in out if r["name"] == "Pidgey") == 3)
check("conflicting weight kept", sum(1 for r in out if r["name"] == "Mankey") == 2)
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
