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
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
