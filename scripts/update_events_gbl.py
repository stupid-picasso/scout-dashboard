#!/usr/bin/env python3
"""Refresh data/feed.json: current events + GO Battle League schedule.

Sources (community mirrors; pokemongo.com itself is not scrapeable in CI-safe
form and the app must not depend on it):
  - ScrapedDuck events.json (LeekDuck mirror): dates, raid bosses, spotlight,
    community day spawns, GBL weekly cup rotation
  - PvPoke formats.json: cup rules text

Never overwrites a good file with a bad parse: exits non-zero instead.
"""
import json, os, re, sys, urllib.request, datetime

EVENTS_URL = 'https://raw.githubusercontent.com/bigfoott/ScrapedDuck/data/events.json'
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
                leagues.append({'name': nm, 'cp': cp, 'mega': 'mega' in nm.lower(), 'rules': rules_for(nm, cp, formats)})
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
