#!/usr/bin/env python3
"""Offline tests for gemini_pool.py (scheduling, quota handling, result checking). No network."""
import os, sys, threading, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import gemini_pool as gp

passed = failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL", name, detail)


class Err(Exception):
    def __init__(self, msg, status=None, daily=False, transient=False):
        super().__init__(msg)
        self.status, self.daily, self.transient = status, daily, transient


def fast(pool, rpm=6000):
    for l in pool.lanes:
        l.rpm = rpm
    return pool


KEYS = ["keyAAAAAA", "keyBBBBBB"]

# 1. every batch is answered, results keep their index, work is spread over all lanes
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]))
res, who = gp.run_batches(pool, range(24), lambda i, m, k: [{"name": "p%d" % i}], "bulk", 8)
check("all batches answered", all(res[i] == [{"name": "p%d" % i}] for i in range(24)))
used = {l.id for l in pool.lanes if l.calls > 0}
check("every lane used", len(used) == 4, str(used))
check("no failures recorded", all(not l.errors for l in pool.lanes))

# 2. a model that does not exist (404) is dropped for every key; the rest finish the job
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite", "gemini-9-flash-lite"]))
pool.lanes[2].model = pool.lanes[3].model = "gemini-9-flash-lite"; pool.lanes[2].tier = pool.lanes[3].tier = "bulk"


def make404(i, model, key):
    if model == "gemini-9-flash-lite":
        raise Err("404", status=404)
    return [{"name": "ok"}]


res, who = gp.run_batches(pool, range(10), make404, "bulk", 4)
check("404 model skipped, all done", all(res[i] for i in range(10)))
check("404 kills every lane of the model", all(l.dead for l in pool.lanes if l.model == "gemini-9-flash-lite"))
check("healthy lanes stay alive", all(not l.dead for l in pool.lanes if l.model == "gemini-3.5-flash-lite"))

# 3. daily quota on one lane: that lane is out for the run, others carry on
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]))
bad = pool.lanes[0]


def daily(i, model, key):
    if model == bad.model and key == bad.key:
        raise Err("429 daily", status=429, daily=True)
    return [{"name": "x"}]


res, who = gp.run_batches(pool, range(12), daily, "bulk", 4)
check("daily-quota lane marked dead", bad.dead and bad.dead_reason == "daily quota")
check("work completed despite dead lane", all(res[i] for i in range(12)))
check("dead lane tried at most once", bad.calls <= 1 + 3, str(bad.calls))

# 4. per-minute 429 and 503 only delay a lane
pool = fast(gp.Pool(KEYS[:1], ["gemini-3.5-flash-lite"]))
lane = pool.lanes[0]
t0 = time.time(); pool.report(lane, False, status=503); check("503 backs the lane off", lane.next_ok > time.time() + 3)
check("503 does not kill the lane", not lane.dead)
pool.report(lane, False, status=429, daily=False); check("minute-429 waits about a minute", lane.next_ok >= time.time() + 55)

# 5. unparseable answers (status -1) do not penalise a lane, the batch is retried elsewhere
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite"]))
seen = {"n": 0}
lock = threading.Lock()


def flaky(i, model, key):
    with lock:
        seen["n"] += 1
        first = seen["n"] == 1
    if first:
        raise Err("unparseable output", status=-1)
    return [{"name": "fine"}]


res, who = gp.run_batches(pool, [0], flaky, "bulk", 1)
check("retried after unparseable answer", res[0] == [{"name": "fine"}])
check("no lane dead after unparseable", all(not l.dead for l in pool.lanes))

# 6. nothing left alive -> None, not a hang
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite"]))
for l in pool.lanes:
    l.dead = True
res, who = gp.run_batches(pool, [0, 1], lambda i, m, k: [{"name": "x"}], "bulk", 2, max_wait=1)
check("no lanes -> None", res[0] is None and res[1] is None)

# 7. a lane never starts requests faster than its rpm
pool = gp.Pool(["keyAAAAAA"], ["gemini-3.5-flash-lite"])
pool.lanes[0].rpm = 600  # 0.1 s apart
starts = []
sl = threading.Lock()


def stamp(i, model, key):
    with sl:
        starts.append(time.time())
    return [{"name": "x"}]


gp.run_batches(pool, range(6), stamp, "bulk", 6)
starts.sort()
gaps = [b - a for a, b in zip(starts, starts[1:])]
check("rpm spacing respected", all(g >= 0.085 for g in gaps), str(["%.3f" % g for g in gaps]))

