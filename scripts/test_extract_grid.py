#!/usr/bin/env python3
"""Grid mode of the recording extractor (pogo_extract.py --grid) and its workflow plumbing, offline: the Gemini API is a stub (the pool,
tiers and retries are the real ones), ffmpeg runs on a synthetic clip when it is installed, git runs on throw-away local repositories.

  - the grid prompt is the app's gridPrompt() word for word;
  - a reply -> per-frame readings (malformed, empty and short replies included), in frame order whatever order the requests finish in;
  - the output file shape and the clean start (the file is written whole, never merged with an earlier one);
  - near-identical frames collapse before they are read;
  - --video and --appraisal still write their own files, and --grid leaves the detail and appraisal files alone;
  - extract-run.yml's mode selection, reset and commit steps, and extract-grid.yml's shape;
  - the grid file can be committed although data/*.json is git-ignored.

GRID_PY=<path> and GRID_WF=<dir> point the test at other copies of pogo_extract.py / the workflow folder (used to prove it fails on a broken one)."""
import io, json, os, re, shutil, subprocess, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PYDIR = os.path.dirname(os.path.abspath(os.environ['GRID_PY'])) if os.environ.get('GRID_PY') else ROOT
WF = os.environ.get('GRID_WF') or os.path.join(ROOT, '.github', 'workflows')
sys.path.insert(0, PYDIR)
os.environ["GEMINI_API_KEY_1"] = "keyAAAAAA111"
os.environ["GEMINI_API_KEY_2"] = "keyBBBBBB222"
os.environ.setdefault("POGO_DEBUG_DIR", tempfile.mkdtemp())
os.environ["PREFLIGHT"] = "0"
import base64
import pogo_extract as px
from PIL import Image

fails = []


def check(name, ok, detail=''):
    print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)[:400]))
    if not ok:
        fails.append(name)


# ---- the prompt is the app's ---------------------------------------------------------------------------------------------
APP = open(os.path.join(ROOT, 'Scout Dashboard.dc.html'), encoding='utf-8').read()
i = APP.index('  gridPrompt() {')
body = APP[i:APP.index('\n  }\n', i)]
app_prompt = ''.join(re.findall(r"'((?:[^'\\]|\\.)*)'", body.split('return', 1)[1]))
check('GRID_PROMPT equals the text of gridPrompt() in the app', px.GRID_PROMPT == app_prompt, (px.GRID_PROMPT[:60], app_prompt[:60]))
check('the prompt asks for the app\'s reply shape', '"image": 1, "count": number|null, "max": number|null, "tiles": [{"name": string, "cp": number}]' in px.GRID_PROMPT)

# ---- reply -> readings ---------------------------------------------------------------------------------------------------
R = px.grid_readings_from_reply
good = [{"image": 1, "count": 1225, "max": 1300, "tiles": [{"name": "Pidgey", "cp": 120}, {"name": "Eevee", "cp": 450}, {"name": "Bobby", "cp": 800}]},
        {"image": 2, "count": None, "max": None, "tiles": [{"name": "Zubat", "cp": 55}]}]
r = R(good, 2)
check('tiles keep the reply order (reading order)', [t["name"] for t in r[0]["n"]] == ["Pidgey", "Eevee", "Bobby"], r)
check('the header is {count, max}; null when neither is read', r[0]["head"] == {"count": 1225, "max": 1300} and r[1]["head"] is None, r)
check('a reply that covers fewer frames than were sent leaves the rest unread (None)', R(good, 4)[2:] == [None, None])
check('frames are found by their "image" number, not by position', R([good[1], good[0]], 2)[0]["n"][0]["name"] == "Pidgey")
check('without image numbers the k-th object is frame k', R([{"tiles": [{"name": "A", "cp": 1}]}, {"tiles": [{"name": "B", "cp": 2}]}], 2)[1]["n"][0]["name"] == "B")
check('None, a non-list and an empty list read nothing', R(None, 3) == [None] * 3 and R("text", 2) == [None] * 2 and R([], 2) == [None] * 2)
check('non-object entries are skipped, not guessed', R([None, "x", 5], 3) == [None] * 3)
m = R([{"image": 1, "tiles": [{"name": "Rattata", "cp": "55"}, {"name": "Nick", "cp": None}, {"cp": 77}, {"name": ""}, {"name": "Odd", "cp": 12.5},
                              {"name": "B", "cp": True}, "junk", None, {"name": " Mew ", "cp": 1e3}]}], 1)[0]
