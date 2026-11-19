"""
Golden harness for the data scripts: runs each import_*.py / record_tier_trends.py on the small saved game master and PvPoke fixtures
(no network: urllib.request.urlopen is replaced) against a stub pokemon-mechanics.js, and records what the script printed and what it
wrote.

  python3 scripts/fixtures/gm/harness.py SCRIPTS_DIR OUT.json     (how golden.json was produced, from the scripts as they were
                                                                   at f0c5bd7, before scripts/gm_lib.py existed)

scripts/test_gm_lib.py runs the same harness on the scripts as they are now and requires the result to be byte-identical to golden.json.
The scripts refuse tiny inputs (a game master with fewer than 100 or 800 species is "a changed shape"); the harness lowers those
guards: the old copies by a text patch of the literal, the new ones through their MIN_* constants.
"""
import contextlib, hashlib, io, json, os, re, runpy, shutil, sys, tempfile, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
GM_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
GM_FILE = os.path.join(HERE, "game_master_small.json")
PVPOKE = json.load(open(os.path.join(HERE, "pvpoke_small.json"), encoding="utf-8"))
TODAY = "2026-11-19"

BLOCKS = ["SPECIES_GM", "SPECIES_FAMILY", "MEGA_LEVEL_DATA", "SIZE_DATA", "SPECIES_CLASS", "EVOLUTION_BRANCHES", "TIER_TRENDS"]
LATE = ["PVP_TIER", "PVPOKE_GM"]
SCRIPT_OF = {"SPECIES_GM": "import_mega_levels.py", "SPECIES_FAMILY": "import_mega_levels.py", "MEGA_LEVEL_DATA": "import_mega_levels.py", "SIZE_DATA": "import_size_data.py",
             "SPECIES_CLASS": "import_species_class.py", "EVOLUTION_BRANCHES": "import_evolution_branches.py", "TIER_TRENDS": "record_tier_trends.py",
             "PVP_TIER": "import_pvp_tier_data.py", "PVPOKE_GM": "import_pvpoke_gamemaster.py"}
BODY = {"PVP_TIER": 'const PVP_TIER_GREAT = {"azumarill":{"tier":"C"},"bulbasaur":{"tier":"B"},"gone":{"tier":"B"}};\nconst PVP_CUP_TABLES = {};',
        "TIER_TRENDS": 'const TIER_TRENDS = {"updated":"2026-11-12","changes":[{"s":"x","l":"great","f":"C","t":"B","on":"2026-11-12"},{"s":"old","l":"great","f":"C","t":"B","on":"2026-01-01"}]};'}


def stub(without=()):
    """A tiny pokemon-mechanics.js with every generated block (old contents) and the anchors the scripts insert next to."""
    def blk(n):
        return "// GENERATED BLOCK: %s (%s) — do not hand-edit\n%s\n// END GENERATED BLOCK: %s" % (n, SCRIPT_OF[n], BODY.get(n, "const %s = {\"old\":1};" % n), n)
    parts = ["const BASE_STATS = {};"]
    parts += [blk(n) for n in BLOCKS if n not in without]
    parts += ["function megaEvolveCostFor(name, everMegaEvolved) {\n  return null;\n}"]
    parts += [blk(n) for n in LATE if n not in without]
    parts += ["function pvpTierFor(name, isShadow, leagueKey) {\n  return null;\n}", "// end"]
    # PVP_TIER_GREAT is read from the stub by record_tier_trends, which needs it whether or not the block is listed
    return "\n\n".join(parts) + "\n"


