#!/usr/bin/env python3
"""Reader contract, first step: RECORD where the extractor (pogo_extract.py) and the app (Scout Dashboard.dc.html) disagree about the
fields a recording reader returns. Nothing here changes a prompt, the app or the model output.

data/schema/reader_fields.json lists every field the extractor's prompts ask for (name, type, which prompt), the aliases the app accepts,
the fields the extractor emits that are not in a prompt, and, under "known_divergences", the disagreements as they are today
(python-pipeline survey H1-H3, H7, H8, H10). This test:

  1. checks the field list in the JSON equals what pogo_extract.py's prompts say now (so the schema cannot drift from the code), and
  2. recomputes every divergence from the two source files and requires it to equal the recorded list. A divergence that gets fixed, or a
     new one, fails the test; update the JSON on purpose with   python3 scripts/test_reader_contract.py --write   and read the diff.

Needs the Python environment of test_extract_pipeline.py (pogo_extract imports its image libraries).
"""
import inspect, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
SCHEMA = os.path.join(ROOT, 'data', 'schema', 'reader_fields.json')
import pogo_extract as px

APP = open(os.path.join(ROOT, 'Scout Dashboard.dc.html'), encoding='utf-8').read()


def schema_fields(text, start_at=0):
    """Fields of the first {"name": ...} / {"frame": ...} object after start_at, in order: [(name, type text)], plus the nested
    field names of any object-valued field. Works on a Python prompt string and on a JS source region joined from 'a' + 'b' pieces."""
    joined = re.sub(r"'\s*\+\s*'", '', text[start_at:])
    i = re.search(r'\{"(?:name|frame)"', joined).start()
    depth, top, nested, stack, last, j = 0, [], {}, [], None, i
    keys = []
    while j < len(joined):
        c = joined[j]
        if c == '{':
            depth += 1
            if depth > 1:
                stack.append(last)
        elif c == '}':
            depth -= 1
            if depth > 0:
                stack.pop()
            if depth == 0:
                end = j
                break
        else:
            m = re.match(r'"(\w+)"\s*:', joined[j:])
            if m and joined[j - 1] != '\\':
                k = m.group(1)
                keys.append((k, depth, j + m.end(), stack[-1] if stack else None))
                if depth == 1:
                    top.append(k)
                else:
                    nested.setdefault(stack[-1], []).append(k)
                last = k
                j += m.end() - 1
        j += 1
    types = {}
    top_keys = [k for k in keys if k[1] == 1]
    for n, (k, _, pos, _) in enumerate(top_keys):
        stop = top_keys[n + 1][2] - len(top_keys[n + 1][0]) - 3 if n + 1 < len(top_keys) else end
        types[k] = re.sub(r'\s+', '', joined[pos:stop]).rstrip(',').rstrip('"')
    return top, types, nested


def app_fn(name):
    m = re.search(r'\n  (?:async )?' + name + r'\(', APP)
    i = m.start()
    return APP[i:APP.index('\n  }\n', i)]


def app_prompt_fields():
    rv = app_fn('runVideoPipeline')
    return {
        'runVideoPipeline': schema_fields(rv, rv.index('Each item: '))[0],
        'importPromptText': schema_fields(app_fn('importPromptText'))[0],
        'readScreenshotWithVision': schema_fields(app_fn('readScreenshotWithVision'))[0],
        'appraisalPrompt': schema_fields(app_fn('appraisalPrompt'))[0],
    }