check('cp: numeric strings and whole floats become ints, anything else null', [t["cp"] for t in m["n"]] == [55, None, 77, None, None, 1000], m)
check('a tile needs a name or a cp; names are trimmed', [t["name"] for t in m["n"]] == ["Rattata", "Nick", "", "Odd", "B", "Mew"], m)
check('tiles that are not objects, or have neither, are dropped', len(m["n"]) == 6)
check('a frame with no tiles field is read, with no tiles', R([{"image": 1, "count": 3, "max": 9}], 1)[0] == {"n": [], "head": {"count": 3, "max": 9}})
check('a frame with tiles: "oops" is read, with no tiles', R([{"image": 1, "tiles": "oops"}], 1)[0]["n"] == [])
check('count/max that are not whole numbers are null', R([{"image": 1, "count": "many", "max": 12.5, "tiles": []}], 1)[0]["head"] is None)
check('image must be a number, "1" does not count', R([{"image": "1", "tiles": [{"name": "A", "cp": 1}]}], 1)[0] is not None, 'falls back to position, like the app')
check('image true is not 1', R([{"image": True, "tiles": []}, {"image": 1, "tiles": [{"name": "A", "cp": 1}]}], 1)[0]["n"][0]["name"] == "A")

# ---- stubbed pool --------------------------------------------------------------------------------------------------------
class Resp:
    def __init__(self, status, body):
        self.status_code, self._b = status, body
        self.ok = 200 <= status < 300
        self.text = json.dumps(body)

    def json(self):
        return self._b


calls, lock = [], threading.Lock()
BEHAVE = {"mode": "ok", "bad_calls": set(), "delay": True}


def frame_id(b64):
    im = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    return round(im.getpixel((2, 2))[0] / 5)


def reply_text(body):
    imgs = [p["inline_data"]["data"] for p in body["contents"][0]["parts"] if "inline_data" in p]
    ids = [frame_id(d) for d in imgs]
    if BEHAVE["mode"] == "garbage" or (ids and ids[0] in BEHAVE["bad_calls"]):
        return "I cannot read these"
    objs = [{"image": k + 1, "count": 40 + fid, "max": 1300, "tiles": [{"name": "Pidgey", "cp": 1000 + fid}, {"name": "Eevee", "cp": 2000 + fid}]} for k, fid in enumerate(ids)]
    if BEHAVE["mode"] == "short":
        objs = objs[:1]
    if BEHAVE["mode"] == "fenced":
        return "```json\n" + json.dumps(objs) + "\n```"
    return json.dumps(objs)


def fake_post(url, json=None, timeout=None):
    import json as _j
    model = url.split("/models/")[1].split(":")[0]
    if ":countTokens" in url:
        return Resp(200, {"totalTokens": 1})
    text = json["contents"][0]["parts"][0]["text"]
    with lock:
        calls.append((model, text, sum(1 for p in json["contents"][0]["parts"] if "inline_data" in p)))
    if BEHAVE["delay"]:
        time.sleep(0.02 + 0.03 * ((time.time() * 1000) % 3) / 3)   # requests finish out of order
    return Resp(200, {"candidates": [{"content": {"parts": [{"text": reply_text(json)}]}}]})


def fake_get(url, timeout=None):
    names = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"]
    return Resp(200, {"models": [{"name": "models/" + n, "supportedGenerationMethods": ["generateContent"]} for n in names]})


px.requests.post, px.requests.get = fake_post, fake_get
px.BATCH_PACE_S = 0
orig_lane = px.gemini_pool.Lane.__init__


def fast_lane(self, *a, **k):
    orig_lane(self, *a, **k)
    self.rpm = 60000


px.gemini_pool.Lane.__init__ = fast_lane
tmp = tempfile.mkdtemp()


