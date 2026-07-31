#!/bin/bash
# setup.sh — Initialize a fresh Scout Dashboard repo
# Run this after creating the new repo and copying files

echo "Setting up Scout Dashboard..."

# Create directories
mkdir -p src icons data videos .github/workflows

# Verify structure
echo ""
echo "Repo structure:"
find . -maxdepth 3 -not -path '*/\.*' -not -path '*/node_modules/*' | sort

echo ""
echo "Next steps:"
echo "1. Copy these files from your OLD repo into src/:"
echo "   - Scout Dashboard.dc.html"
echo "   - IV CP HP Guide.dc.html"
echo "   - Scout PWA Simulator.dc.html"
echo "   - support.js"
echo "   - ios-frame.jsx"
echo "   - pokemon-mechanics.js"
echo ""
echo "2. Copy icons/apple-touch-icon.png into icons/"
echo "   (Rename to icon-192.png and create icon-512.png, icon-maskable.png)"
echo ""
echo "3. Build index.html from Scout Dashboard.dc.html using your DC tooling"
echo ""
echo "4. Rotate your Firebase API key (it was exposed in the old repo)"
echo ""
echo "5. git add . && git commit -m 'Initial clean setup' && git push"
