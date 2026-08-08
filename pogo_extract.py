#!/usr/bin/env python3
"""
pogo_extract.py v2 — Fixed regex, scene detection, full dex lookup.
CRITICAL FIX: Word boundaries now use single backslash (was double = backspace char).
"""

import argparse, csv, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter
    import requests
except ImportError as e:
    print(f"Missing dependency: {e}")
    sys.exit(1)

CSV_FIELDS = [
    "pokemon_name", "dex_number", "cp", "hp", "level",
    "attack_iv", "defense_iv", "stamina_iv", "iv_percent", "gender",
    "height", "weight", "size_class", "type_1", "type_2", "weather_boosted",
    "favorite", "shiny", "shadow", "purified", "lucky", "costume", "event",
    "background", "dynamax", "gigantamax", "mega_capable", "buddy_level",
    "current_buddy", "caught_date", "caught_location", "trainer_notes",
    "tag_list", "appraisal_team", "appraisal_attack_bar",
    "appraisal_defense_bar", "appraisal_hp_bar", "fast_move",
    "charged_move_1", "charged_move_2", "fast_move_type",
    "charged_move_type_1", "charged_move_type_2", "stardust_powerup_cost",
    "candy_powerup_cost", "xl_candy_powerup_cost",
    "stardust_evolution_cost", "evolution_candy_cost", "current_candy",
    "current_xl_candy", "mega_energy", "is_tradeable", "is_legendary",
    "is_mythical", "is_ultra_beast", "is_event", "is_costume",
    "is_favorite", "has_second_move", "is_best_buddy", "pokeball_type",
    "catch_method", "friendship_history", "notes"
]

