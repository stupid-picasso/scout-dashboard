#!/usr/bin/env python3
"""Refresh data/feed.json: current events + GO Battle League schedule.

Sources (community mirrors; pokemongo.com itself is not scrapeable in CI-safe
form and the app must not depend on it):
  - ScrapedDuck events.json (LeekDuck mirror): dates, raid bosses, spotlight,
    community day spawns, GBL weekly cup rotation
  - PvPoke formats.json: cup rules text
  - Niantic game master (PokeMiners mirror): the real COMBAT_LEAGUE_* rules
    (CP cap, allowed types, species allow/ban lists) and Legendary/Mythic/
    Ultra Beast classes, attached to every league as `cup`

Never overwrites a good file with a bad parse: exits non-zero instead.
"""
import json, os, re, sys, urllib.request, datetime

EVENTS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json'
GM_URL = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json'
FORMATS_URL = 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster/formats.json'
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'feed.json')
KEEP_TYPES = {'event', 'community-day', 'raid-battles', 'raid-hour', 'raid-day', 'pokemon-spotlight-hour',
              'max-mondays', 'max-battles', 'wild-area', 'pokemon-go-tour', 'season', 'go-battle-league'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'scout-dashboard'}), timeout=30) as r:
        return json.load(r)


def league_cp(name):
    n = name.lower()
    for word, cp in (('master', 10000), ('ultra', 2500), ('little', 500), ('great', 1500)):
        if word in n:
            return cp
    return 1500  # named cups default to Great League CP unless stated


def split_leagues(title):
    title = title.split('|')[0].strip()
    parts = re.split(r',\s*(?:and\s+)?|\s+and\s+(?=(?:Master|Ultra|Great|Little|Mega|Fantasy|20\d\d|[A-Z]))', title)
    return [p.strip() for p in parts if p.strip()]


def rules_for(name, cp, formats):
    low = name.lower()
    mega = 'mega' in low
    for f in formats:
        t = f.get('title', '').lower()
        if f.get('rules') and (t == low or (t in low and f.get('cup') not in ('mega',) and len(t) > 8)):
            return f['rules']
    out = ['No CP limit.' if cp >= 10000 else 'Pokemon must be at or below %s CP.' % format(cp, ',')]
    if mega:
        out.append('Mega Evolutions are eligible.')
    return out


def sp_key(name):
    return re.sub(r'[^a-z]', '', str(name).lower())


def form_suffix(species, form):
    f = str(form).upper()
    if f in ('FORM_UNSET',) or f.endswith('_NORMAL'):
        return 'normal'
    return f[len(species) + 1:].lower() if f.startswith(species.upper() + '_') else f.lower()


def pack_species(entries):
    out = []
    for e in entries:
        sp = sp_key(e['id'])
        forms = sorted({form_suffix(e['id'], f) for f in e.get('forms', [])})
        out.append(sp + (':' + '|'.join(forms) if forms else ''))
    return out


STOP = {'vs', 'seeker', 'combat', 'league', 'great', 'ultra', 'master', 'little', 'default', 'npc', 'cup', 'edition', 'the', 'go'}


def kw(text):
    toks = re.findall(r'[a-z0-9]+', text.lower().replace('megas', 'mega'))
    return [t for t in toks if t not in STOP]


def load_cups(gm):
    cups = {}
    for x in gm:
        cl = x.get('data', {}).get('combatLeague')
        if not cl or not x['templateId'].startswith('COMBAT_LEAGUE_VS_SEEKER_'):
            continue
        r = {'types': [], 'allow': None, 'ban': [], 'caught': None, 'level': None, 'cp': None}
        for c in cl['pokemonCondition']:
            t = c['type']
            if t == 'WITH_POKEMON_CP_LIMIT':
                r['cp'] = c['withPokemonCpLimit']['maxCp']
            elif t == 'WITH_POKEMON_TYPE':
                r['types'] = [y.replace('POKEMON_TYPE_', '').lower() for y in c['withPokemonType']['pokemonType']]
            elif t == 'POKEMON_WHITELIST':
                r['allow'] = pack_species(c['pokemonWhiteList']['pokemon'])
            elif t == 'POKEMON_BANLIST':
                r['ban'] = pack_species(c['pokemonBanList']['pokemon'])
            elif t == 'POKEMON_CAUGHT_TIMESTAMP':
                ts = c['pokemonCaughtTimestamp']
                r['caught'] = [int(ts.get('afterTimestamp', 0)), int(ts.get('beforeTimestamp', 0))]
            elif t == 'POKEMON_LEVEL_RANGE':
                r['level'] = c.get('pokemonLevelRange')
        key = x['templateId'].replace('COMBAT_LEAGUE_VS_SEEKER_', '')
        r['kw'] = kw(key.lower().replace('_', ' '))
        cups[key] = r
    return cups


