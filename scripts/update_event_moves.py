#!/usr/bin/env python3
"""Refresh data/event_moves.json: events that teach a move when a Pokemon is evolved during the event.

Reads the event list from data/feed.json, fetches each upcoming/current event page from LeekDuck and pulls out the sentences
that say "Evolve <Pokemon> during the event ... to get a <Pokemon> that knows the Charged/Fast Attack <Move>".
Plain text patterns only. A page that cannot be fetched keeps the entries it had; a page whose wording is not recognised is listed
under `unparsed` for a person to look at. Never writes an empty file over a good one.
"""
import datetime, html, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = os.path.join(ROOT, 'data', 'feed.json')
OUT = os.path.join(ROOT, 'data', 'event_moves.json')
TYPES = {'community-day', 'event', 'pokemon-go-tour', 'raid-day', 'wild-area'}
NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'twelve': 12, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '12': 12, '24': 24}


def get_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'scout-dashboard'})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode('utf-8', 'ignore')
    raw = re.sub(r'<script.*?</script>|<style.*?</style>', '', raw, flags=re.S)
    txt = html.unescape(re.sub(r'<[^>]+>', '\n', raw))
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n', txt))


NAME = r"([A-Z][A-Za-zÀ-ſ'.:\-]*(?: [A-Z][A-Za-zÀ-ſ'.:\-]*){0,2})"
MOVE = r"([A-Z][A-Za-z'\-]*(?: [A-Z][A-Za-z'\-]*){0,3})"


def parse_sentence(s):
    """One sentence -> {species, to, move, kind, graceHours} or None."""
    m = re.search(r'\b(Charged|Fast) Attack,? ' + MOVE + r'(?=[\s.,;!)]|$)', s)
    if not m or not re.search(r'evolv', s, re.I):
        m2 = re.search(r'\b(Charged|Fast) Attack\s+' + MOVE, s)
        if not m2 or not re.search(r'evolv', s, re.I):
            return None
        m = m2
    kind = 'charged' if m.group(1) == 'Charged' else 'fast'
    move = m.group(2).strip()
    # drop trailing words that are not part of a move name
    move = re.sub(r'\s+(?:And|Or|When|During|If|For|Is|Will|That|To)$', '', move)
    frm = re.search(r'[Ee]volv(?:e|ing) ' + NAME + r'(?= (?:during|into|in|at|with|before|after|to|up|between|from)\b|[ ,.]|$)', s)
    to = re.search(r'(?:to get|into|get) an? ' + NAME + r'(?= that| with| which| knowing|[ ,.]|$)', s) or re.search(r'\binto ' + NAME, s)
    grace = 0
    g = re.search(r'up to (\w+) hours?', s, re.I)
    if g:
        grace = NUM.get(g.group(1).lower(), 0)
    if not frm:
        return None
    return {'species': frm.group(1).strip(), 'to': to.group(1).strip() if to else None, 'move': move, 'kind': kind, 'graceHours': grace}


def parse_page(text):
    hits, unparsed = [], []
    for line in text.split('\n'):
        line = line.strip()
        if not re.search(r'evolv', line, re.I) or not re.search(r'attack|move', line, re.I):
            continue
        for s in re.split(r'(?<=[.!])\s+(?=[A-Z])', line):
            if not re.search(r'evolv', s, re.I) or not re.search(r'(Charged|Fast) Attack', s):
                continue
            r = parse_sentence(s)
            if r:
                r['sentence'] = s[:300]
                hits.append(r)
            else:
                unparsed.append(s[:300])
    return hits, unparsed


def main():
    feed = json.load(open(FEED))
    old = json.load(open(OUT)) if os.path.exists(OUT) else {'moves': [], 'unparsed': []}
    now = datetime.datetime.utcnow() - datetime.timedelta(days=1)
    events = [e for e in feed.get('events', []) if e.get('type') in TYPES and e.get('link') and e['end'][:10] >= now.strftime('%Y-%m-%d')]
    moves, unparsed, failed = [], [], 0
    for e in events:
        try:
            hits, un = parse_page(get_text(e['link']))
        except Exception as ex:  # keep what this event had
            failed += 1
            print('could not read', e['link'], ex, file=sys.stderr)
            moves += [m for m in old.get('moves', []) if m.get('eventId') == e['id']]
            continue
        for h in hits:
            moves.append({'eventId': e['id'], 'eventName': e['name'], 'type': e['type'], 'start': e['start'], 'end': e['end'], 'link': e['link'], **h})
        unparsed += [{'eventId': e['id'], 'eventName': e['name'], 'sentence': s} for s in un]
    if failed and failed == len(events) and old.get('moves'):
        sys.exit('every event page failed; keeping the old file')
    out = {'fetchedAt': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'moves': moves, 'unparsed': unparsed}
    new = json.dumps(out, indent=1, ensure_ascii=False)
    if os.path.exists(OUT):
        prev = json.load(open(OUT)); prev['fetchedAt'] = out['fetchedAt']
        if json.dumps(prev, indent=1, ensure_ascii=False) == new:
            print('event moves unchanged'); return
    open(OUT, 'w').write(new + '\n')
    print('wrote', len(moves), 'event moves,', len(unparsed), 'unparsed sentences from', len(events), 'events')


if __name__ == '__main__':
    main()