# 8. tiers: verify lanes are not touched by bulk work, and the override works
pool = fast(gp.Pool(KEYS, ["gemini-3.5-flash-lite", "gemini-3.5-flash"]))
gp.run_batches(pool, range(8), lambda i, m, k: [{"name": "x"}], "bulk", 4)
check("verify lanes untouched by bulk work", all(l.calls == 0 for l in pool.lanes if l.model == "gemini-3.5-flash"))
pool = gp.Pool(KEYS, ["gemini-3.5-flash"], tiers={"gemini-3.5-flash": "bulk"})
check("tier override", all(l.tier == "bulk" for l in pool.lanes))

# 9. suspicion + replacement rule
known = lambda n: n.lower() in ("pikachu", "mew")
good = [{"name": "Pikachu", "cp": 500, "hp": 60, "atkIV": 15}]
check("clean batch scores 0", gp.suspicion(good, known) == 0)
check("missing CP/HP counted", gp.suspicion([{"name": "Pikachu"}], known) == 2)
check("implausible values counted", gp.suspicion([{"name": "Pikachu", "cp": 99999, "hp": 5000, "atkIV": 99}], known) == 6)
check("unknown species counted", gp.suspicion([{"name": "Pikachuu", "cp": 500, "hp": 60}], known) == 2)
check("verify replaces a worse batch", gp.pick_replacement([{"name": "Pikachu"}], good, known))
check("verify does not replace with a worse one", not gp.pick_replacement(good, [{"name": "Pikachu"}], known))
check("empty verify answer never replaces", not gp.pick_replacement(good, [], known))
check("verify fills a failed batch", gp.pick_replacement(None, good, known))

# --- dynamic model choice -------------------------------------------------------------------
import gemini_pool as _g
_av = {"gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-4-flash-lite", "gemini-3.9-flash",
       "gemini-3.5-flash-image", "gemini-2.5-flash-preview-tts", "gemini-3.5-pro", "gemini-3.1-flash-live",
       "gemini-3-flash-preview"}
_b, _v = _g.choose_models(_av, env={})
check("dyn: newest lite first, junk excluded", _b == ["gemini-4-flash-lite", "gemini-3.5-flash-lite"], str(_b))
check("dyn: stable flash preferred over preview", _v == ["gemini-3.9-flash", "gemini-3.5-flash"], str(_v))
check("dyn: previews used when nothing stable", _g.choose_models({"gemini-3-flash-preview"}, env={})[1] == ["gemini-3-flash-preview"])
check("dyn: fallback when discovery empty", _g.choose_models(set(), env={})[0] == _g.BULK_MODELS)
check("dyn: env override", _g.choose_models(_av, env={"GEMINI_BULK_MODELS": "gemini-3.5-flash"})[0] == ["gemini-3.5-flash"])
check("dyn: unknown new lite is bulk", _g.profile_for("gemini-9-flash-lite")["tier"] == "bulk")

# --- overload circuit breaker and deadline ----------------------------------------------------
_t = [0.0]
_pool = gp.Pool(["k1"], ["gemini-3.5-flash"], clock=lambda: _t[0], sleep=lambda d: _t.__setitem__(0, _t[0] + d))
_ln = _pool.lanes[0]
for _ in range(5):
    _pool.report(_ln, False, status=503)
check("5 overloads in a row retire the lane", _ln.dead and "overloaded" in _ln.dead_reason, _ln.dead_reason)
_t2 = [0.0]
_p2 = gp.Pool(["k1"], ["gemini-3.5-flash-lite"], clock=lambda: _t2[0], sleep=lambda d: _t2.__setitem__(0, _t2[0] + d))
def _slow(i, m, k):
    _t2[0] += 100
    return [{"name": "x"}]
_res, _ = gp.run_batches(_p2, range(10), _slow, "bulk", 1, deadline=250)
check("deadline stops new work", sum(1 for v in _res.values() if v) < 10, str(_res))

# bulk lanes survive an overload spell (cooldown, never retired)
_t3 = [0.0]
_p3 = gp.Pool(["k1"], ["gemini-3.5-flash-lite"], clock=lambda: _t3[0], sleep=lambda d: _t3.__setitem__(0, _t3[0] + d))
_bl = _p3.lanes[0]
for _ in range(12):
    _p3.report(_bl, False, status=503)
check("bulk lane is never retired by overload", not _bl.dead and _bl.next_ok >= 120, "%s %s" % (_bl.dead, _bl.next_ok))
check("retired 2.x models are skipped when 3.x exist", gp.choose_models({"gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3.5-flash", "gemini-3.5-flash-lite"}, env={}) == (["gemini-3.5-flash-lite"], ["gemini-3.5-flash"]))
check("2.x used when it is all there is", gp.choose_models({"gemini-2.5-flash-lite"}, env={})[0] == ["gemini-2.5-flash-lite"])
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)