def alnum(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


def py_facts():
    d_top, d_types, d_nested = schema_fields(px.VIDEO_IMPORT_PROMPT, px.VIDEO_IMPORT_PROMPT.index(' Each item: '))
    f_top, _, _ = schema_fields(px.VIDEO_FRAME_PROMPT, px.VIDEO_FRAME_PROMPT.index('Fields: '))
    a_top, a_types, _ = schema_fields(px.APPRAISAL_PROMPT, px.APPRAISAL_PROMPT.index('Each item:'))
    return dict(detail=d_top, detail_types=d_types, detail_nested=d_nested, frame=f_top, appraisal=a_top, appraisal_types=a_types)


APPRAISAL_SRC = inspect.getsource(px.run_appraisal_pipeline) + inspect.getsource(px._resolve_duplicate_sightings)


def emitted_by_appraisal():
    """Fields the bar-measuring appraisal pipeline adds to a record (assignments in run_appraisal_pipeline and _resolve_duplicate_sightings)
    that a prompt does not ask for, minus those it removes again before writing the file."""
    names = set(re.findall(r'\b(?:it|merged)\["(\w+)"\]\s*=', APPRAISAL_SRC))
    for target in re.findall(r'^\s*((?:it\["\w+"\],?\s*)+)=', APPRAISAL_SRC, re.M):   # it["a"], it["b"] = x, y
        names |= set(re.findall(r'"(\w+)"', target))
    names -= set(re.findall(r'\.pop\("(\w+)"', APPRAISAL_SRC))
    return sorted(names)


def normalizer_aliases(prompt_names):
    """Property names the app's two normalizers read that no prompt (either language) or pipeline emission names: the alias layer."""
    seen = set()
    for fn in ('normalizePastedItems', 'normalizeAppraisalItems'):
        seen |= set(re.findall(r'\b(?:o|it)\.(\w+)', app_fn(fn)))
    known = set(prompt_names) | set(emitted_by_appraisal()) | {'dex'}
    return sorted(seen - known)


def files_mentioning(token, folders):
    out = []
    for folder, exts in folders:
        base = os.path.join(ROOT, folder)
        for f in sorted(os.listdir(base)):
            p = os.path.join(base, f)
            if os.path.isfile(p) and f.endswith(exts) and f != os.path.basename(__file__) and re.search(r'\b' + token + r'\b', open(p, encoding='utf-8', errors='replace').read()):
                out.append(os.path.join(folder, f))
    return out


def current_divergences():
    py = py_facts()
    app = app_prompt_fields()
    py_all = set(py['detail']) | set(py['frame']) | set(py['appraisal'])
    app_all = set().union(*app.values())
    div = {}
    # H1: the same reader schema is typed out five times and the copies differ.
    div['H1_detail_prompt_fields'] = {
        'python VIDEO_IMPORT_PROMPT vs app %s' % name: {'python_only': sorted(set(py['detail']) - set(fields)), 'app_only': sorted(set(fields) - set(py['detail']))}
        for name, fields in app.items() if name != 'appraisalPrompt'}
    div['H1_frame_prompt_vs_detail_prompt'] = {'frame_only': sorted(set(py['frame']) - set(py['detail'])), 'detail_only': sorted(set(py['detail']) - set(py['frame']))}
    ap_py = px.APPRAISAL_PROMPT
    ap_app = re.sub(r'\\u[0-9a-fA-F]{4}|\\n', ' ', re.sub(r"'\s*\+\s*'", '', app_fn('appraisalPrompt')))
    div['H1_appraisal_prompt'] = {'same_fields': py['appraisal'] == app['appraisalPrompt'],
                                  'same_text_ignoring_punctuation': alnum(ap_py.split('Each item:', 1)[1]) == alnum(ap_app.split('Each item:', 1)[1])}
    div['H1_flag_keys_the_prompt_never_asks_for'] = sorted(set(px._FLAG_KEYS) - set(py['detail']))
    # H2: the power-up stardust field has two names, bridged only inside the app.
    div['H2_power_up_stardust_name'] = {
        'python_prompt': [k for k in py['detail'] if k.startswith('powerUp') and 'Dust' in k],
        'app_prompts': sorted({k for f in app.values() for k in f if k.startswith('powerUp') and 'Stardust' in k}),
        'app_code_reads_both': bool(re.search(r'item\.powerUpStardust\)\s*\?\s*item\.powerUpStardust\s*:\s*\(Number\.isFinite\(item\.powerUpDust\)', APP)),
        'tests_naming_powerUpDust': files_mentioning('powerUpDust', [('scripts', ('.py', '.js')), ('scripts/qa', ('.js',))]),
        'tests_naming_powerUpStardust': files_mentioning('powerUpStardust', [('scripts', ('.py', '.js')), ('scripts/qa', ('.js',))]),
    }
    # H3: field names the app accepts that neither language's prompt or pipeline uses today (the old CSV column names and friends).
    div['H3_app_only_aliases'] = normalizer_aliases(py_all | app_all)
    # H7: fields the appraisal pipeline emits, and how many times the app source names each.
    emitted = emitted_by_appraisal()
    div['H7_appraisal_fields_emitted_with_app_references'] = {k: len(re.findall(r'\b' + k + r'\b', APP)) for k in emitted}
    div['H7_conflict_flag'] = {'python_log_says_not_pinned': 'not pinned' in APPRAISAL_SRC, 'app_pins_every_bar_measure_item': bool(re.search(r"ivSource\s*===\s*'bar-measure'", APP))}
    # H8: the batch position "i" asked for by the identification prompt is copied into the record and not removed.
    div['H8_scaffolding_field_i'] = {'asked_for_in_APPRAISAL_ID_BATCH_PROMPT': '"i"' in px.APPRAISAL_ID_BATCH_PROMPT, 'removed_before_writing': 'pop("i"' in APPRAISAL_SRC}
    # H10: the two output file names, and where each is written, fetched and exempted from .gitignore.
    places = {}
    sources = {'pogo_extract.py': open(os.path.join(ROOT, 'pogo_extract.py'), encoding='utf-8').read(), 'Scout Dashboard.dc.html': APP,
               '.github/workflows/extract-run.yml': open(os.path.join(ROOT, '.github', 'workflows', 'extract-run.yml'), encoding='utf-8').read(),
               '.gitignore': open(os.path.join(ROOT, '.gitignore'), encoding='utf-8').read()}
    for name in ('pokemon_import.json', 'appraisal_import.json'):
        places[name] = sorted(p for p, t in sources.items() if name in t)
    div['H10_output_files'] = places
    return div


def field_table():
    py = py_facts()
    aliases = {'xlCandy': ['xl_candy'], 'fastMove': ['fast_move'], 'chargeMove1': ['charged_move_1'], 'chargeMove2': ['charged_move_2'], 'atkIV': ['attack_iv'],
               'defIV': ['defense_iv'], 'staIV': ['stamina_iv'], 'evolveCandy': ['evolution_candy_cost'], 'evolveButton': ['evolve_button'], 'stardust': ['current_stardust'],
               'type': ['type1+type2', 'type_1+type_2'], 'powerUpDust': ['powerUpStardust']}
    detail = [{'name': k, 'type': py['detail_types'][k], 'prompts': ['detail', 'frame'] if k in py['frame'] else ['detail'], 'app_aliases': aliases.get(k, [])} for k in py['detail']]
    appraisal = [{'name': k, 'type': py['appraisal_types'][k], 'prompts': ['appraisal'],
                  'app_aliases': {'name': ['pokemon_name'], 'stars': ['appraisal_stars'], 'perfect': ['hundo', 'is_perfect'],
                                  'maxed': ['atkFull', 'defFull', 'hpFull', 'staFull', 'attack_bar', 'defense_bar', 'hp_bar', 'appraisal_attack_bar', 'appraisal_defense_bar', 'appraisal_hp_bar']}.get(k, [])}
                 for k in py['appraisal']]
    return {'detail_fields': detail, 'detail_nested': {'megaForms': py['detail_nested'].get('megaForms', [])}, 'frame_extra_fields': [k for k in py['frame'] if k not in py['detail']],
            'appraisal_fields': appraisal}


def build():
    t = field_table()
    return {
        '_comment': 'Reader contract, first step. Lists what pogo_extract.py asks a recording reader for and what the app accepts. Nothing reads this file at run time: '
                    'scripts/test_reader_contract.py keeps it equal to the two source files and RECORDS where they disagree. Regenerate with '
                    'python3 scripts/test_reader_contract.py --write.',
        'version': 1,
        'output_files': {'detail': 'data/pokemon_import.json', 'appraisal': 'data/appraisal_import.json'},
        **t,
        'appraisal_pipeline_added_fields': {'emitted': emitted_by_appraisal(), 'note': 'added by the bar measurement, not asked of the model; ivSource is "bar-measure" or "model-guess"'},
        'known_divergences': current_divergences(),
    }


if __name__ == '__main__':
    want = build()
    if '--write' in sys.argv:
        os.makedirs(os.path.dirname(SCHEMA), exist_ok=True)
        with open(SCHEMA, 'w', encoding='utf-8', newline='\n') as f:
            json.dump(want, f, indent=1, ensure_ascii=False)
            f.write('\n')
        print('wrote', SCHEMA)
        sys.exit(0)
    fails = []

    def check(name, ok, detail=''):
        print(('ok   ' if ok else 'FAIL ') + name + ('' if ok else '  ' + str(detail)[:400]))
        if not ok:
            fails.append(name)

    have = json.load(open(SCHEMA, encoding='utf-8'))
    for key in ('detail_fields', 'detail_nested', 'frame_extra_fields', 'appraisal_fields', 'appraisal_pipeline_added_fields', 'output_files'):
        check('reader_fields.json %s matches pogo_extract.py' % key, have.get(key) == want[key], '%s != %s' % (have.get(key), want[key]))
    check('every field has a type', all(f['type'] for f in have['detail_fields'] + have['appraisal_fields']))
    for key, now in want['known_divergences'].items():
        rec = have.get('known_divergences', {}).get(key)
        check('divergence %s is as recorded' % key, rec == now, 'recorded %s, now %s' % (json.dumps(rec)[:200], json.dumps(now)[:200]))
    check('no recorded divergence is stale', set(have.get('known_divergences', {})) == set(want['known_divergences']))
    # the facts the divergences rest on, stated directly so the recorded list is not vacuous
    d = want['known_divergences']
    check('H2 is real today: the Python prompt says powerUpDust, the app prompts say powerUpStardust', d['H2_power_up_stardust_name']['python_prompt'] == ['powerUpDust'] and d['H2_power_up_stardust_name']['app_prompts'] == ['powerUpStardust'])
    check('H1 is real today: the app prompts ask for shiny and shinyIcon, which the Python prompt does not', all('shiny' in v['app_only'] for v in d['H1_detail_prompt_fields'].values()))
    print('%d failed' % len(fails))
    sys.exit(1 if fails else 0)