def find_cup(name, cp, cups):
    words = kw(name)
    rest = [w for w in words if w not in ('mega',)]
    best = None
    for key, r in cups.items():
        if r['cp'] is None or (r['cp'] if r['cp'] < 9999 else 10000) != cp and not (cp >= 10000 and r['cp'] >= 9999):
            continue
        is_mega_tpl = 'mega' in r['kw']
        if is_mega_tpl != (not rest and 'mega' in words):
            continue
        need = [w for w in r['kw'] if w != 'mega']
        if any(w not in rest for w in need):
            continue
        if any(w not in need and not w.isdigit() for w in rest):
            continue  # the name carries a keyword this template does not know (e.g. LAIC)
        score = (len(need), key.endswith('_PREMIER') is False, key)  # more specific, newest suffix (S22 > S8 by sort below)
        # Same specificity: prefer the template with the newest Catch Cup window, then the
        # highest suffix. (Seasons reuse one template name with a new window each time.)
        def rank(k, rr):
            return (len([w for w in rr['kw'] if w != 'mega']), (rr['caught'] or [0, 0])[1], natural(k))
        if best is None or rank(key, r) > rank(best[0], best[1]):
            best = (key, r)
    return best


def natural(k):
    return [int(t) if t.isdigit() else t for t in re.split(r'(\d+)', k)]


def species_by_class(gm):
    cls = {'legendary': [], 'mythical': [], 'ultra beast': []}
    for x in gm:
        ps = x.get('data', {}).get('pokemonSettings')
        if ps and re.match(r'V\d+_POKEMON_', x['templateId']):
            c = ps.get('pokemonClass', '')
            k = {'POKEMON_CLASS_LEGENDARY': 'legendary', 'POKEMON_CLASS_MYTHIC': 'mythical', 'POKEMON_CLASS_ULTRA_BEAST': 'ultra beast'}.get(c)
            if k:
                cls[k].append(sp_key(ps['pokemonId']))
    return {k: sorted(set(v)) for k, v in cls.items()}


def cup_from_text(rules, classes):
    """PvPoke text rules for cups the game master does not carry yet (e.g. LAIC)."""
    r = {'types': [], 'allow': None, 'ban': [], 'caught': None, 'level': None, 'src': 'PvPoke rules text', 'banTypes': []}
    for line in rules:
        m = re.match(r'Prohibited Types:\s*(.*?)\.?$', line)
        if m:
            r['banTypes'] = [t.strip().lower() for t in m.group(1).split(',')]
        m = re.match(r'Prohibited Categories:\s*(.*?)\.?$', line)
        if m:
            for c in m.group(1).split(','):
                c = c.strip().lower().rstrip('s')
                c = {'legendary': 'legendary', 'mythical': 'mythical', 'ultra beast': 'ultra beast'}.get(c)
                r['ban'] += classes.get(c, [])
        m = re.match(r'Prohibited Pokemon:\s*(.*?)\.?$', line)
        if m:
            for n in m.group(1).split(','):
                n = n.strip()
                if n.lower().startswith('mega '):
                    continue
                mm = re.match(r'(.+?)\s*\((.+)\)$', n)
                r['ban'].append(sp_key(mm.group(1)) + ':' + sp_key(mm.group(2)) if mm else sp_key(n))
    return r


def pvpoke_table(name, cp, mega):
    """Which PvPoke ranking file describes this league (stored by import_pvp_tier_data.py
    as PVP_CUP_TABLES["id@cp"]). Empty when PvPoke has none: the app then falls back to
    the open-league scores filtered by the cup's rules."""
    words = set(kw(name)) - {'mega', 'edition', 'cup'}
    cpk = 10000 if cp >= 10000 else cp
    if mega and not words:
        return 'mega@%d' % cpk
    table = None
    if 'color' in words and mega:
        table = 'colormega@1500'
    elif 'laic' in words:
        table = 'laic2027@1500'
    elif 'willpower' in words:
        table = 'willpower@1500'
    elif 'catch' in words and cp == 1500:
        table = 'catch@1500'
    elif 'fantasy' in words and cp == 2500:
        table = 'fantasy@2500'
    elif 'retro' in words:
        table = 'retro@1500'
    elif 'premier' in words and cp >= 10000:
        table = 'premier@10000'
    return table


