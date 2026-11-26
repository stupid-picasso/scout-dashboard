"""
gm_lib.py - what the import_*.py / update_*.py scripts share: one place to fetch JSON, one game-master download, one
"replace a GENERATED BLOCK in pokemon-mechanics.js" routine.

  fetch_json(url, timeout, retries)   one User-Agent, one retry policy (replaces the workflow shell `retry()` for fetches)
  game_master(path=None)              the Niantic game master (PokeMiners mirror), downloaded at most once per process.
                                      A local file wins over the network: the `path` argument, else $GAME_MASTER_FILE. When
                                      $GAME_MASTER_FILE names a file that does not exist yet, the download is saved there, so
                                      several scripts in one workflow run download it once between them.
  block_text(name, script, body)      the exact marker text of a generated block
  replace_block(text, name, block, after=None, before=None)
                                      replace the named block, or, when it is missing, insert it after another block's end
                                      marker (`after`, a block name) or before a literal anchor (`before`); raises ValueError
                                      when the anchor is missing instead of silently leaving the file unchanged
  BLOCK_ORDER                         the order the blocks sit in pokemon-mechanics.js (scripts/test_gm_lib.py checks the file)
"""
import json, os, re, sys, time, urllib.error, urllib.request

GAME_MASTER_URL = "https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json"
USER_AGENT = "scout-dashboard-data-updater/1.0 (+https://github.com/stupid-picasso/scout-dashboard)"
GAME_MASTER_ENV = "GAME_MASTER_FILE"

# Blocks of pokemon-mechanics.js that scripts write, in file order. POWERUP_RUNS and the CPM / move tables above them are
# written by update_pokemon_data.py with its own marker style and are not listed.
BLOCK_ORDER = ["SPECIES_GM", "SPECIES_FAMILY", "MEGA_LEVEL_DATA", "SIZE_DATA", "SPECIES_CLASS", "EVOLUTION_BRANCHES", "TIER_TRENDS", "PVP_TIER", "PVPOKE_GM", "MAX_TIER_GROUP", "MAX_GROUP_COSTS", "MAX_MOVE_IDS"]


def fetch_json(url, timeout=60, retries=3, pause=2.0):
    """GET a URL and parse it as JSON. Retries on any failure (network error, bad status, bad JSON) up to `retries` times
    in all, sleeping pause, 2*pause, ... between tries; the last error is raised."""
    last = None
    for attempt in range(1, max(1, retries) + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500 and e.code != 429:
                raise  # the file is not there (or we are not allowed): asking again will not change that
            last = e
            if attempt < retries:
                print("gm_lib: %s failed (attempt %d of %d): %s" % (url, attempt, retries, e), file=sys.stderr)
                time.sleep(pause * attempt)
            continue
        except Exception as e:  # noqa: BLE001 - every other failure (timeout, reset, bad JSON) is retried the same way
            last = e
            if attempt < retries:
                print("gm_lib: %s failed (attempt %d of %d): %s" % (url, attempt, retries, e), file=sys.stderr)
                time.sleep(pause * attempt)
    raise last


_GM = {}


def game_master(path=None, timeout=180, retries=3):
    """The game master as a list of templates, read once per process (see the module docstring for where it comes from)."""
    path = path or os.environ.get(GAME_MASTER_ENV) or None
    key = path or GAME_MASTER_URL
    if key in _GM:
        return _GM[key]
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            gm = json.load(f)
    else:
        gm = fetch_json(GAME_MASTER_URL, timeout=timeout, retries=retries)
        if path:  # a cache path that did not exist yet: keep the download for the next script
            with open(path, "w", encoding="utf-8") as f:
                json.dump(gm, f, separators=(",", ":"))
    _GM[key] = gm
    return gm


def block_text(name, script, body):
    """`body` is the JS between the two marker comments, without a trailing newline."""
    return ("// GENERATED BLOCK: %s (%s) — do not hand-edit\n" % (name, script)
            + body + "\n// END GENERATED BLOCK: %s" % name)


def block_pattern(name):
    return re.compile(r"// GENERATED BLOCK: %s.*?// END GENERATED BLOCK: %s" % (re.escape(name), re.escape(name)), re.S)


def replace_block(text, name, block, after=None, before=None):
    pat = block_pattern(name)
    if pat.search(text):
        return pat.sub(lambda _: block, text)
    if after:
        anchor = "// END GENERATED BLOCK: " + after
        if anchor not in text:
            raise ValueError("cannot add the %s block: the %s block is not in the file (run its script first)" % (name, after))
        return text.replace(anchor, anchor + "\n\n" + block, 1)
    if before:
        idx = text.find(before)
        if idx < 0:
            raise ValueError("cannot add the %s block: anchor %r is not in the file" % (name, before))
        return text[:idx] + block + "\n\n" + text[idx:]
    raise ValueError("the %s block is not in the file and no place to insert it was given" % name)


def block_names(text):
    """Names of the generated blocks in a file, in order (only the `// GENERATED BLOCK: NAME (script)` form)."""
    return re.findall(r"^// GENERATED BLOCK: (\w+) \(", text, re.M)
