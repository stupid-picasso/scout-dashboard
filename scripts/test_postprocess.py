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

# --- frame selection and batch planning ---------------------------------------------------------
import tempfile
from PIL import Image, ImageFilter
tmp = tempfile.mkdtemp()
def mk(name, blur):
    img = Image.new("L", (400, 800), 40)
    for y in range(0, 800, 20):
        for x in range(0, 400, 40):
            img.paste(220, (x, y, x + 12, y + 8))
    if blur:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    path = os.path.join(tmp, name + ".png")
    img.convert("RGB").save(path)
    return path
f0, f1, f2 = mk("a_blur", 3), mk("b_sharp", 0), mk("c_blur", 2)
kept = px.dedupe_similar_frames([f0, f1, f2], threshold=60)
check("sharpest of a run is kept, not the first", kept == [f1], str(kept))
other = Image.new("RGB", (400, 800), (200, 30, 30)); op = os.path.join(tmp, "z.png"); other.save(op)
check("different screens both kept", len(px.dedupe_similar_frames([f1, op], threshold=4)) == 2)

sigs = [[0] * 4 for _ in range(10)] + [[200] * 4 for _ in range(10)]   # screen change before index 10
sizes = [1] * 20
plan = px.plan_batches(sigs, sizes, max_frames=12, budget=10**9, lookback=3, min_frames=4)
check("every frame planned once, in order", [i for g in plan for i in g] == list(range(20)), str(plan))
check("cut slides back to the screen change", plan[0] == list(range(10)), str(plan))
plan2 = px.plan_batches([[0] * 4] * 25, [1] * 25, max_frames=10, budget=10**9)
check("uniform frames cut at the limit", [len(g) for g in plan2] == [10, 10, 5], str([len(g) for g in plan2]))
plan3 = px.plan_batches([[0] * 4] * 6, [5] * 6, max_frames=10, budget=12)
check("byte budget respected", all(sum(5 for _ in g) <= 12 or len(g) == 1 for g in plan3), str(plan3))

# planner: no needless shortening, only a clear screen change moves the cut
import random
random.seed(1)
noisy = [[random.randint(0, 40)] * 4 for _ in range(300)]
pl = px.plan_batches(noisy, [1] * 300, max_frames=10, budget=10**9)
check("planner keeps batches near full on noisy frames", len(pl) <= 36, str(len(pl)))

kept, dropped = px.drop_sparse([
    {"name": "Lucario", "cp": None, "hp": None, "fastMove": "Counter", "chargeMove1": "Power-Up Punch"},
    {"name": "Rhydon", "cp": None, "hp": None, "height": "1.9m", "gender": "M"},
    {"name": "Shuckle", "cp": None, "hp": None, "candy": 50, "fastMove": "Rock Throw", "chargeMove1": "Rock Blast"},
    {"name": "Pidgey", "cp": 100, "hp": None},
    {"name": "Riolu", "cp": None, "hp": 60},
    {"name": "Seedot", "cp": None, "hp": None, "weight": "4kg", "height": "0.5m", "gender": "M"}])
check("sparse species dropped", dropped == ["Lucario", "Rhydon"], str(dropped))
check("candy / CP / HP / richer rows kept", [r["name"] for r in kept] == ["Shuckle", "Pidgey", "Riolu", "Seedot"], str([r["name"] for r in kept]))
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
