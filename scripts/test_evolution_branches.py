#!/usr/bin/env python3
"""Checks import_evolution_branches.branches_of on a small made-up game master: real branches are kept with their
requirements, form-only splits (Dunsparce) and single-target species are not branches."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from import_evolution_branches import branches_of

def entry(pid, branches, form=None):
    ps = {"pokemonId": pid, "evolutionBranch": branches}
    if form:
        ps["form"] = form
    return {"templateId": "V0001_POKEMON_" + pid, "data": {"pokemonSettings": ps}}

gm = [
    entry("EEVEE", [{"evolution": "VAPOREON", "candyCost": 25},
                    {"evolution": "ESPEON", "candyCost": 25, "kmBuddyDistanceRequirement": 10.0, "mustBeBuddy": True, "onlyDaytime": True, "questDisplay": [{}]},
                    {"evolution": "LEAFEON", "candyCost": 25, "lureItemRequirement": "ITEM_TROY_DISK_MOSSY"}]),
    entry("KIRLIA", [{"evolution": "GALLADE", "candyCost": 100, "genderRequirement": "MALE", "evolutionItemRequirement": "ITEM_GEN4_EVOLUTION_STONE"},
                     {"evolution": "GARDEVOIR", "candyCost": 100}]),
    entry("DUNSPARCE", [{"evolution": "DUDUNSPARCE", "candyCost": 50, "form": "DUDUNSPARCE_TWO"}, {"evolution": "DUDUNSPARCE", "candyCost": 50, "form": "DUDUNSPARCE_THREE"}]),
    entry("PIDGEY", [{"evolution": "PIDGEOTTO", "candyCost": 12}]),
    entry("SLOWPOKE", [{"evolution": "SLOWBRO", "candyCost": 50}, {"evolution": "SLOWKING", "candyCost": 50}], form="SLOWPOKE_GALARIAN"),
]
t = branches_of(gm)
fails = []
def check(name, ok, detail=""):
    print(("ok   " if ok else "FAIL ") + name + ("" if ok else "  " + detail))
    if not ok:
        fails.append(name)

check("only real branching species", sorted(t) == ["eevee", "kirlia"], str(sorted(t)))
esp = next(r for r in t["eevee"] if r["to"] == "Espeon")
check("Espeon needs a buddy, daytime and a task", esp["buddyKm"] == 10.0 and esp["time"] == "day" and esp["task"], str(esp))
check("Leafeon needs a Mossy Lure", next(r for r in t["eevee"] if r["to"] == "Leafeon")["lure"] == "mossy")
gal = next(r for r in t["kirlia"] if r["to"] == "Gallade")
check("Gallade is male with a Sinnoh Stone", gal["gender"] == "male" and gal["itemKey"] == "sinnohStone", str(gal))
check("Dunsparce (forms of one species) is not a branch", "dunsparce" not in t)
check("a regional form's own branches do not replace the plain species", "slowpoke" not in t)
print("%d failed" % len(fails))
sys.exit(1 if fails else 0)
