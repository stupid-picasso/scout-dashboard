#!/usr/bin/env python3
"""Compares Gemini models on the SAME frames of one screen recording.

Why: the video import rotates several models and nobody has measured how often each one misreads
CP, HP, IVs or names. This sends identical batches to every model the API keys can call, then
reports per model: success rate, latency, how much of each field it filled, how often it agrees
with the majority of the other models, and (optionally) how often it matches the true values from a
CSV export of the same Pokemon.

  python scripts/benchmark_models.py --video clip.mp4 [--truth data/truth.csv] [--batches 6]

Needs GEMINI_API_KEY_1 / GEMINI_API_KEY_2. Writes data/benchmark_models.md and .json.
"""
import argparse, csv, json, os, re, sys, tempfile, threading, time
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import pogo_extract as px  # noqa: E402
import gemini_pool as gp  # noqa: E402

FIELDS = ["cp", "hp", "atkIV", "defIV", "staIV", "candy", "xlCandy", "stardust", "fastMove", "chargeMove1", "chargeMove2", "gender"]
MODEL_RE = re.compile(r"^gemini-(2\.5|3(\.\d+)?)-flash(-lite)?$")


def norm(v):
    return str(v).strip().lower() if v is not None else None


def pick_batches(frames, n, per):
    """n groups of `per` consecutive frames, spread evenly over the recording."""
    if len(frames) <= per:
        return [frames]
    starts = [int(i * (len(frames) - per) / max(1, n - 1)) for i in range(n)] if n > 1 else [0]
    seen, out = set(), []
    for s in starts:
        if s not in seen:
            seen.add(s)
            out.append(frames[s:s + per])
    return out


def read_truth(path):
    """Rows of a Poke Genie style CSV: name, cp, hp, atk/def/sta IV (column names matched loosely)."""
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        rd = csv.DictReader(f)
        cols = {h.lower().strip(): h for h in (rd.fieldnames or [])}
        find = lambda *keys: next((cols[c] for c in cols if any(k in c for k in keys)), None)
        cn, cc, ch = find("name"), find("cp"), find("hp")
        ca, cd, cs = find("atk", "attack"), find("def", "defense"), find("sta", "stamina")
        for r in rd:
            def num(c):
                try:
                    return int(float(str(r.get(c, "")).replace(",", ""))) if c and str(r.get(c, "")).strip() != "" else None
                except ValueError:
                    return None
            if cn and r.get(cn):
                rows.append({"name": norm(r[cn]), "cp": num(cc), "hp": num(ch), "atkIV": num(ca), "defIV": num(cd), "staIV": num(cs)})
    return rows


def run_model(model, keys, batches, prompt, results, lock, log):
    prof = gp.profile_for(model)
    gap = 60.0 / prof["rpm"]
    for j, frames in enumerate(batches):
        key = keys[j % len(keys)]
        imgs = [px.image_to_base64_jpeg(p) for p in frames]
        t0 = time.time()
        rec = {"model": model, "batch": j, "latency": None, "status": "ok", "items": []}
        try:
            reply = px.call_gemini(prompt, imgs, model, key, "")
            arr = px.extract_json_array(reply)
            rec["latency"] = time.time() - t0
            if arr is None:
                rec["status"] = "unparseable"
            else:
                rec["items"] = [i for i in arr if isinstance(i, dict) and i.get("name")]
        except px.GeminiError as e:
            rec["latency"] = time.time() - t0
            rec["status"] = "http %s%s" % (e.status, " daily" if e.daily else "") if e.status else ("transport" if e.transient else "error")
        with lock:
            results.append(rec)
        log("[bench] %-24s batch %d -> %s, %d item(s), %.1fs" % (model, j + 1, rec["status"], len(rec["items"]), rec["latency"] or 0))
        if rec["status"].startswith("http 404"):
            return
        time.sleep(gap)


def analyse(results, models, truth):
    by_model = defaultdict(list)
    for r in results:
        by_model[r["model"]].append(r)
    # majority value per (batch, item key, field) across models
    votes = defaultdict(lambda: defaultdict(Counter))
    for r in results:
        for it in r["items"]:
            key = (r["batch"], norm(it.get("name")), it.get("cp"))
            for f in FIELDS:
                if it.get(f) is not None:
                    votes[key][f][norm(it[f])] += 1
    out = {}
    for m in models:
        rs = by_model.get(m, [])
        n = len(rs)
        ok = [r for r in rs if r["status"] == "ok"]
        items = [(r, it) for r in ok for it in r["items"]]
        row = {"batches": n, "ok": len(ok), "status": dict(Counter(r["status"] for r in rs)),
               "avg_latency": (sum(r["latency"] for r in ok) / len(ok)) if ok else None,
               "items": len(items), "fill": {}, "agree": {}, "truth": {}}
        for f in FIELDS:
            row["fill"][f] = (sum(1 for _, it in items if it.get(f) is not None) / len(items)) if items else None
            num = den = 0
            for r, it in items:
                key = (r["batch"], norm(it.get("name")), it.get("cp"))
                v = it.get(f)
                c = votes[key][f]
                if v is None or sum(c.values()) < 2:
                    continue
                den += 1
                top = c.most_common(1)[0]
                if norm(v) == top[0]:
                    num += 1
            row["agree"][f] = (num / den) if den else None
        if truth:
            tmap = defaultdict(list)
            for t in truth:
                tmap[(t["name"], t["cp"])].append(t)
            found = 0
            exact = Counter()
            for _, it in items:
                nm = norm(re.sub(r"\s*\(.*\)$", "", str(it.get("name"))))
                cand = tmap.get((nm, it.get("cp")))
                if not cand:
                    continue
                found += 1
                t = cand[0]
                for f in ("hp", "atkIV", "defIV", "staIV"):
                    if it.get(f) is not None and t.get(f) is not None:
                        exact[f + "_n"] += 1
                        exact[f + "_ok"] += int(it[f] == t[f])
            row["truth"] = {"items_found_in_truth": found, "items": len(items),
                            **{f: (exact[f + "_ok"] / exact[f + "_n"]) if exact[f + "_n"] else None for f in ("hp", "atkIV", "defIV", "staIV")}}
        out[m] = row
    return out


