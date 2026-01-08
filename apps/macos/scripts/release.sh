#!/bin/bash
# Sequ3nce macOS Release Script
# Usage: ./release.sh [version]
# Example: ./release.sh 1.0.0
#
# This script:
# 1. Updates the version in Info.plist
# 2. Increments the build number
# 3. Builds, signs, and notarizes the app
# 4. Signs the ZIP for Sparkle updates
# 5. Outputs instructions for uploading to GitHub

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../Sequ3nce"
INFO_PLIST="$PROJECT_DIR/Sequ3nce/Info.plist"
BUILD_DIR="$SCRIPT_DIR/../build"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo_step() {
    echo -e "${GREEN}==>${NC} $1"
}

echo_info() {
    echo -e "${CYAN}Info:${NC} $1"
}

# Get current version
CURRENT_VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST")
CURRENT_BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST")

# Parse arguments
VERSION="${1:-$CURRENT_VERSION}"

echo ""
echo "=========================================="
echo " Sequ3nce macOS Release"
echo "=========================================="
echo ""
echo "  Current: v$CURRENT_VERSION (build $CURRENT_BUILD)"
echo "  New:     v$VERSION"
echo ""

# If version changed, update it
if [ "$VERSION" != "$CURRENT_VERSION" ]; then
    echo_step "Updating version to $VERSION..."
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$INFO_PLIST"
fi

# Always increment build number
NEW_BUILD=$((CURRENT_BUILD + 1))
echo_step "Incrementing build number to $NEW_BUILD..."
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $NEW_BUILD" "$INFO_PLIST"

echo ""
echo_info "Version updated: v$VERSION (build $NEW_BUILD)"
echo ""

# Run the build script
echo_step "Starting build process..."
echo ""
"$SCRIPT_DIR/build-release.sh"

# Check if Sparkle tools are available for signing
SPARKLE_SIGN="$SCRIPT_DIR/Sparkle-2.6.4/bin/sign_update"
if [ -f "$SPARKLE_SIGN" ] && [ -n "$SPARKLE_PRIVATE_KEY" ]; then
    echo_step "Signing ZIP for Sparkle updates..."
    ZIP_PATH="$BUILD_DIR/Sequ3nce.zip"
    SIGNATURE=$("$SPARKLE_SIGN" "$ZIP_PATH" -s "$SPARKLE_PRIVATE_KEY")
    ZIP_SIZE=$(stat -f%z "$ZIP_PATH")

    echo ""
    echo "=========================================="
    echo " Sparkle Update Signature"
    echo "=========================================="
    echo ""
    echo "Add this to appcast.xml:"
    echo ""
    echo "<item>"
    echo "    <title>Version $VERSION</title>"
    echo "    <sparkle:version>$NEW_BUILD</sparkle:version>"
    echo "    <sparkle:shortVersionString>$VERSION</sparkle:shortVersionString>"
    echo "    <enclosure"
    echo "        url=\"https://github.com/Tallen231210/sequ3nce-ai/releases/download/macos-v$VERSION/Sequ3nce.zip\""
    echo "        length=\"$ZIP_SIZE\""
    echo "        type=\"application/octet-stream\""
    echo "        sparkle:edSignature=\"$SIGNATURE\""
    echo "    />"
    echo "</item>"
    echo ""
else
    echo ""
    echo_info "Sparkle signing skipped (tools not found or SPARKLE_PRIVATE_KEY not set)"
    echo_info "To enable Sparkle signing:"
    echo "  1. Download Sparkle tools: curl -L https://github.com/sparkle-project/Sparkle/releases/download/2.6.4/Sparkle-2.6.4.tar.xz | tar xJ -C $SCRIPT_DIR"
    echo "  2. Generate keys: $SCRIPT_DIR/Sparkle-2.6.4/bin/generate_keys"
    echo "  3. Set environment variable: export SPARKLE_PRIVATE_KEY=\"your-private-key\""
    echo ""
fi

echo ""
echo "=========================================="
echo " Release Ready!"
echo "=========================================="
echo ""
echo "To publish this release:"
echo ""
echo "  gh release create macos-v$VERSION \\"
echo "      --title \"Sequ3nce macOS v$VERSION\" \\"
echo "      --notes \"Native macOS release. Requires macOS 14.4+\" \\"
echo "      \"$BUILD_DIR/Sequ3nce-macOS.dmg\" \\"
echo "      \"$BUILD_DIR/Sequ3nce.zip\""
echo ""
