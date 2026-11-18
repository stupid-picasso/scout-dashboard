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
# Hostile input: a link is built only from a code of 4-32 letters and digits.
check('redeem_link accepts a normal code', u.redeem_link('ADIDASxPOKEMON'), u.REDEEM + 'ADIDASxPOKEMON')
for bad in ['javascript:alert(1)', 'AB', 'A' * 33, 'CODE&next=https://evil.example', 'CODE\nX', 'GOOD1\n', '\nGOOD1', 'code with space', '../x', '', None, 12345]:
    check('redeem_link refuses %r' % (bad,), u.redeem_link(bad), None)
hostile = u.build([{**a, 'code': 'javascript:alert(1)'}, {**a, 'code': 'GOODCODE1'}], [{'code': 'x" onclick="y', 'reward': ''}, {'code': 'ok1234', 'reward': ''}], now)
check('hostile codes never reach the output; good ones carry a store.pokemongo.com link',
      sorted((c['code'], c['link'].startswith('https://store.pokemongo.com/')) for c in hostile), [('GOODCODE1', True), ('ok1234', True)])
# kind: the listing's own text decides; nothing is invented. (Fake codes only.)
check('kind: plain item code is standard', byc['ADIDASxPOKEMON']['kind'], 'standard')
tr = u.build([{**a, 'code': 'FAKETIMEDRES1', 'name': 'Fake research', 'description': 'Unlocks a Timed Research with rewards.', 'rewards': []},
              {**a, 'code': 'FAKETIMEDRES2', 'name': 'Fake', 'description': '', 'rewards': ['Timed  Research ticket']},
              {**a, 'code': 'FAKEPLAINCODE', 'name': 'Fake', 'description': 'Time limited research? no', 'rewards': ['x']}], [{'code': 'FAKEPGTIMED1', 'reward': 'Timed Research'}, {'code': 'FAKEPGPLAIN1', 'reward': 'Poke Balls'}], now)
check('kind: timed research found in description, rewards (any spacing) and the other site\'s reward text',
      {c['code']: c['kind'] for c in tr}, {'FAKETIMEDRES1': 'timed_research', 'FAKETIMEDRES2': 'timed_research', 'FAKEPLAINCODE': 'standard', 'FAKEPGTIMED1': 'timed_research', 'FAKEPGPLAIN1': 'standard'})
check('kind: no code is added by classification', len(tr), 5)
check('kind_of tolerates missing text', (u.kind_of(None, None, None), u.kind_of('', [])), ('standard', 'standard'))
print('%d failed' % fail)
sys.exit(1 if fail else 0)
