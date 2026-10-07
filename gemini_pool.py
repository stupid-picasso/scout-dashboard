"""Quota-aware, parallel scheduling of Gemini requests for the video import.

Why this exists: the import used to send its ~140 batches strictly one after another, rotating
three models in a fixed order. That wasted time (one request in flight at a time, 1.5 s pauses),
and wasted quota: the free tier gives gemini-3.5-flash only a handful of requests per day, so a
third of the rotation slots hit a daily 429 or a 503 and were retried.

The pool here knows each model's per-minute budget, treats every (model, API key) pair as its own
lane (the two keys belong to different Google accounts, so their quotas are separate), keeps lanes
that hit a daily limit out of the rest of the run, and lets many batches run at once without any
lane exceeding its own requests-per-minute.

Two tiers:
  bulk    cheap models with large daily allowances read every batch.
  verify  the stronger models, with ~20 requests a day each, only re-read the batches whose bulk
          result looks suspect (see suspicion()).

No network code lives here: callers pass a function that makes one request, so the scheduling can
be tested offline (scripts/test_gemini_pool.py).
"""
import os
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

# rpm = requests per minute we allow ourselves per lane. The free tier lists 15 RPM for the lite
# models and 5 for the others (Google AI Studio quota page); the lite lanes run at 12 to leave
# headroom under the 250K tokens-per-minute cap, since each batch carries ~10 images.
MODEL_PROFILES = {
    "gemini-3.5-flash-lite": {"tier": "bulk", "rpm": 12},
    "gemini-3.1-flash-lite": {"tier": "bulk", "rpm": 12},
    "gemini-3.5-flash": {"tier": "verify", "rpm": 5},
    "gemini-3-flash": {"tier": "verify", "rpm": 5},
    "gemini-3.6-flash": {"tier": "verify", "rpm": 5},
    "gemini-3.7-flash": {"tier": "verify", "rpm": 5},
    "gemini-3.8-flash": {"tier": "verify", "rpm": 5},
}
DEFAULT_PROFILE = {"tier": "verify", "rpm": 5}
BULK_MODELS = [m for m, p in MODEL_PROFILES.items() if p["tier"] == "bulk"]
VERIFY_MODELS = [m for m, p in MODEL_PROFILES.items() if p["tier"] == "verify"]

NEVER = float("inf")


_FLASH_RE = re.compile(r"^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(?:-(\d{3}|preview[\w.-]*))?$")
_SKIP_RE = re.compile(r"(tts|image|live|audio|embed|thinking|robotics|computer|customtools|native|exp)")


def classify(name):
    """(tier, rpm, version tuple, is_preview) for a text flash model name, else None.
    Names are never listed here: any gemini-<ver>-flash[-lite] the API reports is understood, so a
    new generation joins the rotation by itself and a retired one drops out when ListModels stops
    returning it."""
    m = _FLASH_RE.match(name or "")
    if not m or _SKIP_RE.search(name):
        return None
    ver = tuple(int(x) for x in m.group(1).split("."))
    lite = bool(m.group(2))
    preview = bool(m.group(3) and m.group(3).startswith("preview"))
    return ("bulk", 12) if lite else ("verify", 5), ver, preview


def profile_for(model):
    if model in MODEL_PROFILES:
        return MODEL_PROFILES[model]
    c = classify(model)
    if c:
        return {"tier": c[0][0], "rpm": c[0][1]}
    return DEFAULT_PROFILE


def choose_models(avail, max_bulk=3, max_verify=5, env=os.environ):
    """Picks (bulk, verify) model lists, newest first, from what the keys can call.
    GEMINI_BULK_MODELS / GEMINI_VERIFY_MODELS (comma lists) override the choice.
    With no discovery result (API unreachable) the built-in defaults are returned."""
    ov_b = [x.strip() for x in (env.get("GEMINI_BULK_MODELS") or "").split(",") if x.strip()]
    ov_v = [x.strip() for x in (env.get("GEMINI_VERIFY_MODELS") or "").split(",") if x.strip()]
    if not avail:
        return ov_b or list(BULK_MODELS), ov_v or list(VERIFY_MODELS)
    found = {"bulk": [], "verify": []}
    for name in avail:
        c = classify(name)
        if c:
            found[c[0][0]].append((name, c[1], c[2]))

    def pick(tier, limit):
        rows = found[tier]
        stable = [r for r in rows if not r[2]]
        rows = stable or rows                      # previews only when nothing stable exists
        rows.sort(key=lambda r: r[1], reverse=True)
        return [r[0] for r in rows[:limit]]

    bulk = [m for m in ov_b if m in avail] or pick("bulk", max_bulk)
    verify = [m for m in ov_v if m in avail] or pick("verify", max_verify)
    return bulk, verify


class Lane:
    """One (model, key) pair: its own rate limit, its own cooldowns."""

    def __init__(self, model, key, tier=None):
        prof = profile_for(model)
        self.model, self.key = model, key
        self.tier, self.rpm = tier or prof["tier"], prof["rpm"]
        self.id = "%s/%s" % (model, key[:6])
        self.next_ok = 0.0          # earliest time another request may start
        self.dead = False           # 404 / refused key / daily quota reached
        self.dead_reason = ""
        self.calls = 0
        self.ok = 0
        self.latency = 0.0
        self.streak = 0             # consecutive transient failures, for backoff
        self.errors = Counter()