def norm_event(e):
    ed = e.get('extraData') or {}
    o = {'id': e['eventID'], 'name': e['name'], 'type': e['eventType'], 'start': e['start'], 'end': e['end'],
         'link': e.get('link', '')}
    rb = ed.get('raidbattles')
    if rb:
        o['bosses'] = [b['name'] for b in rb.get('bosses', [])][:8]
    sp = ed.get('spotlight')
    if sp:
        o['spotlight'] = {'name': sp.get('name'), 'bonus': sp.get('bonus')}
    cd = ed.get('communityday')
    if cd:
        o['spawns'] = [s['name'] for s in cd.get('spawns', [])][:8]
        o['bonuses'] = [b['text'] for b in cd.get('bonuses', [])][:6]
    return o


def main():
    raw = get(EVENTS_URL)
    if not isinstance(raw, list) or len(raw) < 5:
        sys.exit('events feed looks wrong')
    formats = []
    try:
        formats = get(FORMATS_URL)
    except Exception as ex:
        print('formats unavailable:', ex)
    cups, classes = {}, {}
    try:
        gm = get(GM_URL)
        cups, classes = load_cups(gm), species_by_class(gm)
    except Exception as ex:
        print('game master unavailable:', ex)
    now = datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M')
    events, gbl = [], []
    for e in raw:
        if not all(k in e for k in ('eventID', 'name', 'eventType', 'start', 'end')) or not e['start'] or not e['end']:
            continue
        if e['end'][:16] < now or e['eventType'] not in KEEP_TYPES:
            continue
        if e['eventType'] == 'go-battle-league':
            leagues = []
            for nm in split_leagues(e['name']):
                cp = league_cp(nm)
                lg = {'name': nm, 'cp': cp, 'mega': 'mega' in nm.lower(), 'rules': rules_for(nm, cp, formats)}
                hit = find_cup(nm, cp, cups) if cups else None
                if hit:
                    r = hit[1]
                    lg['cup'] = {k: r[k] for k in ('types', 'allow', 'ban', 'caught', 'level') if r.get(k)}
                    lg['cup']['src'] = 'game master COMBAT_LEAGUE_' + hit[0]
                    c = lg['cup']
                    # The game master only keeps past Catch Cup windows; a window that
                    # ended before this league starts is stale, so do not trust it.
                    if c.get('caught') and c['caught'][1] < datetime.datetime.fromisoformat(e['start'].replace('Z', '')).timestamp() * 1000:
                        c.pop('caught')
                        c['caughtWindowUnknown'] = True
                else:
                    ft = next((f for f in formats if f.get('rules') and any(w in f.get('title', '').lower() for w in kw(nm) if len(w) > 3 and w not in ('mega', 'edition'))), None)
                    if ft and cups:
                        lg['cup'] = {k: v for k, v in cup_from_text(ft['rules'], classes).items() if v}
                lg['pvpoke'] = pvpoke_table(nm, cp, lg['mega'])
                if not lg['pvpoke']:
                    del lg['pvpoke']
                leagues.append(lg)
            season = e['name'].split('|')[-1].strip() if '|' in e['name'] else ''
            gbl.append({'start': e['start'], 'end': e['end'], 'season': season, 'leagues': leagues, 'link': e.get('link', '')})
        else:
            events.append(norm_event(e))
    if not events or not gbl:
        sys.exit('no events or no GBL weeks after filtering; keeping old file')
    events.sort(key=lambda x: x['start']); gbl.sort(key=lambda x: x['start'])
    out = {'source': 'ScrapedDuck (LeekDuck mirror) + PvPoke formats; community data, not official',
           'fetchedAt': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'events': events, 'gbl': gbl}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    new = json.dumps(out, indent=1, ensure_ascii=False)
    try:
        old = json.load(open(OUT))
        old.pop('fetchedAt', None); chk = dict(out); chk.pop('fetchedAt')
        if old == chk:
            print('unchanged'); return
    except Exception:
        pass
    open(OUT, 'w').write(new + '\n')
    print('wrote', len(events), 'events,', len(gbl), 'GBL weeks')


if __name__ == '__main__':
    main()
