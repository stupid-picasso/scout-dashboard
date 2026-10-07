#!/usr/bin/env python3
"""Offline tests for the video-import post-processing (name snapping, type casing, merge flags)."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import tempfile as _tf
os.environ.setdefault("POGO_DEBUG_DIR", _tf.mkdtemp())
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

# --- gender icon measured from pixels ------------------------------------------------------------
FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "detail_screens")
for fname, want in (("shieldon_male", "M"), ("salandit_male", "M"), ("sableye_male", "M"), ("sableye_scrolled", None)):
    check("gender icon on %s" % fname, px.detect_gender(os.path.join(FIX, fname + ".png")) == want, str(px.detect_gender(os.path.join(FIX, fname + ".png"))))
from PIL import ImageDraw, ImageFont
_dj = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
if os.path.exists(_dj):
    def _frame(sym, size):
        img = Image.new("RGB", (1080, 2349), (250, 250, 250)); d = ImageDraw.Draw(img); d.rectangle((267, 1057, 806, 1071), fill=(160, 230, 195))
        if sym:
            d.text((922, 1020), sym, font=ImageFont.truetype(_dj, size), fill=(130, 150, 170))
        pth = os.path.join(tmp, "g_%s_%d.png" % (ord(sym) if sym else 0, size)); img.save(pth); return pth
    check("synthetic male symbol", all(px.detect_gender(_frame("\u2642", z)) == "M" for z in (66, 78, 88)))
    check("synthetic female symbol", all(px.detect_gender(_frame("\u2640", z)) == "F" for z in (66, 78, 88)))
    check("no symbol -> None", px.detect_gender(_frame(None, 78)) is None)

# --- per-frame merge ------------------------------------------------------------------------------
seqx = [(1, {"name": "Sableye", "cp": 818, "hp": 89, "weight": "8.64kg"}), (2, {"name": "Sableye", "hp": 89, "weight": "8.64kg", "fastMove": "Feint Attack", "chargeMove1": "Power Gem", "gender": "M"}),
        (3, {"name": "Sableye", "cp": 829, "hp": 90, "weight": "9.1kg", "fastMove": "Shadow Claw"}),
        (4, {"name": "Sableye", "hp": 90, "weight": "9.1kg", "fastMove": "Shadow Claw", "chargeMove1": "Foul Play", "gender": "F"}),
        (20, {"name": "Pikachu", "cp": 500, "hp": 60, "gender": "M", "favorite": False}), (21, {"name": "Pikachu", "cp": 500, "gender": "M", "favorite": True}), (22, {"name": "Pikachu", "cp": 500, "gender": "F"}),
        (60, {"name": "Pikachu", "cp": 500, "hp": 60})]
out = px.merge_frames(seqx)
sab = [o for o in out if o["name"] == "Sableye"]
check("two same-species Pokemon on adjacent frames stay apart", len(sab) == 2, str(len(sab)))
check("each keeps only its own moves", sab[0]["fastMove"] == "Feint Attack" and sab[0]["chargeMove1"] == "Power Gem" and sab[1]["fastMove"] == "Shadow Claw" and sab[1]["chargeMove1"] == "Foul Play", json.dumps(sab) if False else str(sab))
check("scrolled frame joins its Pokemon (CP kept)", sab[0]["cp"] == 818 and sab[1]["cp"] == 829)
pk = [o for o in out if o["name"] == "Pikachu"]
check("same species and CP far apart are one Pokemon", len(pk) == 1, str(len(pk)))
far = px.merge_frames([(20, {"name": "Pikachu", "cp": 500, "hp": 60}), (60, {"name": "Pikachu", "cp": 510, "hp": 61})])
check("different CP far apart stay separate", len(far) == 2, str(len(far)))
check("vote: majority gender wins; favorite true wins", pk[0]["gender"] == "M" and pk[0]["favorite"] is True, str(pk[0]))

# pooling: a mid-swipe frame (new header, old card's body) must not outvote the Pokemon's own frames
seqy = [(1, {"name": "Sableye", "cp": 829, "hp": 90, "gender": "F", "height": "0.62m", "weight": "15.99kg"}),
        (2, {"name": "Sableye", "cp": 818, "hp": 89, "gender": "F", "height": "0.62m", "weight": "8.64kg"}),
        (3, {"name": "Sableye", "cp": 818, "hp": 89, "gender": "M", "height": "0.39m", "weight": "8.64kg"}),
        (4, {"name": "Sableye", "cp": 818, "hp": 89, "gender": "M", "height": "0.39m", "weight": "8.64kg"}),
        (5, {"name": "Sableye", "hp": 89, "gender": "M", "height": "0.39m", "weight": "8.64kg", "fastMove": "Feint Attack", "chargeMove1": "Power Gem"})]
outy = px.merge_frames(seqy)
s818 = [o for o in outy if o.get("cp") == 818]
check("same-CP groups are pooled", len(s818) == 1, str(outy))
check("pooled vote beats the mid-swipe frame", s818 and s818[0]["gender"] == "M" and s818[0]["height"] == "0.39m" and s818[0].get("fastMove") == "Feint Attack", str(s818))

check("weight that is a height swaps into an empty height", px.fix_units({"weight": "1.18m", "height": None}) == {"weight": None, "height": "1.18m"})
check("weight that is a height is dropped when height is set", px.fix_units({"weight": "1.18m", "height": "0.4m"}) == {"weight": None, "height": "0.4m"})
check("good units untouched", px.fix_units({"weight": "45.42kg", "height": "0.45m"}) == {"weight": "45.42kg", "height": "0.45m"})
check("junk units dropped", px.fix_units({"weight": "heavy", "height": "12"}) == {"weight": None, "height": None})
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