class Pool:
    def __init__(self, keys, models, clock=time.time, sleep=time.sleep, tiers=None):
        self.lock = threading.Lock()
        self.clock, self.sleep = clock, sleep
        tiers = tiers or {}
        self.lanes = [Lane(m, k, tiers.get(m)) for m in models for k in keys]

    # -- scheduling -----------------------------------------------------------------------
    def alive(self, tier):
        with self.lock:
            return [l for l in self.lanes if l.tier == tier and not l.dead]

    def acquire(self, tier, avoid=(), max_wait=300.0):
        """Reserve the next request slot on a lane of `tier`. Waits for a lane to be ready;
        returns None when no lane is left alive or the wait would exceed max_wait."""
        deadline = self.clock() + max_wait
        while True:
            with self.lock:
                alive = [l for l in self.lanes if l.tier == tier and not l.dead]
                if not alive:
                    return None
                now = self.clock()
                ready = [l for l in alive if l.next_ok <= now]
                if ready:
                    ready.sort(key=lambda l: (l.id in avoid, l.calls))
                    lane = ready[0]
                    lane.next_ok = now + 60.0 / lane.rpm
                    lane.calls += 1
                    return lane
                wait = min(l.next_ok for l in alive) - now
            if wait == NEVER or self.clock() + min(wait, 1.0) > deadline:
                return None
            self.sleep(max(0.02, min(wait, 1.0)))

    def report(self, lane, ok, latency=0.0, status=None, daily=False, transient=False):
        with self.lock:
            now = self.clock()
            if ok:
                lane.ok += 1
                lane.latency += latency
                lane.streak = 0
                return
            lane.errors[status if status is not None else ("transport" if transient else "other")] += 1
            if status == 404:
                for l in self.lanes:           # the model does not exist for this account
                    if l.model == lane.model:
                        l.dead, l.dead_reason = True, "404"
            elif status == 403:
                lane.dead, lane.dead_reason = True, "key refused (403)"
            elif status == 429:
                if daily:
                    lane.dead, lane.dead_reason = True, "daily quota"
                else:
                    lane.next_ok = max(lane.next_ok, now + 60.0)
            elif status in (500, 502, 503, 504) or transient:
                lane.streak += 1
                if lane.streak >= 5:           # overloaded for good measure: stop hammering it this run
                    lane.dead, lane.dead_reason = True, "overloaded (%d failures in a row)" % lane.streak
                backoff = min(60.0, 6.0 * (2 ** (lane.streak - 1)))
                lane.next_ok = max(lane.next_ok, now + backoff)

    def summary(self):
        rows = []
        with self.lock:
            for l in self.lanes:
                avg = (l.latency / l.ok) if l.ok else 0.0
                errs = ", ".join("%s x%d" % (k, v) for k, v in sorted(l.errors.items(), key=lambda kv: str(kv[0])))
                rows.append("%-38s %-6s calls=%-3d ok=%-3d avg=%5.1fs%s%s"
                            % (l.id, l.tier, l.calls, l.ok, avg,
                               ("  DEAD(%s)" % l.dead_reason) if l.dead else "",
                               ("  errors: " + errs) if errs else ""))
        return rows


def run_batches(pool, indexes, make_call, tier, workers, max_attempts=8, max_wait=300.0, log=print,
                deadline=None):
    """Runs make_call(index, model, key) -> list for every index, many at once.

    make_call must raise an exception carrying .status / .daily / .transient (GeminiError) on
    failure. Returns {index: items or None, ...} plus {index: model that answered}."""
    results, answered = {}, {}

    def work(i):
        avoid, attempts = set(), 0
        while attempts < max_attempts:
            if deadline is not None and pool.clock() > deadline:
                return i, None, None           # out of time: the caller keeps what it has
            lane = pool.acquire(tier, avoid, max_wait)
            if lane is None:
                return i, None, None
            t0 = pool.clock()
            try:
                out = make_call(i, lane.model, lane.key)
            except Exception as exc:  # noqa: BLE001 - classified below, never kills the run
                pool.report(lane, False, status=getattr(exc, "status", None),
                            daily=getattr(exc, "daily", False), transient=getattr(exc, "transient", False))
                log("[Gemini] batch %d failed on %s: %s" % (i + 1, lane.id, str(exc)[:140].replace("\n", " ")))
                avoid.add(lane.id)
                attempts += 1
                continue
            pool.report(lane, True, pool.clock() - t0)
            return i, out, lane.model
        return i, None, None

    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        for i, out, model in ex.map(work, list(indexes)):
            results[i] = out
            answered[i] = model
    return results, answered


# -- result checking --------------------------------------------------------------------------
def suspicion(items, known_name=None):
    """Counts the signs that a batch's reading is unreliable: missing or implausible CP/HP/IVs,
    a name the species table does not know. 0 means nothing to doubt."""
    score = 0
    for it in items or []:
        if not isinstance(it, dict) or not it.get("name"):
            continue
        cp, hp = it.get("cp"), it.get("hp")
        if cp is None:
            score += 1
        elif not isinstance(cp, (int, float)) or not (10 <= cp <= 10000):
            score += 2
        if hp is None:
            score += 1
        elif not isinstance(hp, (int, float)) or not (1 <= hp <= 1000):
            score += 2
        for k in ("atkIV", "defIV", "staIV"):
            v = it.get(k)
            if v is not None and (not isinstance(v, (int, float)) or not (0 <= v <= 15)):
                score += 2
        if known_name is not None and not known_name(it["name"]):
            score += 2
    return score


def pick_replacement(old_items, new_items, known_name=None):
    """A verify-tier answer replaces the bulk answer only if it is not empty and is no more
    suspect than the original."""
    if not new_items:
        return False
    if not old_items:
        return True
    return suspicion(new_items, known_name) <= suspicion(old_items, known_name)
