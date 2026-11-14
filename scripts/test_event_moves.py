#!/usr/bin/env python3
"""Sentence patterns for scripts/update_event_moves.py (no network)."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update_event_moves as u

fail = 0
def check(name, got, want):
    global fail
    if got != want:
        fail += 1
        print('FAIL', name, got, want)

p = u.parse_sentence("Evolve Bisharp during the event or up to four hours afterwards to get a Kingambit that knows the Charged Attack Kowtow Cleave.")
check('community day', (p['species'], p['to'], p['move'], p['kind'], p['graceHours']), ('Bisharp', 'Kingambit', 'Kowtow Cleave', 'charged', 4))
p = u.parse_sentence("Evolving Dragonair into Dragonite during Community Day will teach it the exclusive Charged Attack Draco Meteor.")
check('into form', (p['species'], p['to'], p['move'], p['graceHours']), ('Dragonair', 'Dragonite', 'Draco Meteor', 0))
p = u.parse_sentence("Evolve Tyranitar during the event to get a Tyranitar that knows the Fast Attack Smack Down.")
check('fast attack', (p['kind'], p['move']), ('fast', 'Smack Down'))
check('no evolve', u.parse_sentence("Pawniard will know the Charged Attack Iron Head."), None)
hits, un = u.parse_page("Intro\nEvolve Bisharp during the event or up to four hours afterwards to get a Kingambit that knows the Charged Attack Kowtow Cleave. Other text.\nUnrelated line about Special Research.")
check('page hits', len(hits), 1); check('page unparsed', len(un), 0)
print('%d failed' % fail)
sys.exit(1 if fail else 0)
