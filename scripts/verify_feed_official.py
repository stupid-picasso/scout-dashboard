#!/usr/bin/env python3
"""Cross-check data/feed.json against the official GO Battle League season page.

The feed comes from community mirrors; this fetches the season announcement on
pokemongo.com (reachable from GitHub runners, not from every sandbox) and records
whether the cups it names match the feed. It NEVER fails the workflow and never
edits feed.json: it only writes data/feed_check.json, which the app shows as a
line under the GBL card:

  status "ok"           every feed cup is named on the official page, and the page
                        names no cup the feed lacks
  status "mismatch"     lists the cups only one side mentions
  status "unreadable"   page fetched but carries no usable text (client-rendered)
  status "unreachable"  the fetch failed

Season page: https://pokemongo.com/news/go-battle-league-<season-slug>
"""
import datetime, html, json, os, re, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEED = os.path.join(ROOT, 'data', 'feed.json')
OUT = os.path.join(ROOT, 'data', 'feed_check.json')


def slug(season):
    return re.sub(r'[^a-z0-9]+', '-', season.lower()).strip('-')


def cup_core(name):
    """'Mega Color Cup: Great League Edition' -> 'color cup'; leagues return None."""
    n = re.sub(r'\b(mega|edition|great league|ultra league|master league)\b', ' ', name.split(':')[0] + ' ' + (name.split(':')[1] if ':' in name else ''), flags=re.I)
    n = re.sub(r'\b20\d\d\b|\bgo\b', ' ', n, flags=re.I)
    n = re.sub(r'\s+', ' ', n).strip().lower()
    return n if n.endswith('cup') else None


def text_of(page):
    page = re.sub(r'(?is)<(script|style).*?</\1>', ' ', page)
    return html.unescape(re.sub(r'(?s)<[^>]+>', ' ', page))


def compare(text, feed_cups):
    low = re.sub(r'\s+', ' ', text.lower())
    official = {re.sub(r'\s+', ' ', m.strip().lower()) for m in re.findall(r'((?:[A-Z][\w\'-]*\s){0,2}[A-Z][\w\'-]*\sCup)', text)}
    official = {re.sub(r'^(the|mega|go|20\d\d)\s+', '', o) for o in official}
    official = {o for o in official if len(o) > 6}
    missing_official = sorted(c for c in feed_cups if c not in low)
    missing_feed = sorted(o for o in official if o not in feed_cups and o not in ('battle league cup',) and not any(o.endswith(c) or c.endswith(o) for c in feed_cups))
    return missing_official, missing_feed


def main():
    feed = json.load(open(FEED))
    seasons = sorted({w.get('season') for w in feed['gbl'] if w.get('season')})
    res = {'checkedAt': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'), 'status': 'unreachable', 'url': None,
           'feedCups': [], 'notOnOfficialPage': [], 'onlyOnOfficialPage': []}
    if not seasons:
        return finish(res)
    url = 'https://pokemongo.com/news/go-battle-league-' + slug(seasons[-1])
    res['url'] = url
    cups = sorted({c for w in feed['gbl'] for l in w['leagues'] for c in [cup_core(l['name'])] if c})
    res['feedCups'] = cups
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (scout-dashboard feed check)'})
        page = urllib.request.urlopen(req, timeout=30).read().decode('utf-8', 'replace')
    except Exception as ex:
        res['error'] = str(ex)[:200]
        return finish(res)
    text = text_of(page)
    if len(text.split()) < 150 or 'battle league' not in text.lower():
        res['status'] = 'unreadable'
        return finish(res)
    miss_off, miss_feed = compare(text, cups)
    res['notOnOfficialPage'], res['onlyOnOfficialPage'] = miss_off, miss_feed
    res['status'] = 'ok' if not miss_off and not miss_feed else 'mismatch'
    finish(res)


def finish(res):
    json.dump(res, open(OUT, 'w'), indent=1)
    print(json.dumps(res))


if __name__ == '__main__':
    try:
        main()
    except Exception as ex:  # never break the workflow
        print('check failed:', ex)
        sys.exit(0)
