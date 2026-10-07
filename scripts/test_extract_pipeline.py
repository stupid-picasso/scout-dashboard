#!/usr/bin/env python3
"""Offline end-to-end check of run_gemini_video_ocr with a fake Gemini API: parallel batches, the
thinking ladder, a dead model, daily quota, and the verify tier re-reading a suspect batch."""
import io, json, os, sys, tempfile, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["GEMINI_API_KEY_1"] = "keyAAAAAA111"
os.environ["GEMINI_API_KEY_2"] = "keyBBBBBB222"
import pogo_extract as px
from PIL import Image

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", name, detail)


class Resp:
    def __init__(self, status, body):
        self.status_code, self._b = status, body
        self.ok = 200 <= status < 300
        self.text = json.dumps(body)

    def json(self):
        return self._b


calls, lock = [], threading.Lock()
BEHAVE = {"bad_model": None, "daily": set(), "suspect_batches": set(), "no_level": set()}


def reply_for(model, key, body):
    n_images = sum(1 for p in body["contents"][0]["parts"] if "inline_data" in p)
    note = body["contents"][0]["parts"][0]["text"]
    import re
    m = re.search(r"batch (\d+) of", note)
    b = int(m.group(1)) if m else 1
    name = "Pikachu"
    # a bad reading (no CP/HP) from the cheap models on chosen batches; the verify model reads it properly
    if b in BEHAVE["suspect_batches"] and model in px.gemini_pool.BULK_MODELS:
        items = [{"name": name, "cp": None, "hp": None}, {"name": name, "cp": None, "hp": None}]
    else:
        items = [{"name": name, "cp": 100 + b, "hp": 50, "marker": model}]
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(items)}]}}]}


def fake_post(url, json=None, timeout=None):
    model = url.split("/models/")[1].split(":")[0]
    key = url.split("key=")[1]
    cfg = json["generationConfig"]
    with lock:
        calls.append((model, key, dict(cfg)))
    if model == BEHAVE["bad_model"]:
        return Resp(404, {"error": {"message": "not found"}})
    # gemini-3 models reject thinkingBudget; minimal level is accepted only on lite
    tc = cfg.get("thinkingConfig") or {}
    if model.startswith("gemini-3") and "thinkingBudget" in tc:
        return Resp(400, {"error": {"message": "thinkingBudget unsupported"}})
    if tc.get("thinkingLevel") == "minimal" and not model.endswith("-lite"):
        return Resp(400, {"error": {"message": "minimal not supported"}})
    if (model, key) in BEHAVE["daily"]:
        return Resp(429, {"error": {"message": "quota exceeded PerDay"}})
    time.sleep(0.01)
    return Resp(200, reply_for(model, key, json))


def fake_get(url, timeout=None):
    names = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-2.5-flash"]
    return Resp(200, {"models": [{"name": "models/" + n, "supportedGenerationMethods": ["generateContent"]} for n in names]})


px.requests.post, px.requests.get = fake_post, fake_get
px.BATCH_PACE_S = 0
px.gemini_pool.MODEL_PROFILES  # noqa
# make every lane fast for the test
orig_lane = px.gemini_pool.Lane.__init__


def fast_lane(self, *a, **k):
    orig_lane(self, *a, **k)
    self.rpm = 6000


px.gemini_pool.Lane.__init__ = fast_lane

# frames: 45 tiny images -> 5 batches of 10 (MAX_FRAMES_PER_BATCH=10) -> 5 batches
tmp = tempfile.mkdtemp()
frames = []
for i in range(45):
    p = os.path.join(tmp, "f%03d.png" % i)
    Image.new("RGB", (64, 64), (i * 5 % 255, 10, 10)).save(p)
    frames.append(p)
px.detect_mega_dots = lambda fp: []

# --- run 1: everything healthy
t0 = time.time()
items = px.run_gemini_video_ocr(frames)
check("one merged item per distinct CP (5 batches)", len(items) == 5, str(len(items)))
check("only bulk models used when nothing is suspect", all(m in px.gemini_pool.BULK_MODELS for m, k, c in calls), str({m for m, k, c in calls}))
check("both keys used", {k for m, k, c in calls} == {"keyAAAAAA111", "keyBBBBBB222"})
mins = [c for m, k, c in calls if m == "gemini-3.5-flash-lite" and c.get("thinkingConfig")]
check("gemini-3 models get thinkingLevel, never thinkingBudget", all("thinkingLevel" in c["thinkingConfig"] for c in mins) and mins, str(mins[:1]))
check("JSON mime type requested", all(c.get("responseMimeType") == "application/json" for m, k, c in calls))

# --- run 2: a suspect bulk answer is re-read by a verify model that rejects 'minimal' (400 -> ladder)
calls.clear(); BEHAVE["suspect_batches"] = {2}
items = px.run_gemini_video_ocr(frames)
verify_calls = [(m, c) for m, k, c in calls if m in px.gemini_pool.VERIFY_MODELS]
check("suspect batch sent to a verify model", len(verify_calls) >= 1, str({m for m, k, c in calls}))
check("verify model's good reading kept", any(it.get("marker") in px.gemini_pool.VERIFY_MODELS for it in items), json.dumps(items)[:300])
check("no empty-CP Pokemon left after verification", all(it.get("cp") is not None for it in items), json.dumps(items)[:300])
check("ladder stepped down on a 400", any(c.get("thinkingConfig") == {"thinkingLevel": "low"} for m, c in verify_calls), str([c.get("thinkingConfig") for m, c in verify_calls]))

# --- run 3: one lite model absent from the account (404) and one lane out of daily quota
calls.clear(); BEHAVE["suspect_batches"] = set(); BEHAVE["bad_model"] = "gemini-3.1-flash-lite"; BEHAVE["daily"] = {("gemini-3.5-flash-lite", "keyAAAAAA111")}
px._THINK_RUNG.clear()
items = px.run_gemini_video_ocr(frames)
check("run completes with a dead model and a dead lane", len(items) == 5, str(len(items)))
lane_calls = [(m, k) for m, k, c in calls if m == "gemini-3.5-flash-lite" and k == "keyAAAAAA111"]
check("out-of-quota lane not hammered", len(lane_calls) <= 3, str(len(lane_calls)))


# --- run 4: every lane out of daily quota -> the import refuses to write a partial result
calls.clear(); BEHAVE["bad_model"] = None
BEHAVE["daily"] = {(m, k) for m in ("gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash") for k in ("keyAAAAAA111", "keyBBBBBB222")}
try:
    px.run_gemini_video_ocr(frames)
    check("total failure aborts instead of writing a partial import", False, "no SystemExit")
except SystemExit as e:
    check("total failure aborts instead of writing a partial import", e.code == 1, str(e.code))

print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