def make_frames(n, d=None):
    d = d or tempfile.mkdtemp(dir=tmp)
    out = []
    for k in range(n):
        p = os.path.join(d, "frame_%04d.png" % k)
        Image.new("RGB", (64, 64), (k * 5, 10, 10)).save(p)
        out.append(p)
    return out


frames = make_frames(37)
got = px.run_grid_ocr(frames)
check('one reading per frame', len(got) == 37, len(got))
check('frames come back in order whatever order the requests finished in', [r["n"][0]["cp"] for r in got] == [1000 + k for k in range(37)], [r["n"][0]["cp"] for r in got][:10])
check('requests carry the grid prompt and 4 frames (the last one the rest)', all(t == px.GRID_PROMPT for _, t, _ in calls) and sorted({n for _, _, n in calls}) == [1, 4] and len(calls) == 10, sorted({n for _, _, n in calls}))
check('the header of each frame is kept', got[5]["head"] == {"count": 45, "max": 1300})

calls.clear(); BEHAVE["mode"] = "fenced"
check('a reply in a markdown fence is read', len(px.run_grid_ocr(make_frames(5))[0]["n"]) == 2)
calls.clear(); BEHAVE["mode"] = "short"
short = px.run_grid_ocr(make_frames(8))
check('a request answered for its first frame only: the others are unread', [r is None for r in short] == [False, True, True, True] * 2, [r is None for r in short])
BEHAVE["mode"] = "ok"; BEHAVE["bad_calls"] = {4}          # the request whose first frame is #4 never gives text anyone can parse
bad = px.run_grid_ocr(make_frames(12))
check('a request nobody can parse leaves just its frames unread; the rest are read', [r is None for r in bad] == [False] * 4 + [True] * 4 + [False] * 4, [r is None for r in bad])
BEHAVE["bad_calls"] = set(); BEHAVE["mode"] = "garbage"
check('garbage everywhere: nothing read', all(r is None for r in px.run_grid_ocr(make_frames(6))))
BEHAVE["mode"] = "ok"

