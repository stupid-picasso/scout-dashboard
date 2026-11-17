#!/usr/bin/env python3
"""Writes data/promo_codes.json: the Pokemon GO promo codes that can be redeemed now.

Primary source: leekduck.com/promo-codes (structured: code, name, rewards, expiry, expired flag).
Extra source:   pocketgamer.com's list, only for codes LeekDuck does not mention at all; those are marked
                verified=false so the app says "listed by another site, not confirmed".
Nothing here claims a code works: the app shows where each was listed and when it was checked.
The file is never overwritten with an empty list when it had codes (a changed page must not wipe it).
"""
import datetime, html, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'promo_codes.json')
LEEKDUCK = 'https://leekduck.com/promo-codes/'
POCKETGAMER = 'https://www.pocketgamer.com/pokemon-go/promo-codes/'
REDEEM = 'https://store.pokemongo.com/offer-redemption?passcode='
CODE_RE = re.compile(r'[A-Za-z0-9]{4,32}')


def redeem_link(code):
    """The redeem URL for a code, or None when the code is not 4-32 letters and digits (never build a link from scraped text)."""
    return REDEEM + code if isinstance(code, str) and CODE_RE.fullmatch(code) else None


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; scout-dashboard)'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode('utf-8', 'ignore')


def strip_tags(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
    s = html.unescape(re.sub(r'<[^>]+>', ' ', s))
    return re.sub(r'\s+', ' ', s).strip()


MONTHS = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}


def parse_expiry(text):
    """'Expires: January 15, 2027 at 11:59 PM' -> '2027-01-15'; 'Expired' -> 'expired'; '???' / none -> None."""
    if re.search(r'\bExpired\b', text):
        return 'expired'
    m = re.search(r'Expires:\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})', text)
    if m and m.group(1) in MONTHS:
        return '%04d-%02d-%02d' % (int(m.group(3)), MONTHS[m.group(1)], int(m.group(2)))
    return None


def parse_leekduck(page):
    """-> list of {code, name, description, rewards:[str], expires, expired, link}."""
    out = []
    parts = re.split(r'<div class="promo-card([^"]*)">', page)
    for cls, card in zip(parts[1::2], parts[2::2]):
        code = re.search(r'<p class="text"[^>]*>([^<]+)</p>', card)
        title = re.search(r'<h3 class="title">(.*?)</h3>', card, re.S)
        if not code or not title:
            continue
        desc = re.search(r'<div class="description">(.*?)</div>', card, re.S)
        rewards = []
        for li in re.findall(r'<li class="reward".*?</li>', card, re.S):
            q = re.search(r'<div class="quantity">([^<]*)</div>', li)
            lab = re.search(r'<span class="reward-label">([^<]*)</span>', li)
            if lab:
                rewards.append(((q.group(1).strip() + ' ') if q else '') + html.unescape(lab.group(1)).strip())
        tail = strip_tags(card.split('class="reward-list"', 1)[-1])
        exp = 'expired' if 'expired' in cls.lower() else parse_expiry(tail)
        out.append({'code': html.unescape(code.group(1)).strip(), 'name': strip_tags(title.group(1)), 'description': strip_tags(desc.group(1)) if desc else '',
                    'rewards': rewards, 'expires': None if exp == 'expired' else exp, 'expired': exp == 'expired'})
    return out


def parse_pocketgamer(page):
    """Only the 'Active Pokemon Go codes' list: 'CODE - what it gives' lines. -> [{code, reward}]"""
    text = strip_tags(page)
    m = re.search(r'Active Pok\S*mon Go codes(.*?)\bExpired\b', text, re.S | re.I)
    if not m:
        return []
    seg = m.group(1)
    out = []
    for part in re.split(r'(?=\b[A-Za-z0-9]{6,24}\s+-\s)', seg):
        mm = re.match(r'\s*([A-Za-z0-9]{6,24})\s+-\s+(.*)$', part.strip())
        if mm:
            out.append({'code': mm.group(1), 'reward': mm.group(2).strip()[:140]})
    return out


def build(leek, pg, now):
    today = now.strftime('%Y-%m-%d')
    codes, known = [], {c['code'].lower() for c in leek}
    for c in leek:
        if not redeem_link(c['code']):
            continue
        if c['expired'] or (c['expires'] and c['expires'] < today):
            continue
        codes.append({**c, 'source': 'LeekDuck', 'verified': True, 'link': redeem_link(c['code'])})
    for c in pg:
        if not redeem_link(c['code']):
            continue
        if c['code'].lower() in known:
            continue   # LeekDuck lists it (live or expired): its answer wins
        codes.append({'code': c['code'], 'name': c['code'], 'description': '', 'rewards': [c['reward']] if c['reward'] else [], 'expires': None,
                      'expired': False, 'source': 'Pocket Gamer', 'verified': False, 'link': redeem_link(c['code'])})
    return codes


def main():
    old = json.load(open(OUT)) if os.path.exists(OUT) else {'codes': []}
    now = datetime.datetime.utcnow()
    try:
        leek = parse_leekduck(fetch(LEEKDUCK))
    except Exception as e:
        sys.exit('LeekDuck unreadable (' + str(e) + '); keeping the old file')
    if not leek:
        sys.exit('LeekDuck parsed zero codes; the page format probably changed. Keeping the old file')
    try:
        pg = parse_pocketgamer(fetch(POCKETGAMER))
    except Exception as e:
        print('Pocket Gamer unreadable:', e, file=sys.stderr)
        pg = [{'code': c['code'], 'reward': (c['rewards'] or [''])[0]} for c in old.get('codes', []) if c.get('source') == 'Pocket Gamer']
    codes = build(leek, pg, now)
    out = {'fetchedAt': now.strftime('%Y-%m-%dT%H:%M:%SZ'), 'sources': {'LeekDuck': LEEKDUCK, 'Pocket Gamer': POCKETGAMER}, 'codes': codes}
    new = json.dumps(out, indent=1, ensure_ascii=False)
    if os.path.exists(OUT):
        prev = json.load(open(OUT)); prev['fetchedAt'] = out['fetchedAt']
        if json.dumps(prev, indent=1, ensure_ascii=False) == new:
            print('promo codes unchanged'); return
    open(OUT, 'w').write(new + '\n')
    print('wrote', len(codes), 'codes (' + str(sum(1 for c in codes if c['verified'])) + ' from LeekDuck)')


if __name__ == '__main__':
    main()
