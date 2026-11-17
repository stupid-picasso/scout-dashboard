#!/usr/bin/env python3
"""Parsers of scripts/update_promo_codes.py on real page text (no network)."""
import datetime, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import update_promo_codes as u

fail = 0
def check(name, got, want):
    global fail
    if got != want:
        fail += 1
        print('FAIL', name, '\n  got ', got, '\n  want', want)

leek = u.parse_leekduck(open(os.path.join(HERE, 'fixtures', 'promo_leekduck.html'), encoding='utf-8').read())
active = [c for c in leek if not c['expired']]
check('five live cards and two expired ones', (len(active), len(leek) - len(active)), (5, 2))
b = next(c for c in leek if c['code'] == 'LEGOxPOKEMONGOxBERRIES')
check('berries code: rewards and no fixed expiry', (b['rewards'][:2], b['expires']), (['×5 Razz Berry', '×10 Poké Ball'], None))
a = next(c for c in leek if c['code'] == 'ADIDASxPOKEMON')
check('dated code', (a['expires'], a['expired'], a['name']), ('2027-01-15', False, 'adidas Shoes Avatar Item'))
check('expired cards are flagged by their class, not by a neighbour', all(c['expired'] for c in leek if c['code'] not in {x['code'] for x in active}), True)

pg = u.parse_pocketgamer(open(os.path.join(HERE, 'fixtures', 'promo_pocketgamer.html'), encoding='utf-8').read())
codes = [c['code'] for c in pg]
check('pocket gamer active list is read up to the Expired heading', ('ADIDASxPOKEMON' in codes, 'GOTOURKALOS' in codes, 'LEGOXPOKEMONGOXCAP' in codes), (True, True, False))

now = datetime.datetime(2026, 11, 17)
dead = next(c['code'] for c in leek if c['expired'])
built = u.build(leek, [{'code': 'ADIDASxPOKEMON', 'reward': 'Shoes'}, {'code': 'NEWCODE2026', 'reward': 'Something'}, {'code': dead, 'reward': 'x'}], now)
byc = {c['code']: c for c in built}
check('live LeekDuck codes are verified', byc['ADIDASxPOKEMON']['verified'], True)
check('an unknown code from the other site is marked unverified', (byc['NEWCODE2026']['verified'], byc['NEWCODE2026']['source']), (False, 'Pocket Gamer'))
check('a code LeekDuck lists as expired is not resurrected by the other site', dead in byc, False)
check('redeem link carries the code', byc['NEWCODE2026']['link'], u.REDEEM + 'NEWCODE2026')
late = u.build([{**a, 'expires': '2026-11-01'}], [], now)
check('a code past its date is dropped', late, [])
print('%d failed' % fail)
sys.exit(1 if fail else 0)