# name -> (file, argv builder, variants (blocks removed from the stub))
CASES = {
    "species_class": ("import_species_class.py", lambda t: [GM_FILE], [(), ("SPECIES_CLASS",)]),
    "size_data": ("import_size_data.py", lambda t: [GM_FILE], [(), ("SIZE_DATA",)]),
    "evolution_branches": ("import_evolution_branches.py", lambda t: [GM_FILE], [(), ("EVOLUTION_BRANCHES",)]),
    "mega_levels": ("import_mega_levels.py", lambda t: [], [(), ("SPECIES_GM", "SPECIES_FAMILY"), ("MEGA_LEVEL_DATA",)]),
    "pvp_tier_data": ("import_pvp_tier_data.py", lambda t: [], [(), ("PVP_TIER",)]),
    "pvpoke_gamemaster": ("import_pvpoke_gamemaster.py", lambda t: [], [(), ("PVPOKE_GM",)]),
    "record_tier_trends": ("record_tier_trends.py", lambda t: [os.path.join(t, "old_mechanics.js"), TODAY], [(), ("TIER_TRENDS",)]),
    "evolution_data": ("import_evolution_data.py", lambda t: [GM_FILE], [()]),
    "mega_data": ("import_mega_data.py", lambda t: [GM_FILE], [()]),
    "move_data": ("import_move_data.py", lambda t: [GM_FILE], [()]),
    "movepool_data": ("import_movepool_data.py", lambda t: [GM_FILE], [()]),
    "purify_data": ("import_purify_data.py", lambda t: [GM_FILE], [()]),
}
# literal guards in the OLD sources (the new ones carry MIN_* constants, which the generic patch below lowers)
OLD_GUARDS = [("len(out) < 100", "len(out) < 1"), ("len(out) < 800", "len(out) < 1"), ('len(table) < 10 or', "len(table) < 1 or"),
              ('len(new.get("great", {})) < 100 or len(old.get("great", {})) < 100', "False")]


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def fake_urlopen(req, timeout=None, *a, **k):
    url = getattr(req, "full_url", req)
    if url == GM_URL:
        return Resp(open(GM_FILE, "rb").read())
    if url.endswith("gamemaster/moves.json"):
        return Resp(json.dumps(PVPOKE["moves"]).encode())
    if url.endswith("gamemaster/pokemon.json"):
        return Resp(json.dumps(PVPOKE["pokemon"]).encode())
    if "/rankings/" in url:
        if "colormega" in url or "retro" in url:
            raise urllib.error.HTTPError(url, 404, "not found", {}, None)
        return Resp(json.dumps(PVPOKE["rankings"]).encode())
    raise AssertionError("unexpected network request: " + url)


def run_one(scripts_dir, name, without):
    fname, argv_of, _ = CASES[name]
    with tempfile.TemporaryDirectory() as tmp:
        copy = os.path.join(tmp, "scripts")
        shutil.copytree(scripts_dir, copy, ignore=shutil.ignore_patterns("fixtures", "qa", "__pycache__", "lib", "*.js", "*.mjs"))
        for f in os.listdir(copy):
            if f.endswith(".py"):
                p = os.path.join(copy, f)
                t = open(p, encoding="utf-8").read()
                for old, new in OLD_GUARDS:
                    t = t.replace(old, new)
                t = re.sub(r"(?m)^(MIN_[A-Z_]+ = )\d+", r"\g<1>1", t)
                open(p, "w", encoding="utf-8").write(t)
        work = os.path.join(tmp, "work")
        os.makedirs(work)
        open(os.path.join(work, "pokemon-mechanics.js"), "w", encoding="utf-8", newline="").write(stub(without))
        # the "old" mechanics for record_tier_trends: the stub with different tiers
        open(os.path.join(tmp, "old_mechanics.js"), "w", encoding="utf-8").write(
            stub(without).replace('"azumarill":{"tier":"C"}', '"azumarill":{"tier":"A"}').replace('"gone":{"tier":"B"}', '"new":{"tier":"S"}'))
        out, err, code = io.StringIO(), io.StringIO(), 0
        for m in [m for m in sys.modules if m in ("gm_lib", "import_evolution_data") or m.startswith("import_")]:
            del sys.modules[m]
        import urllib.request
        real = urllib.request.urlopen
        urllib.request.urlopen = fake_urlopen
        old_cwd, old_argv, old_path = os.getcwd(), sys.argv, list(sys.path)
        os.chdir(work)
        sys.argv = [os.path.join(copy, fname)] + argv_of(tmp)
        sys.path.insert(0, copy)
        try:
            with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                try:
                    runpy.run_path(os.path.join(copy, fname), run_name="__main__")
                except SystemExit as e:
                    code = e.code if isinstance(e.code, int) else 1
                    if isinstance(e.code, str):
                        print(e.code, file=err)
        finally:
            urllib.request.urlopen = real
            os.chdir(old_cwd); sys.argv = old_argv; sys.path[:] = old_path
        mech = open(os.path.join(work, "pokemon-mechanics.js"), encoding="utf-8", newline="").read()
        snippet = os.path.join(copy, "_authoritative_moves.js.snippet")
        norm = lambda s: s.replace(tmp, "<tmp>")
        return {"exit": code, "stdout": norm(out.getvalue()), "stderr": norm(err.getvalue()), "mechanics": mech,
                "snippet": open(snippet, encoding="utf-8").read() if os.path.exists(snippet) else None}


def run_all(scripts_dir):
    res = {}
    for name, (_, _, variants) in CASES.items():
        for without in variants:
            res["%s:%s" % (name, "+".join(without) or "block-present")] = run_one(scripts_dir, name, without)
    return res


if __name__ == "__main__":
    data = run_all(os.path.abspath(sys.argv[1]))
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(data, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")
    print("wrote", sys.argv[2], len(data), "cases", os.path.getsize(sys.argv[2]), "bytes")
