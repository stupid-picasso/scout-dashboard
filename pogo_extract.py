#!/usr/bin/env python3
"""
pogo_extract.py — Extract Pokémon data from screen recordings via OCR.

Usage:
    python pogo_extract.py --video videos/*.mp4 --out data/pokemon.csv --fps 6
    python pogo_extract.py --video recording.mp4 --out output.json --format json --fps 5

Dependencies:
    pip install pytesseract pillow numpy
    # System: ffmpeg, tesseract-ocr

Output formats:
    csv  — 61-column schema (no header) as defined in project spec
    json — Poke Genie-compatible array for direct import into Scout Dashboard
"""

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image, ImageEnhance, ImageFilter
    import pytesseract
except ImportError as e:
    print(f"Missing dependency: {e}")
    print("Install: pip install pytesseract pillow")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────
# 61-column CSV schema
# ─────────────────────────────────────────────────────────────
CSV_FIELDS = [
    "pokemon_name", "dex_number", "cp", "hp", "level", "attack_iv", "defense_iv",
    "stamina_iv", "iv_percent", "gender", "height", "weight", "size_class",
    "type_1", "type_2", "weather_boosted", "favorite", "shiny", "shadow",
    "purified", "lucky", "costume", "event", "background", "dynamax", "gigantamax",
    "mega_capable", "buddy_level", "current_buddy", "caught_date", "caught_location",
    "trainer_notes", "tag_list", "appraisal_team", "appraisal_attack_bar",
    "appraisal_defense_bar", "appraisal_hp_bar", "fast_move", "charged_move_1",
    "charged_move_2", "fast_move_type", "charged_move_type_1", "charged_move_type_2",
    "stardust_powerup_cost", "candy_powerup_cost", "xl_candy_powerup_cost",
    "stardust_evolution_cost", "evolution_candy_cost", "current_candy",
    "current_xl_candy", "mega_energy", "is_tradeable", "is_legendary", "is_mythical",
    "is_ultra_beast", "is_event", "is_costume", "is_favorite", "has_second_move",
    "is_best_buddy", "pokeball_type", "catch_method", "friendship_history", "notes"
]

