#!/bin/bash
# Build, sign, notarize, and package Sequ3nce for macOS
# Outputs: Sequ3nce-macOS.dmg (for distribution) and Sequ3nce.zip (for Sparkle updates)

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/../Sequ3nce"
XCODE_PROJECT="$PROJECT_DIR/Sequ3nce.xcodeproj"
SCHEME="Sequ3nce"
BUILD_DIR="$SCRIPT_DIR/../build"
ARCHIVE_PATH="$BUILD_DIR/Sequ3nce.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
APP_NAME="Sequ3nce.app"
DMG_NAME="Sequ3nce-macOS.dmg"
ZIP_NAME="Sequ3nce.zip"
KEYCHAIN_PROFILE="${KEYCHAIN_PROFILE:-sequ3nce-notarize}"
EXPORT_OPTIONS="$SCRIPT_DIR/ExportOptions.plist"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_step() {
    echo -e "${GREEN}==>${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

echo_error() {
    echo -e "${RED}Error:${NC} $1"
}

# Get version from Info.plist
INFO_PLIST="$PROJECT_DIR/Sequ3nce/Info.plist"
VERSION=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INFO_PLIST")
BUILD=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$INFO_PLIST")

echo ""
echo "=========================================="
echo " Sequ3nce macOS Release Build"
echo " Version: $VERSION (Build $BUILD)"
echo "=========================================="
echo ""

# Clean build directory
echo_step "Cleaning build directory..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$EXPORT_PATH"

# Step 1: Archive
echo_step "Archiving project..."
xcodebuild archive \
    -project "$XCODE_PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -archivePath "$ARCHIVE_PATH" \
    -quiet

if [ ! -d "$ARCHIVE_PATH" ]; then
    echo_error "Archive failed - no xcarchive created"
    exit 1
fi

echo "  Archive created at: $ARCHIVE_PATH"

# Step 2: Export (sign the app)
echo_step "Exporting and signing app..."
xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -quiet

APP_PATH="$EXPORT_PATH/$APP_NAME"
if [ ! -d "$APP_PATH" ]; then
    echo_error "Export failed - no .app created"
    exit 1
fi

echo "  Signed app at: $APP_PATH"

# Step 3: Verify code signature
echo_step "Verifying code signature..."
codesign --verify --deep --strict "$APP_PATH"
echo "  Signature verified"

# Step 4: Create ZIP for notarization
echo_step "Creating ZIP for notarization..."
ZIP_PATH="$BUILD_DIR/$ZIP_NAME"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"
echo "  ZIP created: $ZIP_PATH"

# Step 5: Notarize
echo_step "Submitting for notarization (this may take a few minutes)..."
xcrun notarytool submit "$ZIP_PATH" \
    --keychain-profile "$KEYCHAIN_PROFILE" \
    --wait

echo "  Notarization complete"

# Step 6: Staple notarization ticket to app
echo_step "Stapling notarization ticket to app..."
xcrun stapler staple "$APP_PATH"
echo "  Stapled successfully"

# Step 7: Check if create-dmg is installed
if ! command -v create-dmg &> /dev/null; then
    echo_warning "create-dmg not found. Install with: brew install create-dmg"
    echo "  Skipping DMG creation. You can create it manually or install create-dmg."

    # Just re-create the ZIP with the stapled app
    echo_step "Re-creating ZIP with stapled app..."
    rm "$ZIP_PATH"
    ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

    echo ""
    echo "=========================================="
    echo " Build Complete (no DMG)"
    echo "=========================================="
    echo ""
    echo "  ZIP: $ZIP_PATH"
    echo "  Version: $VERSION (Build $BUILD)"
    echo ""
    exit 0
fi

# Step 8: Create DMG
echo_step "Creating DMG..."
DMG_PATH="$BUILD_DIR/$DMG_NAME"

# Get the icon path for the DMG volume icon
ICON_PATH="$PROJECT_DIR/Sequ3nce/Assets.xcassets/AppIcon.appiconset/icon_512x512.png"

create-dmg \
    --volname "Sequ3nce" \
    --volicon "$ICON_PATH" \
    --window-pos 200 120 \
    --window-size 660 400 \
    --icon-size 160 \
    --icon "$APP_NAME" 180 170 \
    --hide-extension "$APP_NAME" \
    --app-drop-link 480 170 \
    --no-internet-enable \
    "$DMG_PATH" \
    "$APP_PATH"

if [ ! -f "$DMG_PATH" ]; then
    echo_error "DMG creation failed"
    exit 1
fi

echo "  DMG created: $DMG_PATH"

# Step 9: Notarize DMG
echo_step "Notarizing DMG..."
xcrun notarytool submit "$DMG_PATH" \
    --keychain-profile "$KEYCHAIN_PROFILE" \
    --wait

# Step 10: Staple DMG
echo_step "Stapling notarization ticket to DMG..."
xcrun stapler staple "$DMG_PATH"
echo "  Stapled successfully"

# Step 11: Re-create ZIP with stapled app (for Sparkle updates)
echo_step "Re-creating ZIP with stapled app (for Sparkle updates)..."
rm "$ZIP_PATH"
ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

# Get file sizes
DMG_SIZE=$(ls -lh "$DMG_PATH" | awk '{print $5}')
ZIP_SIZE=$(ls -lh "$ZIP_PATH" | awk '{print $5}')

echo ""
echo "=========================================="
echo " Build Complete!"
echo "=========================================="
echo ""
echo "  DMG: $DMG_PATH ($DMG_SIZE)"
echo "  ZIP: $ZIP_PATH ($ZIP_SIZE)"
echo "  Version: $VERSION (Build $BUILD)"
echo ""
echo "Next steps:"
echo "  1. Test the DMG by opening it and running the app"
echo "  2. Upload to GitHub Releases:"
echo "     gh release create macos-v$VERSION \\"
echo "         --title \"Sequ3nce macOS v$VERSION\" \\"
echo "         --notes \"Native macOS release. Requires macOS 14.4+\" \\"
echo "         \"$DMG_PATH\" \\"
echo "         \"$ZIP_PATH\""
echo ""