# CRITICAL FIX: Single backslash for word boundaries
REGEX_PATTERNS = {
    "cp": re.compile(r"CP\s*([0-9,]+)", re.IGNORECASE),
    "hp": re.compile(r"HP\s*([0-9,]+)", re.IGNORECASE),
    "attack_iv": re.compile(r"Atk\s*([0-9]+)", re.IGNORECASE),
    "defense_iv": re.compile(r"Def\s*([0-9]+)", re.IGNORECASE),
    "stamina_iv": re.compile(r"Sta\s*([0-9]+)", re.IGNORECASE),
    "iv_percent": re.compile(r"([0-9]+(?:\.[0-9]+)?)%", re.IGNORECASE),
    "level": re.compile(r"Level\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE),
    "weight": re.compile(r"([0-9]+\.?[0-9]*)\s*kg", re.IGNORECASE),
    "height": re.compile(r"([0-9]+\.?[0-9]*)\s*m\b", re.IGNORECASE),
    "stardust": re.compile(r"([0-9,]+)\s*Stardust", re.IGNORECASE),
    "candy": re.compile(r"([0-9]+)\s+Candy(?!\s*XL)", re.IGNORECASE),
    "xl_candy": re.compile(r"([0-9]+)\s*XL\s*Candy", re.IGNORECASE),
    "mega_energy": re.compile(r"([0-9]+)\s*Mega Energy", re.IGNORECASE),
    "gender_male": re.compile(r"♂|male|gender male", re.IGNORECASE),
    "gender_female": re.compile(r"♀|female|gender female", re.IGNORECASE),
    "favorite": re.compile(r"Favorite|★", re.IGNORECASE),
    "shiny": re.compile(r"Shiny|✨", re.IGNORECASE),
    "shadow": re.compile(r"Shadow", re.IGNORECASE),
    "purified": re.compile(r"Purified", re.IGNORECASE),
    "lucky": re.compile(r"Lucky", re.IGNORECASE),
    "weather_boosted": re.compile(r"Weather Boost|Boosted", re.IGNORECASE),
    "catch_date": re.compile(r"(\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2})", re.IGNORECASE),
}

FAST_MOVES = {
    "Counter", "Dragon Breath", "Shadow Claw", "Volt Switch", "Incinerate",
    "Powder Snow", "Waterfall", "Mud Shot", "Thunder Shock", "Lick",
    "Poison Jab", "Snarl", "Bullet Punch", "Air Slash", "Hex", "Charm",
    "Frost Breath", "Bug Bite", "Tackle", "Scratch", "Ember", "Bubble",
    "Rock Throw", "Confusion", "Psycho Cut", "Low Kick", "Karate Chop",
    "Wing Attack", "Bite", "Fire Spin", "Razor Leaf", "Vine Whip",
    "Mud Slap", "Metal Claw", "Bullet Seed", "Pound", "Splash", "Transform",
    "Yawn", "Present", "Feint Attack", "Struggle Bug", "Fury Cutter",
    "Ice Shard", "Water Gun", "Zen Headbutt", "Acid", "Peck", "Take Down",
    "Smack Down", "Dragon Tail", "Infestation", "Astonish", "Poison Sting",
    "Spark", "Fire Fang", "Ice Fang", "Thunder Fang", "Rock Smash",
    "Sucker Punch", "Hidden Power", "Extrasensory", "Iron Tail", "Poison Tail",
    "Magical Leaf", "Leafage", "Rollout", "Fairy Wind", "Charge Beam",
    "Volt Tackle", "Quick Attack", "Gust",
}

CHARGED_MOVES = {
    "Cross Chop", "Dynamic Punch", "Close Combat", "Focus Blast",
    "Power-Up Punch", "Brick Break", "Low Sweep", "Submission",
    "Superpower", "Aura Sphere", "Dragon Claw", "Outrage", "Draco Meteor",
    "Dragon Pulse", "Twister", "Shadow Ball", "Shadow Punch", "Shadow Sneak",
    "Ominous Wind", "Night Shade", "Thunderbolt", "Thunder", "Wild Charge",
    "Discharge", "Thunder Punch", "Zap Cannon", "Parabolic Charge",
    "Flamethrower", "Fire Blast", "Overheat", "Blast Burn", "Flame Charge",
    "Heat Wave", "Fire Punch", "Blaze Kick", "Weather Ball Fire", "Ice Punch",
    "Ice Beam", "Blizzard", "Avalanche", "Icy Wind", "Weather Ball Ice",
    "Surf", "Aqua Tail", "Hydro Pump", "Hydro Cannon", "Water Pulse",
    "Scald", "Crabhammer", "Muddy Water", "Brine", "Liquidation",
    "Earthquake", "Earth Power", "Bulldoze", "Dig", "Sand Tomb",
    "Drill Run", "Scorching Sands", "Rock Slide", "Stone Edge", "Rock Blast",
    "Rock Tomb", "Power Gem", "Ancient Power", "Meteor Beam", "Sludge Bomb",
    "Sludge Wave", "Gunk Shot", "Cross Poison", "Poison Fang", "Acid Spray",
    "Crunch", "Dark Pulse", "Foul Play", "Night Slash", "Payback",
    "Flash Cannon", "Iron Head", "Meteor Mash", "Mirror Shot", "Doom Desire",
    "Steel Wing", "Aerial Ace", "Brave Bird", "Sky Attack", "Hurricane",
    "Drill Peck", "Fly", "Air Cutter", "Weather Ball Flying", "Psychic",
    "Psyshock", "Psystrike", "Future Sight", "Synchronoise", "Psychic Fangs",
    "X-Scissor", "Bug Buzz", "Signal Beam", "Megahorn", "Leaf Blade",
    "Seed Bomb", "Solar Beam", "Petal Blizzard", "Frenzy Plant", "Leaf Storm",
    "Power Whip", "Energy Ball", "Grass Knot", "Weather Ball Grass",
    "Dazzling Gleam", "Moonblast", "Play Rough", "Draining Kiss",
    "Disarming Voice", "Hyper Beam", "Giga Impact", "Body Slam", "Return",
    "Frustration", "Swift", "Tri Attack", "Stomp", "Weather Ball",
    "Hyper Fang", "Last Resort", "Facade", "Hyper Voice", "Skull Bash",
    "Headbutt", "Wrap", "Vice Grip", "Horn Attack", "Fury Attack",
    "Sacred Sword", "Secret Sword", "Relic Song", "Techno Blast",
    "Freeze Shock", "Ice Burn", "Bolt Strike", "Blue Flare", "Fusion Flare",
    "Fusion Bolt", "Glaciate", "Seed Flare", "Shadow Force", "Roar of Time",
    "Spacial Rend", "Origin Pulse", "Precipice Blades", "Dragon Ascent",
    "Oblivion Wing", "Sacred Fire", "Aeroblast", "Luster Purge", "Mist Ball",
    "Psycho Boost", "V-create", "Doom Desire",
}

MOVE_TYPES = {
    "Counter": "Fighting", "Karate Chop": "Fighting", "Low Kick": "Fighting",
    "Rock Smash": "Fighting", "Dynamic Punch": "Fighting", "Close Combat": "Fighting",
    "Cross Chop": "Fighting", "Focus Blast": "Fighting", "Power-Up Punch": "Fighting",
    "Brick Break": "Fighting", "Low Sweep": "Fighting", "Submission": "Fighting",
    "Superpower": "Fighting", "Aura Sphere": "Fighting",
    "Dragon Breath": "Dragon", "Dragon Tail": "Dragon", "Outrage": "Dragon",
    "Dragon Claw": "Dragon", "Draco Meteor": "Dragon", "Dragon Pulse": "Dragon",
    "Twister": "Dragon", "Dragon Ascent": "Dragon",
    "Shadow Claw": "Ghost", "Hex": "Ghost", "Shadow Ball": "Ghost",
    "Shadow Punch": "Ghost", "Shadow Sneak": "Ghost", "Ominous Wind": "Ghost",
    "Night Shade": "Ghost", "Lick": "Ghost", "Astonish": "Ghost",
    "Volt Switch": "Electric", "Thunder Shock": "Electric", "Spark": "Electric",
    "Thunderbolt": "Electric", "Wild Charge": "Electric", "Discharge": "Electric",
    "Thunder Punch": "Electric", "Zap Cannon": "Electric", "Parabolic Charge": "Electric",
    "Thunder": "Electric", "Charge Beam": "Electric", "Volt Tackle": "Electric",
    "Incinerate": "Fire", "Ember": "Fire", "Fire Spin": "Fire", "Fire Fang": "Fire",
    "Flamethrower": "Fire", "Fire Blast": "Fire", "Overheat": "Fire",
    "Blast Burn": "Fire", "Flame Charge": "Fire", "Heat Wave": "Fire",
    "Fire Punch": "Fire", "Blaze Kick": "Fire", "Weather Ball Fire": "Fire",
    "Powder Snow": "Ice", "Frost Breath": "Ice", "Ice Shard": "Ice",
    "Avalanche": "Ice", "Ice Punch": "Ice", "Ice Beam": "Ice", "Blizzard": "Ice",
    "Icy Wind": "Ice", "Weather Ball Ice": "Ice",
    "Waterfall": "Water", "Water Gun": "Water", "Bubble": "Water",
    "Aqua Tail": "Water", "Surf": "Water", "Hydro Pump": "Water",
    "Hydro Cannon": "Water", "Water Pulse": "Water", "Scald": "Water",
    "Crabhammer": "Water", "Muddy Water": "Water", "Brine": "Water",
    "Liquidation": "Water",
    "Mud Slap": "Ground", "Mud Shot": "Ground", "Bulldoze": "Ground",
    "Dig": "Ground", "Sand Tomb": "Ground", "Drill Run": "Ground",
    "Scorching Sands": "Ground", "Earthquake": "Ground", "Earth Power": "Ground",
    "Rock Throw": "Rock", "Smack Down": "Rock", "Rock Slide": "Rock",
    "Stone Edge": "Rock", "Rock Blast": "Rock", "Rock Tomb": "Rock",
    "Power Gem": "Rock", "Ancient Power": "Rock", "Meteor Beam": "Rock",
    "Poison Jab": "Poison", "Acid": "Poison", "Poison Sting": "Poison",
    "Sludge Bomb": "Poison", "Sludge Wave": "Poison", "Gunk Shot": "Poison",
    "Cross Poison": "Poison", "Poison Fang": "Poison", "Acid Spray": "Poison",
    "Snarl": "Dark", "Bite": "Dark", "Feint Attack": "Dark",
    "Sucker Punch": "Dark", "Dark Pulse": "Dark", "Crunch": "Dark",
    "Foul Play": "Dark", "Night Slash": "Dark", "Payback": "Dark",
    "Bullet Punch": "Steel", "Metal Claw": "Steel", "Steel Wing": "Steel",
    "Flash Cannon": "Steel", "Iron Head": "Steel", "Meteor Mash": "Steel",
    "Mirror Shot": "Steel", "Doom Desire": "Steel",
    "Air Slash": "Flying", "Wing Attack": "Flying", "Peck": "Flying",
    "Gust": "Flying", "Aerial Ace": "Flying", "Brave Bird": "Flying",
    "Sky Attack": "Flying", "Hurricane": "Flying", "Drill Peck": "Flying",
    "Fly": "Flying", "Air Cutter": "Flying", "Weather Ball Flying": "Flying",
    "Confusion": "Psychic", "Psycho Cut": "Psychic", "Zen Headbutt": "Psychic",
    "Psychic": "Psychic", "Psyshock": "Psychic", "Psystrike": "Psychic",
    "Future Sight": "Psychic", "Synchronoise": "Psychic", "Psychic Fangs": "Psychic",
    "Bug Bite": "Bug", "Struggle Bug": "Bug", "Fury Cutter": "Bug",
    "X-Scissor": "Bug", "Bug Buzz": "Bug", "Signal Beam": "Bug", "Megahorn": "Bug",
    "Leaf Blade": "Grass", "Razor Leaf": "Grass", "Vine Whip": "Grass",
    "Bullet Seed": "Grass", "Seed Bomb": "Grass", "Solar Beam": "Grass",
    "Petal Blizzard": "Grass", "Frenzy Plant": "Grass", "Leaf Storm": "Grass",
    "Power Whip": "Grass", "Energy Ball": "Grass", "Grass Knot": "Grass",
    "Magical Leaf": "Grass", "Leafage": "Grass", "Weather Ball Grass": "Grass",
    "Charm": "Fairy", "Fairy Wind": "Fairy", "Draining Kiss": "Fairy",
    "Dazzling Gleam": "Fairy", "Moonblast": "Fairy", "Play Rough": "Fairy",
    "Disarming Voice": "Fairy",
    "Tackle": "Normal", "Scratch": "Normal", "Pound": "Normal",
    "Quick Attack": "Normal", "Hyper Beam": "Normal", "Giga Impact": "Normal",
    "Body Slam": "Normal", "Return": "Normal", "Frustration": "Normal",
    "Swift": "Normal", "Tri Attack": "Normal", "Stomp": "Normal",
    "Weather Ball": "Normal", "Hyper Fang": "Normal", "Last Resort": "Normal",
    "Take Down": "Normal", "Facade": "Normal", "Hyper Voice": "Normal",
    "Skull Bash": "Normal", "Headbutt": "Normal", "Wrap": "Normal",
    "Vice Grip": "Normal", "Horn Attack": "Normal", "Fury Attack": "Normal",
}

NAME_TO_DEX = {
    "Bulbasaur": 1, "Ivysaur": 2, "Venusaur": 3, "Charmander": 4,
    "Charmeleon": 5, "Charizard": 6, "Squirtle": 7, "Wartortle": 8,
    "Blastoise": 9, "Caterpie": 10, "Metapod": 11, "Butterfree": 12,
    "Weedle": 13, "Kakuna": 14, "Beedrill": 15, "Pidgey": 16,
    "Pidgeotto": 17, "Pidgeot": 18, "Rattata": 19, "Raticate": 20,
    "Spearow": 21, "Fearow": 22, "Ekans": 23, "Arbok": 24, "Pikachu": 25,
    "Raichu": 26, "Sandshrew": 27, "Sandslash": 28, "Nidoran": 29,
    "Nidorina": 30, "Nidoqueen": 31, "Nidorino": 33, "Nidoking": 34,
    "Clefairy": 35, "Clefable": 36, "Vulpix": 37, "Ninetales": 38,
    "Jigglypuff": 39, "Wigglytuff": 40, "Zubat": 41, "Golbat": 42,
    "Oddish": 43, "Gloom": 44, "Vileplume": 45, "Paras": 46, "Parasect": 47,
    "Venonat": 48, "Venomoth": 49, "Diglett": 50, "Dugtrio": 51, "Meowth": 52,
    "Persian": 53, "Psyduck": 54, "Golduck": 55, "Mankey": 56, "Primeape": 57,
    "Growlithe": 58, "Arcanine": 59, "Poliwag": 60, "Poliwhirl": 61,
    "Poliwrath": 62, "Abra": 63, "Kadabra": 64, "Alakazam": 65, "Machop": 66,
    "Machoke": 67, "Machamp": 68, "Bellsprout": 69, "Weepinbell": 70,
    "Victreebel": 71, "Tentacool": 72, "Tentacruel": 73, "Geodude": 74,
    "Graveler": 75, "Golem": 76, "Ponyta": 77, "Rapidash": 78, "Slowpoke": 79,
    "Slowbro": 80, "Magnemite": 81, "Magneton": 82, "Farfetchd": 83,
    "Doduo": 84, "Dodrio": 85, "Seel": 86, "Dewgong": 87, "Grimer": 88,
    "Muk": 89, "Shellder": 90, "Cloyster": 91, "Gastly": 92, "Haunter": 93,
    "Gengar": 94, "Onix": 95, "Drowzee": 96, "Hypno": 97, "Krabby": 98,
    "Kingler": 99, "Voltorb": 100, "Electrode": 101, "Exeggcute": 102,
    "Exeggutor": 103, "Cubone": 104, "Marowak": 105, "Hitmonlee": 106,
    "Hitmonchan": 107, "Lickitung": 108, "Koffing": 109, "Weezing": 110,
    "Rhyhorn": 111, "Rhydon": 112, "Chansey": 113, "Tangela": 114,
    "Kangaskhan": 115, "Horsea": 116, "Seadra": 117, "Goldeen": 118,
    "Seaking": 119, "Staryu": 120, "Starmie": 121, "Mr Mime": 122,
    "Scyther": 123, "Jynx": 124, "Electabuzz": 125, "Magmar": 126,
    "Pinsir": 127, "Tauros": 128, "Magikarp": 129, "Gyarados": 130,
    "Lapras": 131, "Ditto": 132, "Eevee": 133, "Vaporeon": 134,
    "Jolteon": 135, "Flareon": 136, "Porygon": 137, "Omanyte": 138,
    "Omastar": 139, "Kabuto": 140, "Kabutops": 141, "Aerodactyl": 142,
    "Snorlax": 143, "Articuno": 144, "Zapdos": 145, "Moltres": 146,
    "Dratini": 147, "Dragonair": 148, "Dragonite": 149, "Mewtwo": 150,
    "Mew": 151, "Chikorita": 152, "Bayleef": 153, "Meganium": 154,
    "Cyndaquil": 155, "Quilava": 156, "Typhlosion": 157, "Totodile": 158,
    "Croconaw": 159, "Feraligatr": 160, "Sentret": 161, "Furret": 162,
    "Hoothoot": 163, "Noctowl": 164, "Ledyba": 165, "Ledian": 166,
    "Spinarak": 167, "Ariados": 168, "Crobat": 169, "Chinchou": 170,
    "Lanturn": 171, "Pichu": 172, "Cleffa": 173, "Igglybuff": 174,
    "Togepi": 175, "Togetic": 176, "Natu": 177, "Xatu": 178, "Mareep": 179,
    "Flaaffy": 180, "Ampharos": 181, "Bellossom": 182, "Marill": 183,
    "Azumarill": 184, "Sudowoodo": 185, "Politoed": 186, "Hoppip": 187,
    "Skiploom": 188, "Jumpluff": 189, "Aipom": 190, "Sunkern": 191,
    "Sunflora": 192, "Yanma": 193, "Wooper": 194, "Quagsire": 195,
    "Espeon": 196, "Umbreon": 197, "Murkrow": 198, "Slowking": 199,
    "Misdreavus": 200, "Unown": 201, "Wobbuffet": 202, "Girafarig": 203,
    "Pineco": 204, "Forretress": 205, "Dunsparce": 206, "Gligar": 207,
    "Steelix": 208, "Snubbull": 209, "Granbull": 210, "Qwilfish": 211,
    "Scizor": 212, "Shuckle": 213, "Heracross": 214, "Sneasel": 215,
    "Teddiursa": 216, "Ursaring": 217, "Slugma": 218, "Magcargo": 219,
    "Swinub": 220, "Piloswine": 221, "Corsola": 222, "Remoraid": 223,
    "Octillery": 224, "Delibird": 225, "Mantine": 226, "Skarmory": 227,
    "Houndour": 228, "Houndoom": 229, "Kingdra": 230, "Phanpy": 231,
    "Donphan": 232, "Porygon2": 233, "Stantler": 234, "Smeargle": 235,
    "Tyrogue": 236, "Hitmontop": 237, "Smoochum": 238, "Elekid": 239,
    "Magby": 240, "Miltank": 241, "Blissey": 242, "Raikou": 243,
    "Entei": 244, "Suicune": 245, "Larvitar": 246, "Pupitar": 247,
    "Tyranitar": 248, "Lugia": 249, "Ho-Oh": 250, "Celebi": 251,
    "Treecko": 252, "Grovyle": 253, "Sceptile": 254, "Torchic": 255,
    "Combusken": 256, "Blaziken": 257, "Mudkip": 258, "Marshtomp": 259,
    "Swampert": 260, "Poochyena": 261, "Mightyena": 262, "Zigzagoon": 263,
    "Linoone": 264, "Wurmple": 265, "Silcoon": 266, "Beautifly": 267,
    "Cascoon": 268, "Dustox": 269, "Lotad": 270, "Lombre": 271,
    "Ludicolo": 272, "Seedot": 273, "Nuzleaf": 274, "Shiftry": 275,
    "Taillow": 276, "Swellow": 277, "Wingull": 278, "Pelipper": 279,
    "Ralts": 280, "Kirlia": 281, "Gardevoir": 282, "Surskit": 283,
    "Masquerain": 284, "Shroomish": 285, "Breloom": 286, "Slakoth": 287,
    "Vigoroth": 288, "Slaking": 289, "Nincada": 290, "Ninjask": 291,
    "Shedinja": 292, "Whismur": 293, "Loudred": 294, "Exploud": 295,
    "Makuhita": 296, "Hariyama": 297, "Azurill": 298, "Nosepass": 299,
    "Skitty": 300, "Delcatty": 301, "Sableye": 302, "Mawile": 303,
    "Aron": 304, "Lairon": 305, "Aggron": 306, "Meditite": 307,
    "Medicham": 308, "Electrike": 309, "Manectric": 310, "Plusle": 311,
    "Minun": 312, "Volbeat": 313, "Illumise": 314, "Roselia": 315,
    "Gulpin": 316, "Swalot": 317, "Carvanha": 318, "Sharpedo": 319,
    "Wailmer": 320, "Wailord": 321, "Numel": 322, "Camerupt": 323,
    "Torkoal": 324, "Spoink": 325, "Grumpig": 326, "Spinda": 327,
    "Trapinch": 328, "Vibrava": 329, "Flygon": 330, "Cacnea": 331,
    "Cacturne": 332, "Swablu": 333, "Altaria": 334, "Zangoose": 335,
    "Seviper": 336, "Lunatone": 337, "Solrock": 338, "Barboach": 339,
    "Whiscash": 340, "Corphish": 341, "Crawdaunt": 342, "Baltoy": 343,
    "Claydol": 344, "Lileep": 345, "Cradily": 346, "Anorith": 347,
    "Armaldo": 348, "Feebas": 349, "Milotic": 350, "Castform": 351,
    "Kecleon": 352, "Shuppet": 353, "Banette": 354, "Duskull": 355,
    "Dusclops": 356, "Tropius": 357, "Chimecho": 358, "Absol": 359,
    "Wynaut": 360, "Snorunt": 361, "Glalie": 362, "Spheal": 363,
    "Sealeo": 364, "Walrein": 365, "Clamperl": 366, "Huntail": 367,
    "Gorebyss": 368, "Relicanth": 369, "Luvdisc": 370, "Bagon": 371,
    "Shelgon": 372, "Salamence": 373, "Beldum": 374, "Metang": 375,
    "Metagross": 376, "Regirock": 377, "Regice": 378, "Registeel": 379,
    "Latias": 380, "Latios": 381, "Kyogre": 382, "Groudon": 383,
    "Rayquaza": 384, "Jirachi": 385, "Deoxys": 386, "Turtwig": 387,
    "Grotle": 388, "Torterra": 389, "Chimchar": 390, "Monferno": 391,
    "Infernape": 392, "Piplup": 393, "Prinplup": 394, "Empoleon": 395,
    "Starly": 396, "Staravia": 397, "Staraptor": 398, "Bidoof": 399,
    "Bibarel": 400, "Kricketot": 401, "Kricketune": 402, "Shinx": 403,
    "Luxio": 404, "Luxray": 405, "Budew": 406, "Roserade": 407,
    "Cranidos": 408, "Rampardos": 409, "Shieldon": 410, "Bastiodon": 411,
    "Burmy": 412, "Wormadam": 413, "Mothim": 414, "Combee": 415,
    "Vespiquen": 416, "Pachirisu": 417, "Buizel": 418, "Floatzel": 419,
    "Cherubi": 420, "Cherrim": 421, "Shellos": 422, "Gastrodon": 423,
    "Ambipom": 424, "Drifloon": 425, "Drifblim": 426, "Buneary": 427,
    "Lopunny": 428, "Mismagius": 429, "Honchkrow": 430, "Glameow": 431,
    "Purugly": 432, "Chingling": 433, "Stunky": 434, "Skuntank": 435,
    "Bronzor": 436, "Bronzong": 437, "Bonsly": 438, "Mime Jr": 439,
    "Happiny": 440, "Chatot": 441, "Spiritomb": 442, "Gible": 443,
    "Gabite": 444, "Garchomp": 445, "Munchlax": 446, "Riolu": 447,
    "Lucario": 448, "Hippopotas": 449, "Hippowdon": 450, "Skorupi": 451,
    "Drapion": 452, "Croagunk": 453, "Toxicroak": 454, "Carnivine": 455,
    "Finneon": 456, "Lumineon": 457, "Mantyke": 458, "Snover": 459,
    "Abomasnow": 460, "Weavile": 461, "Magnezone": 462, "Lickilicky": 463,
    "Rhyperior": 464, "Tangrowth": 465, "Electivire": 466, "Magmortar": 467,
    "Togekiss": 468, "Yanmega": 469, "Leafeon": 470, "Glaceon": 471,
    "Gliscor": 472, "Mamoswine": 473, "Porygon-Z": 474, "Gallade": 475,
    "Probopass": 476, "Dusknoir": 477, "Froslass": 478, "Rotom": 479,
    "Uxie": 480, "Mesprit": 481, "Azelf": 482, "Dialga": 483, "Palkia": 484,
    "Heatran": 485, "Regigigas": 486, "Giratina": 487, "Cresselia": 488,
    "Phione": 489, "Manaphy": 490, "Darkrai": 491, "Shaymin": 492,
    "Arceus": 493, "Victini": 494, "Snivy": 495, "Servine": 496,
    "Serperior": 497, "Tepig": 498, "Pignite": 499, "Emboar": 500,
    "Oshawott": 501, "Dewott": 502, "Samurott": 503, "Patrat": 504,
    "Watchog": 505, "Lillipup": 506, "Herdier": 507, "Stoutland": 508,
    "Purrloin": 509, "Liepard": 510, "Pansage": 511, "Simisage": 512,
    "Pansear": 513, "Simisear": 514, "Panpour": 515, "Simipour": 516,
    "Munna": 517, "Musharna": 518, "Pidove": 519, "Tranquill": 520,
    "Unfezant": 521, "Blitzle": 522, "Zebstrika": 523, "Roggenrola": 524,
    "Boldore": 525, "Gigalith": 526, "Woobat": 527, "Swoobat": 528,
    "Drilbur": 529, "Excadrill": 530, "Audino": 531, "Timburr": 532,
    "Gurdurr": 533, "Conkeldurr": 534, "Tympole": 535, "Palpitoad": 536,
    "Seismitoad": 537, "Throh": 538, "Sawk": 539, "Sewaddle": 540,
    "Swadloon": 541, "Leavanny": 542, "Venipede": 543, "Whirlipede": 544,
    "Scolipede": 545, "Cottonee": 546, "Whimsicott": 547, "Petilil": 548,
    "Lilligant": 549, "Basculin": 550, "Sandile": 551, "Krokorok": 552,
    "Krookodile": 553, "Darumaka": 554, "Darmanitan": 555, "Maractus": 556,
    "Dwebble": 557, "Crustle": 558, "Scraggy": 559, "Scrafty": 560,
    "Sigilyph": 561, "Yamask": 562, "Cofagrigus": 563, "Tirtouga": 564,
    "Carracosta": 565, "Archen": 566, "Archeops": 567, "Trubbish": 568,
    "Garbodor": 569, "Zorua": 570, "Zoroark": 571, "Minccino": 572,
    "Cinccino": 573, "Gothita": 574, "Gothorita": 575, "Gothitelle": 576,
    "Solosis": 577, "Duosion": 578, "Reuniclus": 579, "Ducklett": 580,
    "Swanna": 581, "Vanillite": 582, "Vanillish": 583, "Vanilluxe": 584,
    "Deerling": 585, "Sawsbuck": 586, "Emolga": 587, "Karrablast": 588,
    "Escavalier": 589, "Foongus": 590, "Amoonguss": 591, "Frillish": 592,
    "Jellicent": 593, "Alomomola": 594, "Joltik": 595, "Galvantula": 596,
    "Ferroseed": 597, "Ferrothorn": 598, "Klink": 599, "Klang": 600,
    "Klinklang": 601, "Tynamo": 602, "Eelektrik": 603, "Eelektross": 604,
    "Elgyem": 605, "Beheeyem": 606, "Litwick": 607, "Lampent": 608,
    "Chandelure": 609, "Axew": 610, "Fraxure": 611, "Haxorus": 612,
    "Cubchoo": 613, "Beartic": 614, "Cryogonal": 615, "Shelmet": 616,
    "Accelgor": 617, "Stunfisk": 618, "Mienfoo": 619, "Mienshao": 620,
    "Druddigon": 621, "Golett": 622, "Golurk": 623, "Pawniard": 624,
    "Bisharp": 625, "Bouffalant": 626, "Rufflet": 627, "Braviary": 628,
    "Vullaby": 629, "Mandibuzz": 630, "Heatmor": 631, "Durant": 632,
    "Deino": 633, "Zweilous": 634, "Hydreigon": 635, "Larvesta": 636,
    "Volcarona": 637, "Cobalion": 638, "Terrakion": 639, "Virizion": 640,
    "Tornadus": 641, "Thundurus": 642, "Reshiram": 643, "Zekrom": 644,
    "Landorus": 645, "Kyurem": 646, "Keldeo": 647, "Meloetta": 648,
    "Genesect": 649,
}

LEGENDARY_DEX = {144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379,
                 380, 381, 382, 383, 384, 480, 481, 482, 483, 484, 485, 486,
                 487, 488, 638, 639, 640, 641, 642, 643, 644, 645, 646, 716,
                 717, 718, 785, 786, 787, 788, 791, 792, 793, 794, 795, 796,
                 797, 798, 799, 800, 805, 806, 888, 889, 890, 894, 895, 896,
                 897, 898, 1007, 1008, 1009, 1010, 1020, 1021, 1022, 1023, 1024}

MYTHICAL_DEX = {151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648,
                649, 719, 720, 721, 801, 802, 807, 808, 809, 893, 1025}


def _run_ffmpeg_extract(video_path, output_dir, vf_filter, vfr_mode=False):
    cmd = ["ffmpeg", "-i", str(video_path), "-vf", vf_filter]
    if vfr_mode:
        cmd += ["-vsync", "vfr", "-frame_pts", "1"]
    cmd.append(str(output_dir / "frame_%04d.png"))
    print(f"[Extract] Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[Extract] ffmpeg stderr: {result.stderr[:500]}")
        raise RuntimeError(f"ffmpeg failed: {result.stderr[:200]}")
    return sorted(output_dir.glob("frame_*.png"))


def _frame_signature(path, size=24):
    """Small grayscale thumbnail used as a cheap perceptual fingerprint."""
    img = Image.open(path).convert("L").resize((size, size))
    return list(img.getdata())


def dedupe_similar_frames(frames, threshold=4.0, sig_size=24):
    """Drop frames that are near-identical to the previously kept frame.

    Fixed-fps sampling of a slow scroll/pan produces many consecutive frames
    that show almost the same content (the sample rate outruns how fast the
    screen actually changes). Feeding all of them to Gemini multiplies batch
    count (and API quota use) for zero extra information. This keeps the
    first frame, then keeps any later frame whose mean per-pixel grayscale
    difference against the last *kept* frame is >= threshold (0-255 scale),
    which is enough to catch real scroll/content changes while collapsing
    runs of static duplicates.
    """
    if len(frames) <= 1:
        return frames
    kept = [frames[0]]
    prev_sig = _frame_signature(frames[0], sig_size)
    for f in frames[1:]:
        sig = _frame_signature(f, sig_size)
        diff = sum(abs(a - b) for a, b in zip(sig, prev_sig)) / len(sig)
        if diff >= threshold:
            kept.append(f)
            prev_sig = sig
    return kept


TONEMAP_CHAIN = (
    "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,"
    "tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=full,format=rgb24"
)
HDR_TRANSFERS = {"smpte2084", "arib-std-b67", "smpte428", "bt2020-10", "bt2020-12"}


def _probe_colour(video_path):
    """Return the stream's colour transfer characteristic, or '' if unknown."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0",
             "-show_entries", "stream=color_transfer,color_primaries,color_space",
             "-of", "default=nw=1:nk=1", str(video_path)],
            capture_output=True, text=True, timeout=30)
        vals = [v.strip().lower() for v in out.stdout.split() if v.strip()]
        print(f"[Extract] Source colour tags: {vals or ['unknown']}")
        return vals
    except Exception as e:
        print(f"[Extract] ffprobe colour probe failed ({e}) \u2014 assuming SDR")
        return []


def _frame_peak_luma(path):
    """Brightest pixel in a frame, 0-255."""
    try:
        return Image.open(path).convert("L").getextrema()[1]
    except Exception:
        return None


def extract_frames(video_path, output_dir, fps=6, scene_detect=False, scene_threshold=0.3,
                   native=False):
    """Extract frames from video using ffmpeg.

    Scene-cut detection (select=gt(scene,N)) is tuned for hard cuts in
    filmed/edited video. A phone screen recording of someone smoothly
    panning/scrolling through a list rarely crosses that scene-score
    threshold at all, so it can legitimately extract 0 frames. When that
    happens, fall back to fixed-fps sampling instead of failing outright.

    native=True skips the 1080px rescale. The rescale exists to keep Gemini
    payloads small, but it is pure loss for anything MEASURED off the frame:
    it resamples every bar edge, and on a recording narrower than 1080 it
    upscales, inventing soft edges that were never captured. Frames sent to
    Gemini are downscaled later (image_to_base64_jpeg), so the payload saving
    is kept without paying for it in precision.

    HDR TONE-MAPPING is the important part for measurement. A modern phone
    screen recording is BT.2100 PQ. Decoding it as if it were BT.709 \u2014 which
    is what ffmpeg does by default \u2014 leaves the PQ code values in place, and
    PQ puts diffuse white at roughly 0.51 of full scale. The result is a frame
    whose BRIGHTEST pixel is about 137/255: a white card lands on 129, and a
    saturated gold progress bar on (130,129,125). That is one luminance level
    and five chroma levels of signal \u2014 no threshold, colour or structural,
    can recover a bar edge from it, and every measurement taken from such a
    frame is noise. out_range=full does NOT fix this; it addresses limited vs
    full range, a different and much smaller distortion.

    Both paths also force out_range=full, which handles the ordinary
    limited-range (16-235) case.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    scale = "scale=iw:ih:out_range=full" if native else "scale=1080:-1:out_range=full"
    tags = _probe_colour(video_path)
    hdr = any(t in HDR_TRANSFERS for t in tags)
    if hdr:
        print("[Extract] HDR source detected \u2014 tone-mapping to BT.709 before measuring")
        scale = f"{TONEMAP_CHAIN},{scale}"

    def _extract(vf, vfr=False):
        """Run ffmpeg; if the tone-map chain is unavailable, retry without it."""
        try:
            return _run_ffmpeg_extract(video_path, output_dir, vf, vfr_mode=vfr)
        except RuntimeError:
            if TONEMAP_CHAIN not in vf:
                raise
            print("[Extract] tone-map filter unavailable (no libzimg?) \u2014 "
                  "retrying without it; measurement accuracy will suffer")
            return _run_ffmpeg_extract(
                video_path, output_dir, vf.replace(TONEMAP_CHAIN + ",", ""),
                vfr_mode=vfr)

    if scene_detect:
        frames = _extract(f"select=gt(scene\\,{scene_threshold}),{scale}", vfr=True)
        print(f"[Extract] Scene-detect extracted {len(frames)} frames")
        if frames:
            _warn_if_crushed(frames)
            deduped = dedupe_similar_frames(frames)
            print(f"[Extract] {len(deduped)} frames remain after near-duplicate dedup")
            return deduped
        print(f"[Extract] Scene-detect found 0 frames (threshold={scene_threshold}) "
              f"\u2014 falling back to fixed fps={fps} sampling")

    frames = _extract(f"fps={fps},{scale}")
    print(f"[Extract] Extracted {len(frames)} frames"
          + (" at native resolution" if native else ""))
    _warn_if_crushed(frames)
    deduped = dedupe_similar_frames(frames)
    print(f"[Extract] {len(deduped)} frames remain after near-duplicate dedup")
    return deduped


def _warn_if_crushed(frames):
    """Flag frames whose whole tonal range is compressed into the bottom half.

    A screen recording contains a white UI, so the peak should sit near 255.
    A peak around 137 means PQ code values reached the PNG untouched and the
    frame carries almost no measurable contrast. Saying so explicitly beats
    letting the bar readers fail with a threshold error, which is the wrong
    place to look.
    """
    if not frames:
        return
    peaks = [p for p in (_frame_peak_luma(f) for f in frames[:5]) if p is not None]
    if not peaks:
        return
    peak = max(peaks)
    print(f"[Extract] Peak luminance across sampled frames: {peak}/255")
    if peak < 200:
        print(f"[Extract] WARNING: frames are tonally crushed (peak {peak}). A screen "
              "recording should peak near 255. This is what an untone-mapped HDR "
              "decode looks like, and bar measurement cannot work on it.")


def preprocess_image(image_path):
    """Preprocess image for better OCR."""
    img = Image.open(image_path).convert("L")
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.point(lambda x: 0 if x < 100 else (255 if x > 180 else x))
    return img


def crop_card_region(img):
    """Crop to the Pokemon card region (center of screen)."""
    w, h = img.size
    left = int(w * 0.05)
    top = int(h * 0.15)
    right = int(w * 0.95)
    bottom = int(h * 0.85)
    return img.crop((left, top, right, bottom))




def extract_moves(text):
    """Extract fast and charged moves from OCR text."""
    lines = text.split("\n")
    found_moves = {"fast": None, "charged1": None, "charged2": None}
    for line in lines:
        clean = line.strip()
        if not clean:
            continue
        upper = clean.upper()
        for move in FAST_MOVES:
            if move.upper() in upper:
                found_moves["fast"] = move
                break
        for move in CHARGED_MOVES:
            if move.upper() in upper:
                if not found_moves["charged1"]:
                    found_moves["charged1"] = move
                elif not found_moves["charged2"] and found_moves["charged1"] != move:
                    found_moves["charged2"] = move
                    break
    return found_moves


def parse_pokemon_text(text):
    """Parse OCR text into structured record."""
    rec = {}
    t = text.replace(",", "")
    for field, pattern in REGEX_PATTERNS.items():
        match = pattern.search(t)
        if match:
            val = match.group(1).replace(",", "")
            if field in ["cp", "hp", "attack_iv", "defense_iv", "stamina_iv",
                         "stardust", "candy", "xl_candy", "mega_energy"]:
                rec[field] = int(float(val)) if "." in val else int(val)
            elif field == "iv_percent":
                rec[field] = float(val)
            elif field == "level":
                rec[field] = float(val)
            elif field in ["weight", "height"]:
                rec[field] = val
            elif field in ["gender_male", "gender_female", "favorite", "shiny",
                           "shadow", "purified", "lucky", "weather_boosted"]:
                rec[field] = True
            elif field == "catch_date":
                rec[field] = match.group(1)
    if rec.pop("gender_male", False):
        rec["gender"] = "Male"
    elif rec.pop("gender_female", False):
        rec["gender"] = "Female"
    name = find_pokemon_name(text)
    if name:
        rec["pokemon_name"] = name
        dex = NAME_TO_DEX.get(name)
        if dex:
            rec["dex_number"] = dex
            rec["is_legendary"] = dex in LEGENDARY_DEX
            rec["is_mythical"] = dex in MYTHICAL_DEX
    moves = extract_moves(text)
    if moves["fast"]:
        rec["fast_move"] = moves["fast"]
        rec["fast_move_type"] = MOVE_TYPES.get(moves["fast"], "")
    if moves["charged1"]:
        rec["charged_move_1"] = moves["charged1"]
        rec["charged_move_type_1"] = MOVE_TYPES.get(moves["charged1"], "")
    if moves["charged2"]:
        rec["charged_move_2"] = moves["charged2"]
        rec["charged_move_type_2"] = MOVE_TYPES.get(moves["charged2"], "")
    return rec


def find_pokemon_name(text):
    """Find first known Pokemon name in text."""
    lines = text.split("\n")[:15]
    for line in lines:
        clean = line.strip()
        if len(clean) < 3 or len(clean) > 25:
            continue
        lower = clean.lower()
        for name, dex in NAME_TO_DEX.items():
            if name.lower() in lower:
                return name
        words = lower.split()
        for i in range(len(words)):
            for j in range(i + 1, min(i + 4, len(words) + 1)):
                phrase = " ".join(words[i:j])
                for name, dex in NAME_TO_DEX.items():
                    if name.lower() == phrase:
                        return name
    return None


def deduplicate_records(records):
    """Deduplicate by name + CP decade."""
    seen = set()
    unique = []
    for rec in records:
        name = rec.get("pokemon_name", "Unknown")
        cp = rec.get("cp", 0)
        key = f"{name}_{cp // 10}"
        if key not in seen:
            seen.add(key)
            unique.append(rec)
    return unique


def record_to_csv_row(rec):
    """Convert record to CSV row dict."""
    row = {f: "" for f in CSV_FIELDS}
    row.update({
        "pokemon_name": rec.get("pokemon_name", ""),
        "dex_number": rec.get("dex_number", ""),
        "cp": rec.get("cp", ""),
        "hp": rec.get("hp", ""),
        "level": rec.get("level", ""),
        "attack_iv": rec.get("attack_iv", ""),
        "defense_iv": rec.get("defense_iv", ""),
        "stamina_iv": rec.get("stamina_iv", ""),
        "iv_percent": rec.get("iv_percent", ""),
        "gender": rec.get("gender", ""),
        "weight": rec.get("weight", ""),
        "height": rec.get("height", ""),
        "type_1": rec.get("type_1", ""),
        "type_2": rec.get("type_2", ""),
        "favorite": "1" if rec.get("favorite") else "",
        "shiny": "1" if rec.get("shiny") else "",
        "shadow": "1" if rec.get("shadow") else "",
        "purified": "1" if rec.get("purified") else "",
        "lucky": "1" if rec.get("lucky") else "",
        "fast_move": rec.get("fast_move", ""),
        "charged_move_1": rec.get("charged_move_1", ""),
        "charged_move_2": rec.get("charged_move_2", ""),
        "fast_move_type": rec.get("fast_move_type", ""),
        "charged_move_type_1": rec.get("charged_move_type_1", ""),
        "charged_move_type_2": rec.get("charged_move_type_2", ""),
        "stardust_powerup_cost": rec.get("stardust", ""),
        "current_candy": rec.get("candy", ""),
        "current_xl_candy": rec.get("xl_candy", ""),
        "mega_energy": rec.get("mega_energy", ""),
        "is_legendary": "1" if rec.get("is_legendary") else "",
        "is_mythical": "1" if rec.get("is_mythical") else "",
        "is_favorite": "1" if rec.get("favorite") else "",
        "caught_date": rec.get("catch_date", ""),
    })
    return row


# ---------------------------------------------------------------------------
# Gemini vision OCR for video frames (server-side; the only text reader. The
# --video path only). Mirrors the exact prompt/JSON schema the phone app uses
# in Scout Dashboard.dc.html's runVideoPipeline(), so output drops straight
# into the app's existing "PASTE FROM ANY AI CHAT" -> mergeVideoImport() path
# with zero client-side changes. Dex resolution and IV/rank math are left to
# the client (mechanics.resolveDexByName / solveIVs / rankPctForLeague) —
# duplicating the 1500+ species BASE_STATS table here would be a maintenance
# trap. This script only extracts what's printed on screen.

# NOTE: gemini-2.5-flash / gemini-2.5-flash-lite are dropped here on purpose.
# For newer API keys/projects Google now returns HTTP 404 "no longer
# available to new users" on the whole 2.5 generation ahead of its official
# Oct 2026 retirement, so keeping them in rotation just burns retries every
# batch. Only the confirmed-working 3.x generation is listed. run_gemini_
# video_ocr() also blacklists any model that 404s at runtime, so a future
# deprecation degrades gracefully instead of stalling the whole import.
GEMINI_MODELS = [
    "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite",
]

VIDEO_IMPORT_PROMPT = (
    "These are frames sampled from a Pokemon GO screen recording (collection list "
    "and/or Pokemon detail/appraise screens). Identify every distinct Pokemon shown. "
    "Merge repeat sightings of the same Pokemon across frames into one entry, using "
    "the most complete data seen. Respond with ONLY a JSON array, no markdown fences, "
    "no commentary. Each item: "
    '{"name": string, "gender":"M"|"F"|null, "cp": number|null, "hp": number|null, '
    '"candy": number|null, "xlCandy": number|null, "stardust": number|null, '
    '"powerUpDust": number|null, '
    '"type": string|null, "weight": string|null, "height": string|null, '
    '"fastMove": string|null, "chargeMove1": string|null, "chargeMove2": string|null, '
    '"evolveCandy": number|null, "atkIV": number|null, "defIV": number|null, '
    '"staIV": number|null, "lucky": boolean, "shadow": boolean, "favorite": boolean}. '
    "CP is the badge at the TOP of a detail card \u2014 never the stardust figure (the "
    "large comma-grouped number). If a card is scrolled past its top and no CP badge "
    "is visible in any frame, use null. A shadow Pokemon shows a PURIFY button and the "
    "Frustration move. Moves come from the Gyms & Raids section: the first is "
    "fastMove, the rest are charge moves; names only, without the type in parentheses. "
    "REPORTING RULE (read first): report EVERY Pokemon whose name you can read, even "
    "if every other field is null. A partially-readable Pokemon is still a Pokemon "
    "\u2014 emit it with nulls. The null/never-guess rules below apply to individual "
    "FIELDS, never to whether a Pokemon is listed. Only return an empty array if "
    "these frames genuinely contain no Pokemon at all (map view, item bag, loading "
    "screen).\n"
    "IV RULES (important):\n"
    "- Frames fall into two kinds. A DETAIL screen shows CP at the top, HP, "
    "weight/height, candy and the POWER UP / EVOLVE buttons. An APPRAISAL screen "
    "shows three labelled stat bars (Attack, Defense, HP) and a star rating.\n"
    "- atkIV/defIV/staIV exist ONLY as printed 0-15 numbers next to those bars, which "
    "appear once the appraisal is expanded. If you can see bars or stars but no "
    "numbers, return null for all three.\n"
    "- NEVER convert bar length, bar colour, star count or the appraisal phrase into "
    "an IV number. A full red bar is not 15.\n"
    "- powerUpDust is the SMALL stardust number printed directly on/beside the POWER "
    "UP button on a detail screen (next to a small candy count) \u2014 completely "
    "different from the large comma-grouped account-wide stardust balance elsewhere "
    "on screen. If the Power Up button is greyed out, missing, or shows only an XL "
    "Candy icon with no stardust number, return null; never guess it from the balance "
    "figure or from candy count alone.\n"
    "- The same Pokemon often appears on both screen kinds across frames: take "
    "CP/HP/candy/powerUpDust from the detail frames and the IV numbers from the "
    "appraisal frames, and merge them into one entry.\n"
    "- Use null for any FIELD not clearly visible. Never guess a field value \u2014 "
    "but never drop the Pokemon itself over a missing field."
)

# Appraisal recordings only — reads the star tier and which stat bars are
# completely full (never a 0-15 IV number off a partial bar), matching the
# phone app's appraisalPrompt(). The client's mergeAppraisalImport() turns
# star tier + full bars + CP/HP into the exact spread.
APPRAISAL_PROMPT = (
    "These are frames from a Pokemon GO APPRAISAL screen recording. Each Pokemon is "
    "shown on its appraisal view: a team-leader badge with a star rating, and three "
    "labelled stat bars (Attack, Defense, HP). Identify every distinct Pokemon. Merge "
    "repeat frames of the same Pokemon into one entry using the most complete data. "
    "Respond with ONLY a JSON array, no markdown, no commentary. Each item: "
    '{"name": string, "cp": number|null, "hp": number|null, "stars": 0|1|2|3|null, '
    '"perfect": boolean, "maxed": string[]}. \n'
    "RULES:\n"
    "- name is the Pokemon name at the top of the card; cp is the CP badge; hp is the "
    '"X / X HP" number (either figure).\n'
    "- stars = how many stars are filled in the appraisal badge medallion (0, 1, 2, or "
    "3). Use null only if the badge is not visible in any frame.\n"
    "- perfect = true ONLY when the rating is a flawless 100% (the badge/bars are shown "
    "fully red, or all three bars are completely full). Otherwise false.\n"
    "- maxed = the subset of [\"atk\",\"def\",\"sta\"] whose bar is COMPLETELY full "
    "— the coloured fill reaches the far right end of the bar. A bar that is nearly "
    "full but has any grey gap at the right is NOT maxed. Use \"atk\" for the Attack "
    "bar, \"def\" for Defense, \"sta\" for the HP bar. Return [] if no bar is "
    "completely full.\n"
    "- Do NOT output any 0-15 IV numbers. Report only the star tier and which bars are "
    "full.\n"
    "- Report every Pokemon whose name you can read, even if other fields are null."
)

# A single 1080px-wide phone-screenshot frame, re-encoded as base64 JPEG,
# measures ~140-180K chars on its own \u2014 the old 180000 budget let almost
# NO more than 1 frame per batch, so MAX_FRAMES_PER_BATCH=5 never actually
# bound and one Gemini call was spent per frame. A generateContent request
# can carry many MB of inline image data, so raise the budget generously;
# MAX_FRAMES_PER_BATCH is the real cap now (fewer, bigger requests = far
# fewer calls against the free tier's per-model daily request cap).
MAX_FRAMES_PER_BATCH = 10
BATCH_CHAR_BUDGET = 1600000
REQUEST_TIMEOUT_S = 90
BATCH_PACE_S = 1.5


# ---------------------------------------------------------------------------
# Exact IV measurement from the appraisal bars.
#
# The appraisal bar is three segments worth 5 IV each (15 total) and the fill is
# strictly proportional, so IV = round(15 * filledWidth / totalWidth). One IV
# point is ~1/5 of a segment; on a 417px bar that is ~28px, far above pixel
# noise. This is MEASUREMENT, not inference — no model is asked to judge how
# full a bar looks, which is the one thing vision models reliably get wrong.
#
# Verified against two known screenshots: Ho-Oh read 15.000/15.000/12.029 and
# Absol 14.033/15.000/15.000 — every raw value within 0.033 of an integer, and
# both spreads reproduce the on-screen CP and HP exactly through the game's own
# CP/HP formulas.
BAR_MIN_WIDTH_FRAC = 0.25   # a real bar spans >25% of screen width
BAR_SEARCH_TOP_FRAC = 0.55  # appraisal card sits in the lower part of the screen
BAR_SEARCH_RIGHT_FRAC = 0.62
BAR_GAP_TOLERANCE = 25      # px of non-bar allowed inside a bar (segment gaps)


def _bar_px_kind(r, g, b):
    """'fill' (saturated red/orange), 'track' (pale grey remainder) or None."""
    mx, mn = max(r, g, b), min(r, g, b)
    if mx > 120 and (mx - mn) > 45 and r > b:
        return "fill"
    if 200 < mx < 243 and (mx - mn) < 12:
        return "track"
    return None


def measure_appraisal_bars(image_path):
    """Read Attack/Defense/HP IVs off an appraisal screenshot by measuring bar
    fill. Returns {'atk','def','sta','raw','rawSegment','maxDrift','rowSpread',
    'confidence','candidates'} or None when the frame does not show three
    appraisal bars.

    Three independent measurements are fused:
      1. whole-bar fill fraction  — 15 * filled/total
      2. per-segment fill         — which of the 3 segments the fill ends in,
                                     plus the fraction within that segment
      3. multi-row agreement      — both of the above on up to 5 rows, median
    Where they agree the IV is certain. Where they do not, the frame still
    reports its best value but carries ranked alternates, and the CP/HP gate
    downstream picks the one that actually reproduces the on-screen numbers."""
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return None
    W, H = img.size
    if W < 200 or H < 200:
        return None
    px = img.load()
    x_lo, x_hi = int(W * 0.06), int(W * BAR_SEARCH_RIGHT_FRAC)
    y_lo = int(H * BAR_SEARCH_TOP_FRAC)

    # 1. Rows carrying enough bar-coloured pixels to be part of a bar.
    hit_rows = []
    step = max(1, W // 400)
    need = (x_hi - x_lo) * 0.35 / step
    for y in range(y_lo, H):
        n = 0
        for x in range(x_lo, x_hi, step):
            if _bar_px_kind(*px[x, y]):
                n += 1
        if n > need:
            hit_rows.append(y)
    if not hit_rows:
        return None

    # 2. Group contiguous rows into bands; a bar is several rows thick.
    bands, cur = [], [hit_rows[0]]
    for y in hit_rows[1:]:
        if y - cur[-1] <= 2:
            cur.append(y)
        else:
            bands.append(cur)
            cur = [y]
    bands.append(cur)
    bands = [b for b in bands if len(b) >= max(6, H // 300)]

    # 3. Measure each band with BOTH independent methods on SEVERAL rows.
    measured = []
    for band in bands:
        rows = _band_sample_rows(band)
        whole, seg = [], []
        extent = None
        for my in rows:
            ext = _scan_row(px, my, x_lo, x_hi)
            if not ext:
                continue
            x0, x1, last_fill, runs = ext
            width = x1 - x0 + 1
            if width < W * BAR_MIN_WIDTH_FRAC:
                continue
            extent = (x0, x1)
            whole.append(15.0 * (last_fill - x0 + 1) / width)
            s = _segment_value(runs, x0, x1)
            if s is not None:
                seg.append(s)
        if extent is None or not whole:
            continue
        measured.append(_reconcile(_median(whole), _median(seg) if seg else None,
                                   _spread(whole)))

    # 4. The appraisal trio is the last three consistent bars on screen.
    if len(measured) < 3:
        return None
    trio = measured[-3:]
    if any(m["iv"] is None for m in trio):
        return None
    ivs = [m["iv"] for m in trio]
    if any(v < 0 or v > 15 for v in ivs):
        return None
    drift = max(m["drift"] for m in trio)
    # A clean read lands within ~0.2 of an integer. Anything vaguer means the
    # bars were occluded or mid-animation. We no longer discard outright: we
    # emit alternates so the CP/HP gate downstream can arbitrate.
    conf = "high"
    if drift > 0.25 or any(m["disagree"] for m in trio):
        conf = "low"
    if drift > 0.45:
        return None
    return {
        "atk": ivs[0], "def": ivs[1], "sta": ivs[2],
        "raw": [round(m["whole"], 3) for m in trio],
        "rawSegment": [None if m["seg"] is None else round(m["seg"], 3) for m in trio],
        "maxDrift": round(drift, 3),
        "rowSpread": round(max(m["rowSpread"] for m in trio), 3),
        "confidence": conf,
        # Ordered per-stat alternates (best first) for CP/HP arbitration.
        "candidates": [m["candidates"] for m in trio],
    }


def _median(vals):
    v = sorted(vals)
    n = len(v)
    return v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])


def _spread(vals):
    return max(vals) - min(vals) if vals else 0.0


def _band_sample_rows(band):
    """Up to 5 rows from the band's middle 60% — edges are antialiased."""
    n = len(band)
    lo, hi = int(n * 0.2), max(int(n * 0.8), int(n * 0.2) + 1)
    inner = band[lo:hi] or band
    if len(inner) <= 5:
        return inner
    stepq = (len(inner) - 1) / 4.0
    return [inner[int(round(i * stepq))] for i in range(5)]


def _scan_row(px, my, x_lo, x_hi):
    """Walk one row; return (x0, x1, last_fill_x, runs) where runs is the list of
    (kind, start, end) spans making up the bar."""
    x0 = None
    for x in range(x_lo, x_hi):
        if _bar_px_kind(*px[x, my]):
            x0 = x
            break
    if x0 is None:
        return None
    x1 = last_fill = x0
    gap = 0
    runs = []
    cur_kind, cur_start = None, x0
    for x in range(x0, x_hi):
        kind = _bar_px_kind(*px[x, my])
        if kind:
            x1, gap = x, 0
            if kind == "fill":
                last_fill = x
            if kind != cur_kind:
                if cur_kind:
                    runs.append((cur_kind, cur_start, x - 1))
                cur_kind, cur_start = kind, x
        else:
            gap += 1
            if gap > BAR_GAP_TOLERANCE:
                break
    if cur_kind:
        runs.append((cur_kind, cur_start, x1))
    return x0, x1, last_fill, runs


def _segment_value(runs, x0, x1):
    """Independent read: locate the segment the fill ends in and measure the
    fraction WITHIN that segment, referenced to the segment's own boundaries
    rather than the whole bar. Immune to rounded end caps and to error in the
    bar's overall width. Returns an IV in 0..15 or None."""
    width = x1 - x0 + 1
    if width <= 0:
        return None
    seg_w = width / 3.0
    fill_end = None
    for kind, a, b in runs:
        if kind == "fill":
            fill_end = b
    if fill_end is None:
        return 0.0
    rel = fill_end - x0 + 1
    idx = min(2, int(rel / seg_w))          # which of the 3 segments
    within = (rel - idx * seg_w) / seg_w    # 0..1 inside that segment
    return 5.0 * idx + 5.0 * within


# How far the two methods may disagree before we stop trusting either outright.
METHOD_AGREE_TOL = 0.5


def _reconcile(whole, seg, row_spread):
    """Fuse the whole-bar and per-segment reads into one IV plus ranked
    alternates. When the methods agree we are done; when they do not, both
    roundings go forward as candidates for the CP/HP gate to settle."""
    vals = [whole] if seg is None else [whole, seg]
    best = _median(vals) if len(vals) > 1 else whole
    iv = int(round(best))
    if iv < 0 or iv > 15:
        return {"iv": None, "whole": whole, "seg": seg, "drift": 1.0,
                "rowSpread": row_spread, "disagree": True, "candidates": []}
    disagree = seg is not None and abs(whole - seg) > METHOD_AGREE_TOL
    drift = abs(best - iv)
    cands = [iv]
    for alt in (int(round(whole)), int(round(seg)) if seg is not None else None,
                iv + (1 if best > iv else -1)):
        if alt is not None and 0 <= alt <= 15 and alt not in cands:
            cands.append(alt)
    # A confident read offers no alternates at all; a shaky one offers the
    # neighbours in order of how close the measurement sat to them.
    if not disagree and drift < 0.2 and row_spread < 0.2:
        cands = [iv]
    return {"iv": iv, "whole": whole, "seg": seg, "drift": drift,
            "rowSpread": row_spread, "disagree": disagree, "candidates": cands}


# Identification-only prompt for the measured-bar pipeline. The IVs come from
# measure_appraisal_bars(), so the model is never asked about bars or stars at
# all — only the three printed values it reads reliably.
APPRAISAL_ID_PROMPT = (
    "This is one frame from a Pokemon GO appraisal screen. Respond with ONLY a "
    "JSON array containing exactly ONE object, no markdown, no commentary: "
    '[{"name": str, "cp": int|null, "hp": int|null}]\n'
    "- name is the Pokemon's species name shown on the card. If it has been given "
    "a nickname you cannot resolve to a species, use null.\n"
    "- cp is the number after CP at the top of the screen.\n"
    '- hp is the number in the "X / X HP" line (either figure \u2014 they match).\n'
    "- Do NOT report IVs, stars, bars or percentages. Ignore them entirely.\n"
    "- Use null for anything not clearly legible. Never guess."
)


def _row_dark_runs(px, y, W, min_run):
    """Split one row into runs of "darker than this row's midpoint".

    The threshold is derived per row from that row's own min/max luminance, so
    it holds whatever the bar's actual colour is — red on white, green on cream,
    or a re-encoded video frame whose colours have drifted. Nothing here refers
    to a specific hue.
    """
    xlo, xhi = int(W * 0.02), int(W * 0.98)
    lo, hi = 255.0, 0.0
    for x in range(xlo, xhi):
        r, g, b = px[x, y]
        l = 0.299 * r + 0.587 * g + 0.114 * b
        if l < lo:
            lo = l
        if l > hi:
            hi = l
    if hi - lo < 45:
        return []
    t = (lo + hi) / 2.0
    runs, start = [], None
    for x in range(xlo, xhi):
        r, g, b = px[x, y]
        dark = (0.299 * r + 0.587 * g + 0.114 * b) < t
        if dark and start is None:
            start = x
        elif not dark and start is not None:
            runs.append((start, x - 1))
            start = None
    if start is not None:
        runs.append((start, xhi - 1))
    return [r for r in runs if r[1] - r[0] + 1 >= min_run]


def _bar_groups(runs, W):
    """Cluster a row's runs into bar-shaped groups: exactly three runs of equal
    width separated by narrow gaps. That shape is what an appraisal bar IS —
    three segments, the last possibly cut short by the fill.

    Three is required, not 2-3. A two-run group is ambiguous: it can be a bar
    whose fill stops in segment 2, or a bar whose first gap was blurred away by
    video encoding so that segments 1+2 arrived as ONE run. The two cases are
    indistinguishable from the group alone, and reading the second as the first
    makes seg_w twice the truth — which inflates the reconstructed bar width the
    same way and reads a true 15 as a 6. With three runs the two leading
    segments are both known-complete and can be checked against each other, so
    a merged run is caught by the equal-width test instead of silently setting
    the scale."""
    if not runs:
        return []
    groups, cur = [], [runs[0]]
    for i in range(1, len(runs)):
        gap = runs[i][0] - runs[i - 1][1] - 1
        w = runs[i - 1][1] - runs[i - 1][0] + 1
        if gap <= max(6, w * 0.35):
            cur.append(runs[i])
        else:
            groups.append(cur)
            cur = [runs[i]]
    groups.append(cur)
    out = []
    for gr in groups:
        if not (1 <= len(gr) <= 3):
            continue
        widths = [r[1] - r[0] + 1 for r in gr]
        span = gr[-1][1] - gr[0][0] + 1
        if span < W * 0.03 or span > W * 0.80:
            continue
        g = {"x0": gr[0][0], "fill_end": gr[-1][1], "span": span,
             "nruns": len(gr), "seg_w": None, "gap": None}
        if len(gr) == 3:
            complete = widths[:-1]      # the last segment may be partly filled
            lo, hi = min(complete), max(complete)
            if hi - lo > max(3, hi * 0.15):
                continue                # a merged run — not a real 3-segment bar
            if widths[-1] > hi * 1.15:
                continue
            g["seg_w"] = (lo + hi) // 2
            g["gap"] = gr[1][0] - gr[0][1] - 1
        out.append(g)
    return out


def _median_int(vals):
    """Lower-middle value — keeps pixel measurements as whole pixels."""
    s = sorted(vals)
    return s[len(s) // 2]


def measure_appraisal_bars_structural(image_path):
    """Colour-free fallback reader.

    Finds the bars by SHAPE rather than hue: three parallel rows, each made of
    equal-width segments with narrow gaps, sharing a left edge and evenly
    spaced. The full bar width is reconstructed from the segment geometry
    (3 segments + 2 gaps), so a bar that is only part-filled still yields a
    correct denominator without needing to see its unfilled remainder.

    This exists because the colour thresholds in _bar_px_kind were calibrated on
    PNG screenshots and find nothing at all on frames that have been through
    video encoding and rescaling — a recording measured 0/20 frames while the
    same screen as a screenshot measured perfectly.
    """
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return None
    W, H = img.size
    if W < 200 or H < 200:
        return None
    px = img.load()
    min_run = max(6, int(W * 0.02))

    cand = []
    for y in range(int(H * 0.35), H):
        runs = _row_dark_runs(px, y, W, min_run)
        if len(runs) < 2:
            continue
        for g in _bar_groups(runs, W):
            g["y"] = y
            cand.append(g)
    if not cand:
        return None

    bands, cur = [], []
    for r in cand:
        if cur and r["y"] - cur[-1]["y"] <= 2 and abs(r["x0"] - cur[0]["x0"]) <= max(3, W * 0.01):
            cur.append(r)
        else:
            if len(cur) >= 3:
                bands.append(cur)
            cur = [r]
    if len(cur) >= 3:
        bands.append(cur)
    if len(bands) < 3:
        return None

    def mid(b):
        return b[len(b) // 2]

    best = None
    for i in range(len(bands)):
        for j in range(i + 1, len(bands)):
            for k in range(j + 1, len(bands)):
                t = [mid(bands[i]), mid(bands[j]), mid(bands[k])]
                xs = [r["x0"] for r in t]
                if max(xs) - min(xs) > max(3, W * 0.01):
                    continue
                g1 = t[1]["y"] - t[0]["y"]
                g2 = t[2]["y"] - t[1]["y"]
                if abs(g1 - g2) > max(5, H * 0.01):
                    continue
                sw = [r["seg_w"] for r in t if r["seg_w"]]
                if sw and max(sw) - min(sw) > max(3, max(sw) * 0.15):
                    continue
                # Prefer the lowest trio on screen: the appraisal card sits
                # below everything else it could be confused with.
                if best is None or t[0]["y"] > best[0][0]["y"]:
                    best = (t, [bands[i], bands[j], bands[k]])
    if best is None:
        return None

    trio = best[1]
    allrows = [r for b in trio for r in b]
    # The SCALE (segment width + gap) may only be taken from rows that actually
    # showed all three segments. A row whose fill stops early shows fewer runs
    # and says nothing about how wide a segment is; letting it set the scale is
    # what read a full bar as a third of one. Bars share one geometry, so the
    # scale measured on the fullest bar applies to all three.
    scaled = [r for r in allrows if r["seg_w"]]
    if not scaled:
        print("[Bars] structural: no row showed three complete segments — "
              "cannot establish bar width, skipping frame")
        return None
    seg_w = _median_int([r["seg_w"] for r in scaled])
    gap = _median_int([r["gap"] for r in scaled])
    x0 = _median_int([r["x0"] for r in allrows])
    width = 3 * seg_w + 2 * gap
    if width <= 0:
        return None
    # A fill can never run past the end of its own bar. If some band's fill
    # extends beyond the reconstructed width, the width is wrong (merged
    # segments), and every IV derived from it is wrong by the same factor.
    widest = max(r["fill_end"] for r in allrows) - x0 + 1
    if widest > width * 1.04:
        print(f"[Bars] structural: reconstructed width {width}px is smaller than "
              f"the observed fill {widest}px — segment geometry is wrong, "
              f"skipping frame")
        return None

    raw = []
    for b in trio:
        vals = sorted(15.0 * (r["fill_end"] - x0 + 1) / width for r in b)
        raw.append(vals[len(vals) // 2])
    ivs = [int(round(v)) for v in raw]
    if any(v < 0 or v > 15 for v in ivs):
        return None
    drift = max(abs(v - round(v)) for v in raw)
    if drift > 0.45:
        return None
    cands = []
    for v, iv in zip(raw, ivs):
        alt = [iv]
        nb = iv + (1 if v > iv else -1)
        if abs(v - iv) > 0.2 and 0 <= nb <= 15:
            alt.append(nb)
        cands.append(alt)
    return {"atk": ivs[0], "def": ivs[1], "sta": ivs[2],
            "raw": [round(v, 3) for v in raw],
            "rawSegment": [None, None, None],
            "maxDrift": round(drift, 3), "rowSpread": 0.0,
            "confidence": "high" if drift < 0.2 else "low",
            "candidates": cands, "method": "structural",
            "bands": {"x0": x0, "segW": seg_w, "gap": gap, "width": width,
                      "fillEnds": [max(r["fill_end"] for r in b) for b in trio]}}


def _frame_white_point(img):
    """Luminance of the frame's brightest 0.1% — its effective white.

    Every threshold below is a RATIO of this rather than an absolute value.
    The original thresholds were ratios of 255 with the 255 baked in, which is
    correct only for a frame that actually reaches full scale. An HDR screen
    recording decoded without tone-mapping peaks around 137, and the same UI
    then sits at roughly half the code values the constants assume \u2014 the gold
    bar fill lands on (120,107,78), missing `mx > 120` and `chroma > 45` by one
    and three counts respectively. Scaling by the measured white point makes
    one set of thresholds fit both a clean screenshot and a crushed frame.
    """
    h = img.convert("L").histogram()
    total = sum(h) or 1
    acc = 0
    for v in range(255, -1, -1):
        acc += h[v]
        if acc >= total * 0.001:
            return max(v, 32)
    return 255


def _warm_runs(px, y, x_lo, x_hi, min_chroma, min_run):
    """Horizontal runs of bar-fill colour in one row.

    The test is WARMTH (r - b) rather than darkness. The appraisal fill is a
    gold/red on a near-white card, so it is barely darker than its background
    but strongly warmer \u2014 42 counts of red-blue separation on a frame whose
    total luminance range is 8. Thresholding on luminance finds the dark
    team-leader avatar sharing the row and misses the bar entirely.
    """
    runs, start = [], None
    for x in range(x_lo, x_hi):
        r, g, b = px[x, y]
        warm = (r - b) >= min_chroma and r >= g >= b
        if warm and start is None:
            start = x
        elif not warm and start is not None:
            if x - start >= min_run:
                runs.append((start, x - 1))
            start = None
    if start is not None and x_hi - start >= min_run:
        runs.append((start, x_hi - 1))
    return runs


def measure_appraisal_bars_warm(image_path):
    """Primary reader: find the three appraisal bars by fill warmth, then take
    the bar width from the SEGMENT GEOMETRY rather than from any single bar's
    extent.

    Three segments and two gaps reconstruct the full width even when no bar is
    full, and the widest observed fill is used as a floor (a fill can never
    exceed its own bar). Verified against three frames of the reference
    recording: 14/15/15, 13/11/6 and 10/9/9, every raw value within 0.17 of an
    integer."""
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return None
    W, H = img.size
    if W < 200 or H < 200:
        return None
    px = img.load()
    white = _frame_white_point(img)
    min_chroma = max(8, int(round(0.14 * white)))
    min_run = max(4, int(round(W * 0.01)))
    x_lo, x_hi = int(W * 0.02), int(W * 0.98)

    rows = []
    for y in range(int(H * 0.30), H):
        runs = _warm_runs(px, y, x_lo, x_hi, min_chroma, min_run)
        if runs and (runs[-1][1] - runs[0][0] + 1) > W * 0.08:
            rows.append((y, runs))
    if not rows:
        return None

    bands, cur = [], []
    for row in rows:
        if (cur and row[0] - cur[-1][0] <= 2
                and abs(row[1][0][0] - cur[0][1][0][0]) <= W * 0.01):
            cur.append(row)
        else:
            if len(cur) >= 5:
                bands.append(cur)
            cur = [row]
    if len(cur) >= 5:
        bands.append(cur)
    if len(bands) < 3:
        return None

    best = None
    for i in range(len(bands)):
        for j in range(i + 1, len(bands)):
            for k in range(j + 1, len(bands)):
                t = [b[len(b) // 2] for b in (bands[i], bands[j], bands[k])]
                xs = [r[1][0][0] for r in t]
                if max(xs) - min(xs) > W * 0.01:
                    continue
                if abs((t[1][0] - t[0][0]) - (t[2][0] - t[1][0])) > H * 0.01:
                    continue
                # Lowest trio on screen: the appraisal card sits below the
                # medallion, which is also gold and also makes warm runs.
                if best is None or t[0][0] > best[0][0]:
                    best = t
    if best is None:
        return None

    segs, gaps = [], []
    for _, runs in best:
        for i in range(len(runs) - 1):
            segs.append(runs[i][1] - runs[i][0] + 1)
            gaps.append(runs[i + 1][0] - runs[i][1] - 1)
    if not segs:
        return None
    seg_w = _median_int(segs)
    gap = _median_int(gaps)
    x0 = _median_int([r[1][0][0] for r in best])
    max_fill = max(r[1][-1][1] for r in best)
    width = max(3 * seg_w + 2 * gap, max_fill - x0 + 1)
    if width <= 0:
        return None

    raw = [15.0 * (r[1][-1][1] - x0 + 1) / width for r in best]
    ivs = [int(round(v)) for v in raw]
    if any(v < 0 or v > 15 for v in ivs):
        return None
    drift = max(abs(v - round(v)) for v in raw)
    if drift > 0.45:
        return None
    cands = []
    for v, iv in zip(raw, ivs):
        alt = [iv]
        nb = iv + (1 if v > iv else -1)
        if abs(v - iv) > 0.2 and 0 <= nb <= 15:
            alt.append(nb)
        cands.append(alt)
    return {"atk": ivs[0], "def": ivs[1], "sta": ivs[2],
            "raw": [round(v, 3) for v in raw],
            "rawSegment": [None, None, None],
            "maxDrift": round(drift, 3), "rowSpread": 0.0,
            "confidence": "high" if drift < 0.25 else "low",
            "candidates": cands, "method": "warm",
            "bands": {"x0": x0, "segW": seg_w, "gap": gap, "width": width,
                      "white": white,
                      "fillEnds": [r[1][-1][1] for r in best]}}


def measure_appraisal_bars_any(image_path):
    """Warm-fill reader first (works on video frames and screenshots alike),
    then the original colour reader, then the shape reader."""
    m = measure_appraisal_bars_warm(image_path)
    if m:
        return m
    m = measure_appraisal_bars(image_path)
    if m:
        m.setdefault("method", "colour")
        return m
    return measure_appraisal_bars_structural(image_path)


def _dump_bar_diagnostics(frames, out_dir="data/debug_bars", hits=None):
    """Save real frames and print the row structure the shape reader works from.

    A wrong IV tells you the reader is wrong but not why. The run traces below
    show the actual dark-runs per row, so a mis-sized segment (which is what
    turns a true 15 into a 6) is visible directly instead of inferred.
    """
    if not frames:
        return
    try:
        os.makedirs(out_dir, exist_ok=True)
        n = len(frames)
        # The frames that DID measure are the informative ones — a wrong width
        # is only visible on a frame the reader actually locked onto. Dump those
        # first, then fill up to 3 with evenly spaced others.
        picks = [p for _, p, _ in (hits or [])][:3]
        spread = ([frames[n // 4], frames[n // 2], frames[(3 * n) // 4]]
                  if n > 3 else list(frames[:3]))
        for p in spread:
            if len(picks) >= 3:
                break
            if p not in picks:
                picks.append(p)
        measured_by_path = {p: m for _, p, m in (hits or [])}
        for idx, path in enumerate(picks):
            img = Image.open(path).convert("RGB")
            W, H = img.size
            img.save(os.path.join(out_dir, f"frame_{idx + 1}.png"))
            px = img.load()
            m = measured_by_path.get(path)
            tag = "  MEASURED" if m else ""
            print(f"[Bars][debug] frame_{idx + 1}.png  {W}x{H}{tag}")
            if m:
                print(f"[Bars][debug]   read {m.get('atk')}/{m.get('def')}/"
                      f"{m.get('sta')} method={m.get('method')} "
                      f"raw={m.get('raw')} seg={m.get('rawSegment')} "
                      f"bands={m.get('bands')}")
            min_run = max(6, int(W * 0.02))
            wide = int(W * 0.20)
            rows = []
            for y in range(int(H * 0.30), H, 3):
                runs = _row_dark_runs(px, y, W, min_run)
                if not runs:
                    continue
                widths = [r[1] - r[0] + 1 for r in runs]
                # Two shapes matter: a segmented bar (2-4 runs) and a solid
                # long run (a bar whose gaps the encoder smoothed away). The
                # old filter caught only the first and capped at the first 20
                # matching rows, which on a tall phone frame never got past
                # the sprite \u2014 the bars sit below everything it printed.
                if len(runs) <= 4 or max(widths) >= wide:
                    rows.append((y, runs, widths))
            if rows:
                stepr = max(1, len(rows) // 24)
                for y, runs, widths in rows[::stepr][:24]:
                    print(f"[Bars][debug]   y={y} n={len(runs)} runs={runs} widths={widths}")
                print(f"[Bars][debug]   {len(rows)} candidate rows total "
                      f"(showing every {stepr})")
            else:
                print("[Bars][debug]   no row produced bar-like runs \u2014 the bars are "
                      "not being separated from the background at all")
        print(f"[Bars][debug] wrote {len(picks)} frame(s) to {out_dir}/")
    except Exception as e:
        print(f"[Bars][debug] diagnostics failed: {e}")


def run_appraisal_pipeline(frames):
    """Measure IVs off every frame's appraisal bars, collapse consecutive frames
    showing the same Pokemon, then ask Gemini only for the name/CP/HP on each
    representative frame.

    Attribution is the reason for the one-frame-per-call structure: the spread is
    measured from a specific image, so the name it is joined to has to come from
    that same image. Batching would merge sightings and could pair a spread with
    the wrong Pokemon."""
    readings = []
    for idx, path in enumerate(frames):
        readings.append((idx, path, measure_appraisal_bars_any(path)))
    hits = [(i, p, m) for i, p, m in readings if m]
    print(f"[Bars] Measured appraisal bars on {len(hits)}/{len(frames)} frames")
    # Dump evidence whenever the read is WEAK, not only when it fails outright.
    # A run that measures 1 frame in 20 is just as broken as one that measures
    # none, and needs the same evidence to fix.
    if len(hits) < max(3, len(frames) * 0.25):
        _dump_bar_diagnostics(frames, hits=hits)
    if not hits:
        print("[Bars] No appraisal bars found \u2014 falling back to the model-read prompt.")
        items = run_gemini_video_ocr(frames, prompt=APPRAISAL_PROMPT,
                                     merge_key=_appraisal_merge_key)
        # These spreads are MODEL GUESSES, not measurements. Tagging them is what
        # stops the client pinning them as exact IVs \u2014 which is exactly what
        # produced wrong spreads (Absol read 14/10/13 against a true 14/15/15).
        for it in items:
            it["ivSource"] = "model-guess"
        return items

    # Group frames into one-Pokemon runs. A run continues only while the frames
    # are ADJACENT in the original recording AND the spread is unchanged.
    #
    # Grouping on the spread alone silently loses Pokemon: identical spreads are
    # common in an appraised collection (15/15/15 and friends), so two different
    # Pokemon would collapse into one group, get one identification call, and
    # the second would never be written out. Requiring adjacency means a gap in
    # frame indices \u2014 the screen changed, or frames between showed no bars \u2014
    # always starts a new Pokemon, whatever the spread happens to be.
    groups, cur = [], [hits[0]]
    for idx, path, m in hits[1:]:
        prev_idx, _, prev = cur[-1]
        same_spread = (m["atk"], m["def"], m["sta"]) == (prev["atk"], prev["def"], prev["sta"])
        if same_spread and (idx - prev_idx) == 1:
            cur.append((idx, path, m))
        else:
            groups.append(cur)
            cur = [(idx, path, m)]
    groups.append(cur)
    print(f"[Bars] {len(groups)} distinct sightings after collapsing consecutive repeat frames")

    items = []
    for i, grp in enumerate(groups):
        _, path, m = grp[len(grp) // 2]
        try:
            got = run_gemini_video_ocr([path], prompt=APPRAISAL_ID_PROMPT,
                                       merge_key=_appraisal_merge_key)
        except Exception as e:
            print(f"[Bars] group {i + 1}/{len(groups)}: identification failed ({e})")
            got = []
        if not got:
            print(f"[Bars] group {i + 1}/{len(groups)}: measured {m['atk']}/{m['def']}/{m['sta']} "
                  f"but could not read the name/CP/HP \u2014 skipped")
            continue
        it = dict(got[0])
        if not it.get("name") or it.get("cp") is None or it.get("hp") is None:
            print(f"[Bars] group {i + 1}/{len(groups)}: measured {m['atk']}/{m['def']}/{m['sta']} "
                  f"but name/CP/HP incomplete \u2014 skipped (client matches on all three)")
            continue
        it["atkIV"], it["defIV"], it["staIV"] = m["atk"], m["def"], m["sta"]
        it["ivSource"] = "bar-measure"
        it["barRaw"], it["barDrift"] = m["raw"], m["maxDrift"]
        it["barSegmentRaw"] = m["rawSegment"]
        it["barConfidence"] = m["confidence"]
        it["barMethod"] = m.get("method", "colour")
        it["ivCandidateSets"] = m["candidates"]
        items.append(it)
        alt = "" if all(len(c) == 1 for c in m["candidates"]) else \
            " alts " + "|".join(",".join(str(v) for v in c) for c in m["candidates"])
        print(f"[Bars] {it.get('name')} cp{it.get('cp')} hp{it.get('hp')} "
              f"\u2192 {m['atk']}/{m['def']}/{m['sta']} "
              f"(drift {m['maxDrift']}, {m.get('method', 'colour')}, {m['confidence']}){alt}")

    # Same individual can appear twice in one recording; keep the first.
    seen, out = set(), []
    for it in items:
        k = _appraisal_merge_key(it)
        if k in seen:
            continue
        seen.add(k)
        out.append(it)
    return out


class GeminiError(Exception):
    def __init__(self, message, status=None, daily=False):
        super().__init__(message)
        self.status = status
        self.daily = daily


def get_gemini_keys():
    """Reads GEMINI_API_KEY_1 / GEMINI_API_KEY_2 (or single GEMINI_API_KEY)."""
    keys = []
    for name in ("GEMINI_API_KEY_1", "GEMINI_API_KEY_2", "GEMINI_API_KEY"):
        v = os.environ.get(name)
        if v and v not in keys:
            keys.append(v)
    return keys


def image_to_base64_jpeg(path, quality=85, max_width=1080):
    """Loads a frame (ffmpeg outputs PNG) and re-encodes as base64 JPEG —
    smaller payload, and Gemini's inline_data expects a mime type we control.

    Downscaling happens HERE rather than at extraction, so the measured frame
    keeps every pixel while the uploaded copy stays small."""
    import io
    import base64
    img = Image.open(path)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if max_width and img.width > max_width:
        h = max(1, round(img.height * max_width / img.width))
        img = img.resize((max_width, h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def extract_json_array(reply):
    """Python port of the client's extractJsonArray(): strips markdown fences,
    tolerates preamble/postamble text, and salvages complete objects out of a
    truncated array rather than failing the whole batch."""
    t = (reply or "").strip()
    if not t:
        return None
    t = re.sub(r"^```(?:json)?\s*", "", t, flags=re.IGNORECASE)
    t = re.sub(r"```\s*$", "", t)
    t = t.strip()
    open_br = t.find("[")
    open_cu = t.find("{")
    if open_br < 0 and open_cu < 0:
        return None
    start = open_br if (open_br >= 0 and (open_cu < 0 or open_br < open_cu)) else open_cu
    t = t[start:]
    last_close = max(t.rfind("]"), t.rfind("}"))
    candidates = []
    if last_close >= 0:
        candidates.append(t[:last_close + 1])
    candidates.append(t)
    for c in candidates:
        try:
            v = json.loads(c)
            return v if isinstance(v, list) else [v]
        except (ValueError, TypeError):
            continue
    # Truncated array: salvage whichever complete {...} objects appear before the cut.
    objs = []
    depth = 0
    obj_start = -1
    in_str = False
    esc = False
    for i, ch in enumerate(t):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            if depth == 0:
                obj_start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and obj_start >= 0:
                try:
                    objs.append(json.loads(t[obj_start:i + 1]))
                except (ValueError, TypeError):
                    pass
                obj_start = -1
    return objs if objs else None


def call_gemini(prompt_text, images_b64, model, api_key, batch_note=""):
    """POSTs one batch of frames to Gemini. Raises GeminiError on failure so
    the caller can rotate keys/models; returns the raw text reply on success."""
    parts = [{"text": prompt_text + batch_note}]
    for data in images_b64:
        parts.append({"inline_data": {"mime_type": "image/jpeg", "data": data}})
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        + model + ":generateContent?key=" + api_key
    )

    def build_body(extras):
        cfg = {"maxOutputTokens": 4096, "temperature": 0}
        if extras:
            cfg["responseMimeType"] = "application/json"
            cfg["thinkingConfig"] = {"thinkingBudget": 0}
        return {"contents": [{"role": "user", "parts": parts}], "generationConfig": cfg}

    resp = requests.post(url, json=build_body(False), timeout=REQUEST_TIMEOUT_S)
    if resp.status_code == 400:
        # Some models need the JSON mime type to return parseable output.
        resp = requests.post(url, json=build_body(True), timeout=REQUEST_TIMEOUT_S)

    if resp.ok:
        data = resp.json()
        cands = data.get("candidates") or []
        cand = cands[0] if cands else None
        text_parts = (cand or {}).get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in text_parts)
        if not text:
            raise GeminiError("Gemini returned no text")
        return text

    err_text = resp.text or ""
    if resp.status_code == 429:
        daily = bool(re.search(r"PerDay|per day|daily", err_text, re.IGNORECASE))
        raise GeminiError("Gemini 429" + (" (daily quota)" if daily else " (per-minute)"),
                           status=429, daily=daily)
    if resp.status_code == 403:
        raise GeminiError("Gemini refused the key (403) \u2014 enable the Generative "
                           "Language API for this key at aistudio.google.com.", status=403)
    raise GeminiError(f"Gemini {model} error {resp.status_code}: {err_text[:200]}",
                       status=resp.status_code)


def _video_merge_key(item):
    return str(item["name"]).lower() + "|" + ("?" if item.get("cp") is None else str(item.get("cp")))


def _appraisal_merge_key(item):
    # Two different individuals of one species can share a CP; the HP tells them
    # apart, so the appraisal merge keys on name+CP+HP (the client matches the
    # same way).
    return (str(item["name"]).lower() + "|"
            + ("?" if item.get("cp") is None else str(item.get("cp")))
            + "|" + ("?" if item.get("hp") is None else str(item.get("hp"))))


def run_gemini_video_ocr(frame_paths, prompt=VIDEO_IMPORT_PROMPT, merge_key=None):
    """Batches frames, rotates 5 models x N keys the same way the phone app
    does, and merges duplicate sightings across batches. `prompt` and
    `merge_key` are swapped out for the appraisal path; everything else
    (rotation, cooldowns, JSON salvage) is shared. Returns a list of item
    dicts matching whichever JSON schema the prompt asked for."""
    if merge_key is None:
        merge_key = _video_merge_key
    keys = get_gemini_keys()
    if not keys:
        raise RuntimeError(
            "No Gemini API key found. Set GEMINI_API_KEY_1 (and optionally "
            "GEMINI_API_KEY_2) as GitHub Actions secrets."
        )

    print(f"[Gemini] Encoding {len(frame_paths)} frames as base64 JPEG...")
    encoded = [image_to_base64_jpeg(p) for p in frame_paths]

    batches = []
    current, current_size = [], 0
    for data in encoded:
        if current and (current_size + len(data) > BATCH_CHAR_BUDGET or len(current) >= MAX_FRAMES_PER_BATCH):
            batches.append(current)
            current, current_size = [], 0
        current.append(data)
        current_size += len(data)
    if current:
        batches.append(current)
    print(f"[Gemini] {len(batches)} batch(es) of up to {MAX_FRAMES_PER_BATCH} frames each")

    model_idx = 0
    dead_models = set()  # models that returned 404 "no longer available" this run
    # Cooldown tracked per (model, key) pair, not per key alone: Gemini's
    # per-minute AND per-day request caps are counted separately per model
    # (see the account's own rate-limit page \u2014 each model has its own
    # RPD bucket). A key hitting its daily cap on one model still has full
    # headroom on the others, so a whole-key cooldown was wasting quota.
    pair_cooldowns = {(m, k): 0 for m in GEMINI_MODELS for k in keys}
    collected = []

    def next_live_model_idx(start_idx):
        """First rotation slot, starting at start_idx, that isn't blacklisted.
        Returns None if every model has 404'd this run."""
        n = len(GEMINI_MODELS)
        for step in range(n):
            idx = (start_idx + step) % n
            if GEMINI_MODELS[idx] not in dead_models:
                return idx
        return None

    for b_i, batch in enumerate(batches):
        note = f" (This is batch {b_i + 1} of {len(batches)} from the same recording.)" if len(batches) > 1 else ""
        attempts = 0
        no_capacity_streak = 0
        max_attempts = len(GEMINI_MODELS) * len(keys) * 2 + 4
        succeeded = False
        while attempts < max_attempts and not succeeded:
            idx = next_live_model_idx(model_idx)
            if idx is None:
                print("[Gemini] Every model in GEMINI_MODELS returned 404 for this "
                      "API key/account \u2014 aborting. Check available model names "
                      "at aistudio.google.com.")
                break
            model = GEMINI_MODELS[idx]
            now = time.time()
            usable_keys = [k for k in keys if pair_cooldowns[(model, k)] <= now]
            if not usable_keys:
                # This model has no usable key right now, but a *different*
                # model may still have headroom \u2014 try that before waiting.
                model_idx = idx + 1
                attempts += 1
                no_capacity_streak += 1
                if no_capacity_streak >= len(GEMINI_MODELS):
                    live = [m for m in GEMINI_MODELS if m not in dead_models]
                    pending = [pair_cooldowns[(m, k)] for m in live for k in keys]
                    wait = max(0, (min(pending) if pending else now + 60) - now)
                    print(f"[Gemini] No model/key combo has capacity \u2014 waiting {wait:.0f}s")
                    time.sleep(min(wait, 60) + 1)
                    no_capacity_streak = 0
                continue
            no_capacity_streak = 0
            key = usable_keys[attempts % len(usable_keys)]
            try:
                reply = call_gemini(prompt, batch, model, key, note)
                arr = extract_json_array(reply)
                if arr is None:
                    # Unparseable text is NOT a success \u2014 it's indistinguishable
                    # from a truncated/garbled response. Retrying on a different
                    # model/key catches the (common) case where one model just had
                    # a bad day; only after max_attempts is this batch actually
                    # given up on, same as a real GeminiError.
                    print(f"[Gemini] batch {b_i + 1}/{len(batches)} returned unparseable output "
                          f"on {model} \u2014 retrying with a different model/key")
                    attempts += 1
                    model_idx = idx + 1
                    continue
                elif arr:
                    collected.extend(arr)
                    print(f"[Gemini] batch {b_i + 1}/{len(batches)} -> {len(arr)} Pokemon (model={model})")
                else:
                    print(f"[Gemini] batch {b_i + 1}/{len(batches)} -> 0 Pokemon (model={model})")
                model_idx = idx + 1  # advance rotation only on a real answer
                succeeded = True
            except GeminiError as e:
                print(f"[Gemini] batch {b_i + 1}/{len(batches)} failed on {model}/{key[:8]}...: {e}")
                if e.status == 404:
                    # Permanent failure (model doesn't exist / not available to
                    # this account) \u2014 blacklist it for the rest of the run
                    # instead of burning retries on it every batch.
                    dead_models.add(model)
                    print(f"[Gemini] {model} returned 404 \u2014 removing it from "
                          f"rotation for the rest of this run")
                elif e.status == 429:
                    pair_cooldowns[(model, key)] = now + (86400 if e.daily else 60)
                attempts += 1
        if not succeeded:
            print(f"[Gemini] batch {b_i + 1}/{len(batches)} exhausted all retries \u2014 skipping")
        time.sleep(BATCH_PACE_S)

    # Merge duplicate sightings across batches (same name + CP), same rule as
    # the client: keep the first sighting, backfill any nulls from later ones.
    seen = {}
    order = []
    for item in collected:
        if not item or not item.get("name"):
            continue
        key = merge_key(item)
        if key not in seen:
            seen[key] = dict(item)
            order.append(key)
        else:
            prev = seen[key]
            for k, v in item.items():
                if prev.get(k) is None and v is not None:
                    prev[k] = v
    merged = [seen[k] for k in order]
    print(f"[Gemini] {len(collected)} raw sightings merged into {len(merged)} unique Pokemon")
    return merged


def main():
    parser = argparse.ArgumentParser(description="Extract Pokemon data from video/screenshots")
    parser.add_argument("--video", help="Path to video file")
    parser.add_argument("--appraisal", help="Path to an APPRAISAL screen recording (reads star tier + full bars only)")
    parser.add_argument("--image", help="Path to single image")
    parser.add_argument("--out", default="data/pokemon.csv", help="Output path (CSV for --image, JSON for --video)")
    parser.add_argument("--fps", type=int, default=6, help="Frames per second")
    parser.add_argument("--scene-detect", action="store_true", help="Use scene detection")
    parser.add_argument("--scene-threshold", type=float, default=0.3, help="Scene change threshold")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of CSV (--image path only)")
    args = parser.parse_args()

    if args.appraisal:
        # Appraisal recordings feed the app's "IMPORT IV FROM SERVER" step.
        # IVs are MEASURED off the bars locally (exact, free, no model), and
        # Gemini is used only for the name/CP/HP printed on the same frame.
        print(f"[Main] Processing appraisal recording: {args.appraisal}")
        with tempfile.TemporaryDirectory() as tmpdir:
            frames = extract_frames(args.appraisal, tmpdir, args.fps, args.scene_detect,
                                    args.scene_threshold, native=True)
            if not frames:
                print("[Main] No frames extracted \u2014 nothing to do.")
                sys.exit(1)
            items = run_appraisal_pipeline(frames)

        out_path = "data/appraisal_import.json"
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(items, f, indent=2)
        exact = sum(1 for it in items if it.get("atkIV") is not None)
        print(f"[Main] Wrote {len(items)} appraisal readings to {out_path} ({exact} with exact measured IVs)")
        return

    if args.video:
        # --video now uses Gemini vision OCR (server-side, quota-pooled across
        # up to 2 keys x 5 models). Output is the
        # app's video-import JSON schema, dropped straight into
        # data/pokemon_import.json for "IMPORT FROM SERVER" / paste-import to
        # pick up client-side — no dex/IV/rank math happens here by design.
        print(f"[Main] Processing video: {args.video}")
        with tempfile.TemporaryDirectory() as tmpdir:
            frames = extract_frames(args.video, tmpdir, args.fps, args.scene_detect, args.scene_threshold)
            if not frames:
                print("[Main] No frames extracted \u2014 nothing to do.")
                sys.exit(1)
            items = run_gemini_video_ocr(frames)

        out_path = args.out
        if out_path.endswith(".csv"):
            out_path = "data/pokemon_import.json"
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(items, f, indent=2)
        print(f"[Main] Wrote {len(items)} Pokemon to {out_path}")
        return

    # --image goes through the same Gemini reader as --video. It used to run
    # Tesseract + regex locally; that path was removed because its misreads
    # (stardust digits landing in CP, mangled CP badge) silently corrupted
    # records, and a wrong record is worse than no record.
    if not args.image:
        print("[Main] Error: Provide --video, --appraisal or --image")
        sys.exit(1)

    print(f"[Main] Processing image: {args.image}")
    records = run_gemini_video_ocr([args.image])
    for rec in records:
        print(f"  -> Found: {rec.get('name', '?')} CP{rec.get('cp', '?')}")
    print(f"[Main] Total unique records: {len(records)}")

    # Always JSON now: the reader emits the app's video-import schema, which the
    # legacy 61-column CSV row mapper cannot represent.
    out_path = args.out.replace(".csv", ".json") if args.out.endswith(".csv") else args.out
    if not out_path.endswith(".json"):
        out_path += ".json"
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(records, f, indent=2)
    print(f"[Main] Wrote JSON: {out_path}")


if __name__ == "__main__":
    main()