# ---- output file ---------------------------------------------------------------------------------------------------------
d = tempfile.mkdtemp(dir=tmp)
out = os.path.join(d, "data", "grid_import.json")
px.write_grid_import(out, [{"n": [{"name": "Flabébé", "cp": 10}], "head": {"count": 1, "max": 2}}, None, {"n": [], "head": None}], "clip.mp4")
data = json.load(open(out, encoding="utf-8"))
check('file shape: frames, source, extractedAt', sorted(data) == ["extractedAt", "frames", "source"] and data["source"] == "clip.mp4", sorted(data))
check('frames carry i, n, head; an unread frame has n null', data["frames"] == [{"i": 0, "n": [{"name": "Flabébé", "cp": 10}], "head": {"count": 1, "max": 2}}, {"i": 1, "n": None, "head": None}, {"i": 2, "n": [], "head": None}], data["frames"])
check('extractedAt is an ISO UTC time', re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", data["extractedAt"]) is not None, data["extractedAt"])

# ---- main(): the three modes ---------------------------------------------------------------------------------------------
cwd0 = os.getcwd()
px.preflight_gemini = lambda keys: None
vid = os.path.join(tmp, "clip.mp4")
open(vid, "wb").write(b"x")


def run_main(argv, work):
    os.chdir(work)
    old = sys.argv
    sys.argv = ["pogo_extract.py"] + argv
    try:
        px.main()
        return 0
    except SystemExit as e:
        return e.code
    finally:
        sys.argv = old
        os.chdir(cwd0)


def seeded():
    w = tempfile.mkdtemp(dir=tmp)
    os.makedirs(os.path.join(w, "data"))
    open(os.path.join(w, "data", "pokemon_import.json"), "w").write('[{"name":"Old","cp":1}]')
    open(os.path.join(w, "data", "appraisal_import.json"), "w").write('[{"name":"OldIv","cp":2}]')
    return w


frames3 = make_frames(9)
px.extract_frames = lambda *a, **k: frames3
w = seeded()
before = {f: open(os.path.join(w, "data", f), "rb").read() for f in ("pokemon_import.json", "appraisal_import.json")}
rc = run_main(["--grid", vid], w)
after = {f: open(os.path.join(w, "data", f), "rb").read() for f in ("pokemon_import.json", "appraisal_import.json")}
g = json.load(open(os.path.join(w, "data", "grid_import.json"), encoding="utf-8"))
check('--grid writes data/grid_import.json: every frame, in order, source = the video name', rc == 0 and [f["i"] for f in g["frames"]] == list(range(9)) and g["source"] == "clip.mp4" and [f["n"][0]["cp"] for f in g["frames"]] == [1000 + k for k in range(9)], (rc, g))
check('--grid leaves the detail and appraisal files byte for byte alone', before == after)

# a stale grid file never survives and is never merged: the second run holds only its own frames
stale = {"frames": [{"i": 0, "n": [{"name": "STALE", "cp": 1}], "head": None}] * 50, "source": "old.mp4", "extractedAt": "2020-01-01T00:00:00Z"}
json.dump(stale, open(os.path.join(w, "data", "grid_import.json"), "w"))
frames3 = make_frames(3); px.extract_frames = lambda *a, **k: frames3
run_main(["--grid", vid], w)
g2 = json.load(open(os.path.join(w, "data", "grid_import.json"), encoding="utf-8"))
check('clean start: a second run replaces the file whole (no stale frames, new source and time)', len(g2["frames"]) == 3 and "STALE" not in json.dumps(g2) and g2["source"] == "clip.mp4" and g2["extractedAt"] > "2021", g2)

BEHAVE["mode"] = "garbage"
w2 = tempfile.mkdtemp(dir=tmp)
rc = run_main(["--grid", vid], w2)
check('no frame read: exit 1 and no file written', rc == 1 and not os.path.exists(os.path.join(w2, "data", "grid_import.json")), rc)
BEHAVE["mode"] = "ok"
px.extract_frames = lambda *a, **k: []
check('no frames at all: exit 1', run_main(["--grid", vid], tempfile.mkdtemp(dir=tmp)) == 1)

seen_args = []
px.extract_frames = lambda path, outdir, fps, scene, thr, **k: (seen_args.append((fps, scene, thr)), frames3)[1]
run_main(["--grid", vid, "--fps", "2"], tempfile.mkdtemp(dir=tmp))
check('--grid passes fps through and leaves scene detection off unless asked', seen_args == [(2, False, 0.3)], seen_args)
run_main(["--grid", vid, "--fps", "3", "--scene-detect", "--scene-threshold", "0.2"], tempfile.mkdtemp(dir=tmp))
check('--scene-detect is honoured', seen_args[-1] == (3, True, 0.2), seen_args)

# detail and appraisal: still their own files, and never the grid file
px.extract_frames = lambda *a, **k: frames3
px.run_gemini_video_ocr = lambda frames, prompt=None, **k: [{"name": "Pidgey", "cp": 100, "hp": 30}]
w = tempfile.mkdtemp(dir=tmp)
rc = run_main(["--video", vid], w)
check('--video writes data/pokemon_import.json and not the grid file', rc == 0 and json.load(open(os.path.join(w, "data", "pokemon_import.json")))[0]["name"] == "Pidgey" and not os.path.exists(os.path.join(w, "data", "grid_import.json")))
px.run_appraisal_pipeline = lambda frames: [{"name": "Pidgey", "cp": 100, "hp": 30, "atkIV": 15}]
w = tempfile.mkdtemp(dir=tmp)
rc = run_main(["--appraisal", vid], w)
check('--appraisal writes data/appraisal_import.json and not the grid file', rc == 0 and json.load(open(os.path.join(w, "data", "appraisal_import.json")))[0]["name"] == "Pidgey" and not os.path.exists(os.path.join(w, "data", "grid_import.json")))
check('--video / --appraisal / --image / --grid all stay separate branches', all(f in open(os.path.join(PYDIR, 'pogo_extract.py'), encoding='utf-8').read() for f in ('if args.appraisal:', 'if args.grid:', 'if args.video:')))

# ---- frames: near-identical ones collapse ----------------------------------------------------------------------------------
d = tempfile.mkdtemp(dir=tmp)
runs = []
for k, col in enumerate([(200, 30, 30)] * 4 + [(30, 30, 200)] * 3 + [(30, 200, 30)] * 2):
    p = os.path.join(d, "f%02d.png" % k)
    Image.new("RGB", (96, 96), col).save(p)
    runs.append(p)
kept = px.dedupe_similar_frames(runs)
check('dedupe: 9 frames of 3 screens keep one frame per screen', len(kept) == 3, len(kept))
if shutil.which("ffmpeg") and shutil.which("ffprobe"):
    clip = os.path.join(d, "clip.mp4")
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=red:s=160x288:r=10:d=2", "-f", "lavfi", "-i", "color=c=blue:s=160x288:r=10:d=2",
                    "-f", "lavfi", "-i", "color=c=green:s=160x288:r=10:d=2", "-filter_complex", "[0][1][2]concat=n=3:v=1[v]", "-map", "[v]", "-pix_fmt", "yuv420p", clip], check=True)
    import importlib
    real = importlib.reload(px)
    ex = real.extract_frames(clip, os.path.join(d, "out"), 2, False, 0.3)
    check('a real clip at 2 fps: 12 sampled frames collapse to the 3 screens', len(ex) == 3, len(ex))