def pct(v):
    return "-" if v is None else "%d%%" % round(v * 100)


def render(res, models, meta):
    L = ["# Gemini model benchmark", "", "Same frames sent to every model. %s" % meta, "",
         "| Model | Batches ok | Avg latency | Items | CP filled | HP filled | IV filled | CP agrees | HP agrees | IV agrees | Truth: name+CP found | Truth: HP | Truth: IV |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for m in models:
        r = res[m]
        iv = lambda d: (None if all(d[f] is None for f in ("atkIV", "defIV", "staIV")) else sum(d[f] or 0 for f in ("atkIV", "defIV", "staIV")) / 3)
        tr = r["truth"]
        L.append("| %s | %d/%d | %s | %d | %s | %s | %s | %s | %s | %s | %s | %s | %s |" % (
            m, r["ok"], r["batches"], ("%.1fs" % r["avg_latency"]) if r["avg_latency"] else "-", r["items"],
            pct(r["fill"]["cp"]), pct(r["fill"]["hp"]), pct(iv(r["fill"])),
            pct(r["agree"]["cp"]), pct(r["agree"]["hp"]), pct(iv(r["agree"])),
            ("%d/%d" % (tr.get("items_found_in_truth", 0), tr.get("items", 0))) if tr else "n/a",
            pct(tr.get("hp")) if tr else "n/a", pct(iv({k: tr.get(k) for k in ("atkIV", "defIV", "staIV")})) if tr else "n/a"))
    L += ["", "Failures by model:", ""]
    for m in models:
        L.append("- %s: %s" % (m, json.dumps(res[m]["status"])))
    L += ["", "How to read it: *agrees* is how often a model's value equals the majority value among all models that read the same Pokemon "
          "(a proxy for reliability when no truth file is given). *Truth* compares to the CSV export: an item counts as found when its name and CP match a CSV row."]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--truth")
    ap.add_argument("--batches", type=int, default=6)
    ap.add_argument("--per-batch", type=int, default=10)
    ap.add_argument("--fps", type=float, default=3)
    ap.add_argument("--models", help="comma list; default: every flash model the keys can call")
    ap.add_argument("--out", default="data/benchmark_models")
    a = ap.parse_args()
    keys = px.get_gemini_keys()
    if not keys:
        sys.exit("No Gemini API key found (GEMINI_API_KEY_1 / GEMINI_API_KEY_2).")
    avail = px.discover_models(keys)
    if a.models:
        models = [m.strip() for m in a.models.split(",") if m.strip()]
    else:
        models = sorted(m for m in avail if MODEL_RE.match(m)) or list(gp.BULK_MODELS + gp.VERIFY_MODELS)
    print("[bench] models:", models)
    with tempfile.TemporaryDirectory() as tmp:
        frames = px.extract_frames(a.video, tmp, a.fps, False, 0.3)
        batches = pick_batches(frames, a.batches, a.per_batch)
        print("[bench] %d frame(s) -> %d batch(es) of up to %d" % (len(frames), len(batches), a.per_batch))
        results, lock, threads = [], threading.Lock(), []
        for m in models:
            t = threading.Thread(target=run_model, args=(m, keys, batches, px.VIDEO_IMPORT_PROMPT, results, lock, print))
            t.start()
            threads.append(t)
        for t in threads:
            t.join()
    truth = read_truth(a.truth) if a.truth and os.path.exists(a.truth) else None
    res = analyse(results, models, truth)
    meta = "%d batches x up to %d frames from `%s`%s." % (len(batches), a.per_batch, os.path.basename(a.video), ", truth: %d rows" % len(truth) if truth else ", no truth file")
    md = render(res, models, meta)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    open(a.out + ".md", "w").write(md)
    json.dump({"models": res, "meta": meta, "raw": results}, open(a.out + ".json", "w"), indent=1, default=str)
    print(md)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        open(os.environ["GITHUB_STEP_SUMMARY"], "a").write(md)


if __name__ == "__main__":
    main()
