#!/bin/bash

# Run Neotoma MVP Prototype
# This script starts the interactive prototype with static fixtures

set -e

echo "🎨 Starting Neotoma MVP Interactive Prototype..."
echo ""
echo "This prototype demonstrates:"
echo "  ✓ 15 sample records across 10 document types"
echo "  ✓ 26 timeline events"
echo "  ✓ 17 extracted entities"
echo "  ✓ Full UI components and workflows"
echo ""
echo "Opening on http://localhost:5174"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

cd \"$(dirname \"$0\")/..\"

# Run vite dev server with prototype config
npx vite --config vite.prototype.config.ts


