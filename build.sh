#!/bin/bash
# Build the Ancroo browser extension.
# Usage: ./build.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Ensure pnpm is available
if ! command -v pnpm &>/dev/null; then
    echo "Installing pnpm..."
    sudo corepack enable 2>/dev/null || corepack enable
fi

echo "Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "Building extension..."
pnpm build

echo ""
echo "Extension built: $SCRIPT_DIR/dist/"
echo ""
echo "To install in Chrome:"
echo "  1. Open chrome://extensions"
echo "  2. Enable 'Developer mode'"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: $SCRIPT_DIR/dist/"