else:
    print("skip real-clip dedupe (no ffmpeg)")

# ---- workflows -------------------------------------------------------------------------------------------------------------
import yaml
run_yml = yaml.safe_load(open(os.path.join(WF, "extract-run.yml"), encoding="utf-8"))
steps = run_yml["jobs"]["extract"]["steps"]
step = lambda name: next(s for s in steps if s.get("name", "").startswith(name))


def select_mode(mode):
    envf = os.path.join(tmp, "gh_env_%s" % re.sub(r"\W", "_", mode))
    open(envf, "w").close()
    r = subprocess.run(["bash", "-c", step("Select the mode")["run"]], env=dict(os.environ, IN_MODE=mode, GITHUB_ENV=envf), capture_output=True, text=True)
    return r.returncode, open(envf).read().split(), r.stdout + r.stderr


rc, env, _ = select_mode("detail")
check('mode detail: videos/, --video, data/pokemon_import.json (unchanged)', rc == 0 and env == ["VIDEO_DIR=videos", "EXTRACT_FLAG=--video", "IMPORT_FILE=data/pokemon_import.json"], env)
rc, env, _ = select_mode("appraisal")
check('mode appraisal: appraisal_videos/, --appraisal, data/appraisal_import.json (unchanged)', rc == 0 and env == ["VIDEO_DIR=appraisal_videos", "EXTRACT_FLAG=--appraisal", "IMPORT_FILE=data/appraisal_import.json"], env)
rc, env, _ = select_mode("grid")
check('mode grid: grid_videos/, --grid, data/grid_import.json', rc == 0 and env == ["VIDEO_DIR=grid_videos", "EXTRACT_FLAG=--grid", "IMPORT_FILE=data/grid_import.json"], env)
rc, env, msg = select_mode("bogus")
check('an unknown mode is refused and sets nothing', rc == 1 and env == [] and "unknown extract mode" in msg, (rc, env, msg))

reset = step("Reset import file")
check('the reset step runs for a grid whatever fresh_import says, and for the others unless it is false',
      "inputs.mode == 'grid'" in reset["if"] and "inputs.fresh_import != 'false'" in reset["if"], reset["if"])


def reset_runs(cond, mode, fresh):   # evaluates the step condition the way Actions would
    return eval(cond.replace("inputs.fresh_import", "fresh").replace("inputs.mode", "mode").replace("&&", " and ").replace("||", " or "))


check('reset truth table: detail/appraisal skip it on fresh_import false; grid never does',
      [reset_runs(reset["if"], m, f) for m in ("detail", "appraisal", "grid") for f in ("true", "false")] == [True, False, True, False, True, True])
