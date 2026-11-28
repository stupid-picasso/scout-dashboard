#!/usr/bin/env python3
"""carry_running in scripts/update_events_gbl.py (no network): a GBL week or event that is running now and that the community
source no longer lists is kept from the previous file; ended, upcoming and still-listed ones are not."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_events_gbl as u

fail = 0
def check(name, got, want):
    global fail
    if got != want:
        fail += 1
        print('FAIL', name, got, want)

wk = lambda s, e: {'start': s + 'T21:00:00.000Z', 'end': e + 'T21:00:00.000Z', 'leagues': []}
key = lambda w: (w['start'], w['end'])
now = '2026-11-28T09:00'
old = [wk('2026-11-17', '2026-11-24'), wk('2026-11-24', '2026-12-01'), wk('2026-12-01', '2026-12-08')]
new = [wk('2026-12-01', '2026-12-08')]
check('the running week is carried', [key(w)[0][:10] for w in u.carry_running(old, new, key, now)], ['2026-11-24'])
check('nothing to carry when the source still lists it', u.carry_running(old, old, key, now), [])
check('an ended week is not carried', u.carry_running([wk('2026-11-17', '2026-11-24')], [], key, now), [])
check('an upcoming week is not carried', u.carry_running([wk('2026-12-01', '2026-12-08')], [], key, now), [])
check('the end moment is outside', u.carry_running([wk('2026-11-21', '2026-11-28')], [], key, '2026-11-28T21:00'), [])
check('no previous file', u.carry_running(None, new, key, now), [])
check('garbage entries are skipped', u.carry_running(['x', {'start': None}, {}], [], key, now), [])
ev = lambda i, s, e: {'id': i, 'start': s, 'end': e}
check('events are keyed by id', [x['id'] for x in u.carry_running([ev('a', '2026-11-27T10:00:00.000', '2026-11-29T10:00:00.000'), ev('b', '2026-11-27T10:00:00.000', '2026-11-29T10:00:00.000')], [ev('a', 'x', 'y')], lambda x: x['id'], now)], ['b'])
if fail:
    sys.exit(1)
print('ok: feed carry-over checks passed')
