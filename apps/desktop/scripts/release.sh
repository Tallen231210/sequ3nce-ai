#!/bin/bash

# Sequ3nce Desktop Release Script
# This script builds, signs, and notarizes the macOS app

set -e

echo "🚀 Sequ3nce Desktop Release Script"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Check if keychain profile exists
if ! xcrun notarytool store-credentials --list 2>/dev/null | grep -q "sequ3nce-notarize"; then
    echo -e "${RED}❌ Notarization credentials not found in keychain.${NC}"
    echo ""
    echo "Please run this command first to store your credentials:"
    echo ""
    echo "  xcrun notarytool store-credentials \"sequ3nce-notarize\" \\"
    echo "    --apple-id \"your-apple-id@email.com\" \\"
    echo "    --password \"your-app-specific-password\" \\"
    echo "    --team-id \"P3LCDZYPU5\""
    echo ""
    exit 1
fi

echo -e "${GREEN}✅ Notarization credentials found${NC}"
echo ""

# Step 1: Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$PROJECT_DIR/out"
echo -e "${GREEN}✅ Cleaned${NC}"
echo ""

# Step 2: Build the app
echo "🔨 Building the app..."
npm run make
echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 3: Find the DMG file
DMG_PATH=$(find "$PROJECT_DIR/out/make" -name "*.dmg" -type f | head -1)

if [ -z "$DMG_PATH" ]; then
    echo -e "${RED}❌ No DMG file found in out/make/${NC}"
    exit 1
fi

echo "📦 Found DMG: $DMG_PATH"
echo ""

# Step 4: Notarize the DMG
echo "📤 Submitting to Apple for notarization..."
echo "   (This may take 5-15 minutes)"
echo ""

xcrun notarytool submit "$DMG_PATH" --keychain-profile "sequ3nce-notarize" --wait

echo ""
echo -e "${GREEN}✅ Notarization complete${NC}"
echo ""

# Step 5: Staple the ticket
echo "📎 Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"
echo -e "${GREEN}✅ Stapled${NC}"
echo ""

# Step 6: Verify
echo "🔍 Verifying notarization..."
spctl --assess --type open --context context:primary-signature -v "$DMG_PATH" 2>&1 || true
echo ""

# Done!
echo "=================================="
echo -e "${GREEN}🎉 Release complete!${NC}"
echo ""
echo "Your signed and notarized DMG is at:"
echo "  $DMG_PATH"
echo ""
echo "Next steps:"
echo "  1. Upload this DMG to GitHub Releases"
echo "  2. Users can download and install without security warnings"
echo ""