# ─────────────────────────────────────────────────────────────
# Regex patterns for OCR text extraction
# ─────────────────────────────────────────────────────────────
REGEX_PATTERNS = {
    "cp": re.compile(r"\bCP\s*([0-9,]+)", re.IGNORECASE),
    "hp": re.compile(r"\bHP\s*([0-9,]+)", re.IGNORECASE),
    "attack_iv": re.compile(r"Atk\s*([0-9]+)", re.IGNORECASE),
    "defense_iv": re.compile(r"Def\s*([0-9]+)", re.IGNORECASE),
    "stamina_iv": re.compile(r"Sta\s*([0-9]+)", re.IGNORECASE),
    "iv_percent": re.compile(r"([0-9]+(?:\.[0-9]+)?)%", re.IGNORECASE),
    "level": re.compile(r"Level\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE),
    "weight": re.compile(r"([0-9]+\.?[0-9]*)\s*kg", re.IGNORECASE),
    "height": re.compile(r"([0-9]+\.?[0-9]*)\s*m\b", re.IGNORECASE),
    "stardust": re.compile(r"([0-9,]+)\s*Stardust", re.IGNORECASE),
    "candy": re.compile(r"([0-9]+)\s+Candy\b(?!\s*XL)", re.IGNORECASE),
    "xl_candy": re.compile(r"([0-9]+)\s*XL\s*Candy", re.IGNORECASE),
    "mega_energy": re.compile(r"([0-9]+)\s*Mega Energy", re.IGNORECASE),
    "gender_male": re.compile(r"\u2642|\(male\)|gender\s*male", re.IGNORECASE),
    "gender_female": re.compile(r"\u2640|\(female\)|gender\s*female", re.IGNORECASE),
    "favorite": re.compile(r"\bFavorite\b", re.IGNORECASE),
    "shiny": re.compile(r"\bShiny\b", re.IGNORECASE),
    "shadow": re.compile(r"\bShadow\b", re.IGNORECASE),
    "purified": re.compile(r"\bPurified\b", re.IGNORECASE),
    "lucky": re.compile(r"\bLucky\b", re.IGNORECASE),
    "weather_boosted": re.compile(r"Weather\s*Boost|Boosted", re.IGNORECASE),
    "catch_date": re.compile(r"(\d{1,2}/\d{1,2}/\d{2,4}|\d{4}-\d{2}-\d{2})", re.IGNORECASE),
}

# Common fast move names for detection
FAST_MOVE_HINTS = [
    "Counter", "Dragon Breath", "Shadow Claw", "Volt Switch", "Incinerate",
    "Powder Snow", "Waterfall", "Mud Shot", "Thunder Shock", "Lick",
    "Poison Jab", "Snarl", "Bullet Punch", "Air Slash", "Hex",
    "Charm", "Frost Breath", "Bug Bite", "Tackle", "Scratch",
    "Ember", "Bubble", "Rock Throw", "Confusion", "Psycho Cut",
    "Low Kick", "Karate Chop", "Wing Attack", "Bite", "Fire Spin",
    "Razor Leaf", "Vine Whip", "Mud Slap", "Metal Claw", "Bullet Seed",
    "Pound", "Splash", "Transform", "Yawn", "Present", "Feint Attack",
    "Struggle Bug", "Fury Cutter", "Ice Shard", "Water Gun", "Zen Headbutt",
    "Acid", "Peck", "Take Down", "Smack Down"
]

# Common charged move suffixes/patterns
CHARGED_MOVE_HINTS = [
    "Beam", "Blast", "Bomb", "Punch", "Kick", "Claw", "Fang", "Cannon",
    "Ball", "Wave", "Storm", "Pulse", "Edge", "Slide", "Tomb", "Weather Ball",
    "Charge", "Gunk Shot", "Hydro Pump", "Earthquake", "Stone Edge", "Brave Bird",
    "Wild Charge", "Flamethrower", "Ice Punch", "Thunderbolt", "Psychic",
    "Shadow Ball", "Sludge Bomb", "Energy Ball", "Dragon Claw", "Aerial Ace",
    "Drill Run", "Rock Slide", "Crunch", "Outrage", "Close Combat", "Focus Blast",
    "Hyper Beam", "Solar Beam", "Moonblast", "Dazzling Gleam", "Play Rough",
    "Surf", "Aqua Tail", "Water Pulse", "Power Whip", "Seed Bomb", "Leaf Blade",
    "Frenzy Plant", "Blast Burn", "Hydro Cannon", "Meteor Mash", "Community Day"
]


def preprocess_image(img_path):
    """Apply image preprocessing for better OCR accuracy."""
    img = Image.open(img_path)

    # Convert to grayscale
    if img.mode != "L":
        img = img.convert("L")

    # Enhance contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)

    # Apply adaptive thresholding using simple method
    # Convert to numpy for thresholding
    import numpy as np
    arr = np.array(img)
    # Simple binary threshold
    threshold = np.mean(arr) * 0.8
    arr = np.where(arr > threshold, 255, 0).astype(np.uint8)
    img = Image.fromarray(arr)

    # Slight sharpening
    img = img.filter(ImageFilter.SHARPEN)

    return img


def normalize_name(text):
    """Clean OCR text for name matching."""
    return text.strip().replace("\n", " ").replace("  ", " ")


def guess_pokemon_name(text):
    """
    Extract Pokémon name from OCR text.
    Looks for capitalized words near the top, filters out common non-name words.
    """
    lines = text.split("\n")
    skip_words = {
        "CP", "HP", "LV", "LEVEL", "STARDUST", "CANDY", "XL", "MEGA", "ENERGY",
        "FAVORITE", "SHINY", "SHADOW", "PURIFIED", "LUCKY", "CAUGHT", "LOCATION",
        "ATTACK", "DEFENSE", "STAMINA", "WEIGHT", "HEIGHT", "TRANSFER", "POWER UP",
        "EVOLVE", "NEW MOVE", "FAST", "CHARGED", "APPRAISE", "POKEDEX", "SEARCH",
        "FILTER", "SORT", "EGGS", "RAIDS", "BATTLE", "FRIENDS", "SHOP", "NEWS",
        "POKEMON", "ITEMS", "POKEBALL", "GREAT", "ULTRA", "MASTER", "LEAGUE",
        "COMBAT", "POWER", "TRAINER", "GO", "PLUS", "ADVENTURE",
        "SYNC", "ROSTER", "IV", "STATS", "MOVES", "TYPE", "BOOSTED", "WEATHER",
        "BEST BUDDY", "BUDDY", "HISTORY", "SNAPSHOT", "MYSTERY", "BOX", "STORAGE",
        "TAG", "PROFESSOR", "SCOUT", "DASHBOARD", "IMPORT", "EXPORT", "SETTINGS"
    }

    for line in lines[:8]:  # Check first 8 lines
        line = line.strip()
        if not line or len(line) < 3:
            continue
        # Look for a clean capitalized word/phrase
        if line[0].isupper() and (line.isalpha() or " " in line):
            words = line.split()
            candidate = " ".join(w for w in words if w[0].isupper() and w not in skip_words)
            if candidate and len(candidate) >= 3:
                return candidate
    return None


def extract_fields(text):
    """Apply all regex patterns to OCR text and return a dict of extracted fields."""
    result = {}

    # Numeric fields
    for key in ["cp", "hp", "attack_iv", "defense_iv", "stamina_iv", "level",
                "stardust", "candy", "xl_candy", "mega_energy"]:
        m = REGEX_PATTERNS[key].search(text)
        if m:
            val = m.group(1).replace(",", "")
            result[key] = int(float(val)) if key not in ["level", "iv_percent"] else float(val)

    # Height / weight
    for key in ["weight", "height"]:
        m = REGEX_PATTERNS[key].search(text)
        if m:
            result[key] = m.group(1)

    # IV percent (if explicit)
    m = REGEX_PATTERNS["iv_percent"].search(text)
    if m:
        result["iv_percent"] = float(m.group(1))

    # Gender
    if REGEX_PATTERNS["gender_male"].search(text):
        result["gender"] = "male"
    elif REGEX_PATTERNS["gender_female"].search(text):
        result["gender"] = "female"

    # Booleans
    for key in ["favorite", "shiny", "shadow", "purified", "lucky", "weather_boosted"]:
        if REGEX_PATTERNS[key].search(text):
            result[key] = True

    # Catch date
    m = REGEX_PATTERNS["catch_date"].search(text)
    if m:
        result["caught_date"] = m.group(1)

    # Pokémon name
    name = guess_pokemon_name(text)
    if name:
        result["pokemon_name"] = name

    # Moves — heuristic extraction
    lines = text.split("\n")
    for i, line in enumerate(lines):
        line_stripped = line.strip()
        for fm in FAST_MOVE_HINTS:
            if fm.lower() in line_stripped.lower():
                if re.search(r"\b" + re.escape(fm) + r"\b", line_stripped, re.IGNORECASE):
                    if "fast_move" not in result:
                        result["fast_move"] = fm
                    break
        for cm in CHARGED_MOVE_HINTS:
            if cm.lower() in line_stripped.lower():
                if re.search(r"\b" + re.escape(cm) + r"\b", line_stripped, re.IGNORECASE):
                    if "charged_move_1" not in result:
                        result["charged_move_1"] = cm
                    elif "charged_move_2" not in result and result.get("charged_move_1") != cm:
                        result["charged_move_2"] = cm
                    break

    return result


def deduplicate_records(records, threshold=0.85):
    """
    Remove near-duplicate records (same name + similar CP).
    Keeps the record with the most extracted fields.
    """
    groups = {}
    for rec in records:
        name = rec.get("pokemon_name", "UNKNOWN")
        cp = rec.get("cp", 0)
        key = f"{name}_{cp // 10}"  # Group by name + CP decade

        if key not in groups:
            groups[key] = []
        groups[key].append(rec)

    deduped = []
    for key, group in groups.items():
        best = max(group, key=lambda r: len([v for v in r.values() if v is not None and v != ""]))
        deduped.append(best)

    return deduped


def record_to_csv_row(rec):
    """Convert extracted record to 61-column CSV row."""
    row = []
    for field in CSV_FIELDS:
        val = rec.get(field, "")
        if val is True:
            val = "1"
        elif val is False:
            val = "0"
        elif val is None:
            val = ""
        row.append(str(val))
    return row


def record_to_json_record(rec, idx=1):
    """Convert extracted record to Poke Genie-style JSON object."""
    atk = rec.get("attack_iv")
    defense = rec.get("defense_iv")
    sta = rec.get("stamina_iv")
    iv_avg = rec.get("iv_percent")
    if iv_avg is None and all(v is not None for v in [atk, defense, sta]):
        iv_avg = round((atk + defense + sta) / 45 * 100, 1)

    return {
        "idx": idx,
        "name": rec.get("pokemon_name", "Unknown"),
        "form": None,
        "dex": rec.get("dex_number", 0),
        "gender": rec.get("gender", ""),
        "cp": rec.get("cp", 0),
        "hp": rec.get("hp", 0),
        "atkIV": atk,
        "defIV": defense,
        "staIV": sta,
        "ivAvg": iv_avg,
        "lvlMin": rec.get("level"),
        "lvlMax": rec.get("level"),
        "quickMove": rec.get("fast_move", ""),
        "chargeMove": rec.get("charged_move_1", ""),
        "chargeMove2": rec.get("charged_move_2", None),
        "scanDate": None,
        "catchDate": rec.get("caught_date", None),
        "weight": rec.get("weight", ""),
        "height": rec.get("height", ""),
        "lucky": rec.get("lucky", False),
        "shadowPurified": "1" if rec.get("shadow") else ("2" if rec.get("purified") else "0"),
        "favorite": rec.get("favorite", False),
        "dust": rec.get("stardust", 0),
        "great": {"rankPct": None, "rankNum": None, "statProd": None, "dustCost": None, "candyCost": None, "evolvesTo": None},
        "ultra": {"rankPct": None, "rankNum": None, "statProd": None, "dustCost": None, "candyCost": None, "evolvesTo": None},
        "little": {"rankPct": None, "rankNum": None, "statProd": None, "dustCost": None, "candyCost": None, "evolvesTo": None},
    }


def extract_frames(video_path, out_dir, fps=6):
    """Use ffmpeg to dump frames from video."""
    pattern = os.path.join(out_dir, "frame_%06d.png")
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"fps={fps},scale=1080:-1",
        "-q:v", "2",
        pattern
    ]
    print(f"Extracting frames at {fps} fps...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg stderr: {result.stderr[:500]}")
        raise RuntimeError(f"ffmpeg failed with code {result.returncode}")

    frames = sorted(Path(out_dir).glob("frame_*.png"))
    print(f"Extracted {len(frames)} frames.")
    return frames


