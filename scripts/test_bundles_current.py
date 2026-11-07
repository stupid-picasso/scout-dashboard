#!/usr/bin/env python3
"""The deployed bundles must be exactly what build_bundles.py generates from Scout Dashboard.dc.html."""
import os, subprocess, sys
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
r = subprocess.run([sys.executable, os.path.join(REPO, 'scripts', 'build_bundles.py'), '--check'], capture_output=True, text=True)
print((r.stdout + r.stderr).strip())
if r.returncode:
    print('FAILED: run  python3 scripts/build_bundles.py  and commit the result')
    sys.exit(1)
print('0 failed')
