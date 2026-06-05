#!/bin/bash
cd "$(dirname "$0")"
echo "=== Installing dependencies ==="
npm install
echo ""
echo "=== Building ==="
npm run build
echo ""
echo "=== Done ==="
echo "Press any key to close..."
read