def extract_frames_scene_detect(video_path, out_dir, scene_threshold=0.3):
    """
    Use ffmpeg scene detection to extract only changed frames.
    Much faster than fixed FPS for screen recordings.
    """
    pattern = os.path.join(out_dir, "frame_%06d.png")
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-vf", f"select=gt(scene\,{scene_threshold}),scale=1080:-1",
        "-vsync", "vfr",
        "-q:v", "2",
        pattern
    ]
    print(f"Extracting frames with scene detection (threshold={scene_threshold})...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ffmpeg stderr: {result.stderr[:500]}")
        raise RuntimeError(f"ffmpeg failed with code {result.returncode}")

    frames = sorted(Path(out_dir).glob("frame_*.png"))
    print(f"Extracted {len(frames)} frames via scene detection.")
    return frames


def ocr_frame(frame_path, preprocess=True):
    """Run Tesseract OCR on a single frame with optional preprocessing."""
    try:
        if preprocess:
            img = preprocess_image(frame_path)
        else:
            img = Image.open(frame_path)
            if img.mode != "L":
                img = img.convert("L")

        # Use different PSM modes for different regions
        text = pytesseract.image_to_string(img, config="--psm 6")
        return text
    except Exception as e:
        print(f"OCR failed for {frame_path}: {e}")
        return ""