commit = step("Commit extracted data")["run"]
gm = re.search(r'elif \[ "\$IN_MODE" = "grid" \]; then\n(.*?)\nelse\n', commit, re.S)
check('the grid commit stages and pushes only the grid file, never data/', gm and 'ci_push.sh "Auto-extract grid check from video [skip ci]" "$IMPORT_FILE"' in gm.group(1) and 'data/' not in gm.group(1).replace('data/*.json', '') and '[ ! -f "$IMPORT_FILE" ]' in gm.group(1), gm and gm.group(1))
check('the detail commit is still data/ and the appraisal one its file', 'scripts/ci_push.sh "Auto-extract Pokemon data from video [skip ci]" data/' in commit and 'scripts/ci_push.sh "Auto-extract IV ratings from appraisal video [skip ci]" "$IMPORT_FILE"' in commit)
check('the extract steps pass the mode\'s flag through', 'python pogo_extract.py "$EXTRACT_FLAG" "$DRIVE_VIDEO_PATH"' in step("Extract (Google Drive link)")["run"])

grid_yml = yaml.safe_load(open(os.path.join(WF, "extract-grid.yml"), encoding="utf-8"))
trig = grid_yml.get("on") if "on" in grid_yml else grid_yml.get(True)
job = grid_yml["jobs"]["extract"]
callee_inputs = set(run_yml.get("on", run_yml.get(True))["workflow_call"]["inputs"])
check('extract-grid.yml: dispatch only (no push trigger), the inputs the app sends are declared', list(trig) == ["workflow_dispatch"] and {"drive_link", "fresh_import"} <= set(trig["workflow_dispatch"]["inputs"]), list(trig))
check('extract-grid.yml: calls the reusable workflow with mode grid', job["uses"] == "./.github/workflows/extract-run.yml" and job["with"]["mode"] == "grid", job)
check('extract-grid.yml: a clean import always (constant true), fps 2 and scene detection off by default', job["with"]["fresh_import"] == "true" and trig["workflow_dispatch"]["inputs"]["fps"]["default"] == "2" and trig["workflow_dispatch"]["inputs"]["scene_detect"]["default"] == "false" and "'false'" in job["with"]["scene_detect"], job["with"])
check('extract-grid.yml: same concurrency group, write permission on the job, the two secrets, only declared inputs',
      grid_yml["concurrency"]["group"] == "pogo-data-commit" and job["permissions"] == {"contents": "write"} and set(job["secrets"]) == {"GEMINI_API_KEY_ONE", "GEMINI_API_KEY_TWO"} and set(job["with"]) <= callee_inputs, job)
check('extract.yml and extract-iv.yml are untouched in what they call', yaml.safe_load(open(os.path.join(WF, "extract-iv.yml")))["jobs"]["extract"]["with"]["mode"] == "appraisal" and yaml.safe_load(open(os.path.join(WF, "extract.yml")))["jobs"]["extract"]["with"]["mode"] == "detail")

# ---- committing the grid file: data/*.json is git-ignored ---------------------------------------------------------------------
GENV = dict(os.environ, GIT_AUTHOR_NAME='t', GIT_AUTHOR_EMAIL='t@example.invalid', GIT_COMMITTER_NAME='t', GIT_COMMITTER_EMAIL='t@example.invalid',
            GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_SYSTEM=os.devnull, CI_PUSH_SLEEP='0', CI_PUSH_BRANCH='main')


def git(cwd, *a, check_=True):
    return subprocess.run(['git'] + list(a), cwd=cwd, env=GENV, capture_output=True, text=True, check=check_)


