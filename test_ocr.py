#!/usr/bin/env python3
"""Test OCR regex patterns without needing ffmpeg/tesseract installed."""

import re
import sys

# Copy of regex from pogo_extract.py for testing
REGEX_PATTERNS = {
    "cp": re.compile(r"\bCP\s*([0-9,]+)", re.IGNORECASE),
    "hp": re.compile(r"\bHP\s*([0-9,]+)", re.IGNORECASE),
    "attack_iv": re.compile(r"Atk\s*([0-9]+)", re.IGNORECASE),
    "defense_iv": re.compile(r"Def\s*([0-9]+)", re.IGNORECASE),
    "stamina_iv": re.compile(r"Sta\s*([0-9]+)", re.IGNORECASE),
    "iv_percent": re.compile(r"([0-9]+(?:\.[0-9]+)?)%", re.IGNORECASE),
    "level": re.compile(r"Level\s*([0-9]+(?:\.[0-9]+)?)", re.IGNORECASE),
    "stardust": re.compile(r"([0-9,]+)\s*Stardust", re.IGNORECASE),
    "candy": re.compile(r"([0-9]+)\s+Candy(?!\s*XL)", re.IGNORECASE),
    "xl_candy": re.compile(r"([0-9]+)\s*XL\s*Candy", re.IGNORECASE),
    "shadow": re.compile(r"Shadow", re.IGNORECASE),
    "purified": re.compile(r"Purified", re.IGNORECASE),
    "lucky": re.compile(r"Lucky", re.IGNORECASE),
    "shiny": re.compile(r"Shiny", re.IGNORECASE),
}

TEST_CASES = [
    ("CP 3189 HP 182 Atk 14 Def 15 Sta 12", {"cp": 3189, "hp": 182, "attack_iv": 14, "defense_iv": 15, "stamina_iv": 12}),
    ("Eevee CP 108 HP 65", {"cp": 108, "hp": 65}),
    ("Garchomp CP 3189", {"cp": 3189}),
    ("Level 35.5", {"level": 35.5}),
    ("89% IV", {"iv_percent": 89}),
    ("15,000 Stardust", {"stardust": 15000}),
    ("25 Candy", {"candy": 25}),
    ("3 XL Candy", {"xl_candy": 3}),
    ("Shadow Pokemon", {"shadow": True}),
    ("Lucky Trade", {"lucky": True}),
]

def run_tests():
    passed = 0
    failed = 0
    for text, expected in TEST_CASES:
        print(f"\nTest: '{text}'")
        for field, expected_val in expected.items():
            pattern = REGEX_PATTERNS[field]
            match = pattern.search(text)
            if match:
                actual = match.group(1).replace(",", "")
                if field in ["cp", "hp", "attack_iv", "defense_iv", "stamina_iv", "stardust", "candy", "xl_candy"]:
                    actual = int(actual)
                elif field == "iv_percent":
                    actual = float(actual)
                elif field == "level":
                    actual = float(actual)
                elif field in ["shadow", "purified", "lucky", "shiny"]:
                    actual = True
            else:
                actual = None

            if actual == expected_val:
                print(f"  ✓ {field}: {actual}")
                passed += 1
            else:
                print(f"  ✗ {field}: expected {expected_val}, got {actual}")
                failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    return failed == 0

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        success = run_tests()
        sys.exit(0 if success else 1)
    else:
        print("Usage: python test_ocr.py --all")
        print("Running quick sanity check...")
        text = "Garchomp CP 3189 HP 182 Atk 14 Def 15 Sta 12"
        print(f"\nInput: {text}")
        for name, pat in REGEX_PATTERNS.items():
            m = pat.search(text)
            if m:
                print(f"  {name}: {m.group(1)}")