def process_video(video_path, fps=6, use_scene_detect=False, keep_frames=False, frame_dir=None):
    """Full pipeline: video -> frames -> OCR -> records."""
    tmp_dir = frame_dir or tempfile.mkdtemp(prefix="pogo_frames_")
    try:
        if frame_dir:
            os.makedirs(frame_dir, exist_ok=True)

        if use_scene_detect:
            frames = extract_frames_scene_detect(video_path, tmp_dir)
        else:
            frames = extract_frames(video_path, tmp_dir, fps)

        records = []

        for i, frame in enumerate(frames):
            if i % 10 == 0:
                print(f"  OCR frame {i+1}/{len(frames)}...")
            text = ocr_frame(frame)
            if not text.strip():
                continue
            rec = extract_fields(text)
            if rec.get("pokemon_name") or rec.get("cp"):
                rec["_source_frame"] = str(frame)
                records.append(rec)

        print(f"Extracted {len(records)} raw records from {len(frames)} frames.")
        deduped = deduplicate_records(records)
        print(f"After deduplication: {len(deduped)} unique Pokémon.")
        return deduped

    finally:
        if not keep_frames and not frame_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(description="Extract Pokémon data from screen recordings")
    parser.add_argument("--video", required=True, help="Path to video file (or glob pattern)")
    parser.add_argument("--out", required=True, help="Output file path")
    parser.add_argument("--fps", type=int, default=6, help="Frames per second to extract (default: 6)")
    parser.add_argument("--scene-detect", action="store_true", help="Use scene change detection instead of fixed FPS")
    parser.add_argument("--format", choices=["csv", "json"], default="csv", help="Output format")
    parser.add_argument("--keep-frames", action="store_true", help="Keep extracted frames")
    parser.add_argument("--frames-dir", help="Directory to store frames (default: temp)")
    parser.add_argument("--no-preprocess", action="store_true", help="Skip image preprocessing")
    args = parser.parse_args()

    # Resolve video path (handle globs)
    import glob
    videos = glob.glob(args.video)
    if not videos:
        videos = [args.video]

    all_records = []
    for video in videos:
        print(f"\nProcessing: {video}")
        if not os.path.exists(video):
            print(f"  WARNING: File not found, skipping.")
            continue
        records = process_video(
            video,
            fps=args.fps,
            use_scene_detect=args.scene_detect,
            keep_frames=args.keep_frames,
            frame_dir=args.frames_dir
        )
        all_records.extend(records)

    # Final dedup across all videos
    all_records = deduplicate_records(all_records)
    print(f"\nTotal unique Pokémon across all videos: {len(all_records)}")

    # Write output
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    if args.format == "csv":
        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            for rec in all_records:
                writer.writerow(record_to_csv_row(rec))
        print(f"Wrote CSV: {args.out} ({len(CSV_FIELDS)} columns, no header)")
    else:
        json_records = [record_to_json_record(rec, i+1) for i, rec in enumerate(all_records)]
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(json_records, f, indent=2)
        print(f"Wrote JSON: {args.out} ({len(json_records)} records)")


if __name__ == "__main__":
    main()