d = tempfile.mkdtemp(dir=tmp)
origin = os.path.join(d, "origin.git")
subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', origin], env=GENV, check=True)
seed = os.path.join(d, "seed")
git(d, 'clone', '-q', origin, seed); git(seed, 'checkout', '-q', '-b', 'main')
os.makedirs(os.path.join(seed, "data"))
open(os.path.join(seed, ".gitignore"), "w").write(open(os.path.join(ROOT, ".gitignore")).read())   # the repository's real ignore rules
open(os.path.join(seed, "data", "pokemon_import.json"), "w").write("[]")
git(seed, 'add', '-A'); git(seed, 'commit', '-q', '-m', 'seed'); git(seed, 'push', '-q', 'origin', 'main')
w1 = os.path.join(d, "w1"); git(d, 'clone', '-q', '-b', 'main', origin, w1)
os.makedirs(os.path.join(w1, "data"), exist_ok=True)
open(os.path.join(w1, "data", "grid_import.json"), "w").write('{"frames": []}')
helper = os.path.join(ROOT, "scripts", "ci_push.sh")
plain = subprocess.run(['bash', helper, 'grid', 'data/grid_import.json'], cwd=w1, env=GENV, capture_output=True, text=True)
tracked_by_rule = subprocess.run(['git', 'check-ignore', '-q', 'data/grid_import.json'], cwd=ROOT).returncode != 0
if tracked_by_rule:
    print("note .gitignore now allow-lists data/grid_import.json: the force-add is a no-op")
else:
    check('without the force-add the helper cannot stage an ignored, untracked file (why the commit step force-adds)', plain.returncode != 0, plain.stdout + plain.stderr)
git(w1, 'add', '-f', 'data/grid_import.json')
forced = subprocess.run(['bash', helper, 'grid', 'data/grid_import.json'], cwd=w1, env=GENV, capture_output=True, text=True)
check('git add -f then ci_push.sh commits and pushes just the grid file', forced.returncode == 0 and git(origin, 'show', 'main:data/grid_import.json').stdout == '{"frames": []}' and git(origin, 'show', '--stat', '--format=', 'main').stdout.count('|') == 1, forced.stdout + forced.stderr)
# the next run on a fresh clone: the file is tracked now, so a plain re-run commits the update
w2 = os.path.join(d, "w2"); git(d, 'clone', '-q', '-b', 'main', origin, w2)
open(os.path.join(w2, "data", "grid_import.json"), "w").write('{"frames": [1]}')
git(w2, 'add', '-f', 'data/grid_import.json')
again = subprocess.run(['bash', helper, 'grid again', 'data/grid_import.json'], cwd=w2, env=GENV, capture_output=True, text=True)
check('a second run (file already in the repo) pushes the new content', again.returncode == 0 and git(origin, 'show', 'main:data/grid_import.json').stdout == '{"frames": [1]}', again.stdout + again.stderr)

# a push that is rejected because main moved, on the very first run (the file is not in the repository yet): ci_push re-applies the file
# after a hard reset, where the file is untracked and ignored again. Recorded, not asserted: it is the cost of not allow-listing the file.
d2 = tempfile.mkdtemp(dir=tmp)
origin2 = os.path.join(d2, "origin.git")
subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', origin2], env=GENV, check=True)
s2 = os.path.join(d2, "seed"); git(d2, 'clone', '-q', origin2, s2); git(s2, 'checkout', '-q', '-b', 'main')
open(os.path.join(s2, ".gitignore"), "w").write(open(os.path.join(ROOT, ".gitignore")).read())
git(s2, 'add', '-A'); git(s2, 'commit', '-q', '-m', 'seed'); git(s2, 'push', '-q', 'origin', 'main')
a = os.path.join(d2, "a"); b = os.path.join(d2, "b")
git(d2, 'clone', '-q', '-b', 'main', origin2, a); git(d2, 'clone', '-q', '-b', 'main', origin2, b)
open(os.path.join(b, "other.txt"), "w").write("x"); git(b, 'add', '-A'); git(b, 'commit', '-q', '-m', 'other'); git(b, 'push', '-q', 'origin', 'main')
os.makedirs(os.path.join(a, "data"), exist_ok=True)
open(os.path.join(a, "data", "grid_import.json"), "w").write("{}")
git(a, 'add', '-f', 'data/grid_import.json')
racy = subprocess.run(['bash', helper, 'grid', 'data/grid_import.json'], cwd=a, env=GENV, capture_output=True, text=True)
print("note first-ever run that loses a push race: exit %d%s" % (racy.returncode, "" if racy.returncode == 0 else " (the file is ignored after the reset; allow-list it in .gitignore to remove this)"))

print("%d failed" % len(fails))
sys.exit(1 if fails else 0)
