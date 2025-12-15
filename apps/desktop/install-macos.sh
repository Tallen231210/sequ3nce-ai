#!/bin/bash

# Sequ3nce Desktop Installer for macOS
# This script downloads and installs Sequ3nce without triggering Gatekeeper issues
# by using curl (which doesn't add quarantine flags) and ad-hoc signing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
GITHUB_REPO="Tallen231210/sequ3nce-ai"
RELEASE_TAG="desktop-v1.0.4"  # UPDATE THIS for each release
DMG_NAME="Sequ3nce.dmg"
APP_NAME="Sequ3nce.app"
INSTALL_DIR="/Applications"

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Sequ3nce Desktop Installer          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}Error: This installer is for macOS only.${NC}"
    exit 1
fi

# Check for curl
if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed.${NC}"
    exit 1
fi

# Create temp directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo -e "${YELLOW}Step 1/5:${NC} Downloading Sequ3nce..."

# Construct download URL
# Try to get the latest release DMG URL
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${RELEASE_TAG}/${DMG_NAME}"

# Download with curl (no quarantine flag!)
if ! curl -L -f -# -o "$TEMP_DIR/$DMG_NAME" "$DOWNLOAD_URL"; then
    echo -e "${RED}Error: Failed to download. Please check your internet connection.${NC}"
    echo -e "${RED}URL: $DOWNLOAD_URL${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Download complete${NC}"
echo ""

echo -e "${YELLOW}Step 2/5:${NC} Mounting disk image..."

# Mount the DMG
MOUNT_POINT=$(hdiutil attach "$TEMP_DIR/$DMG_NAME" -nobrowse -quiet | grep -E '^\s*/Volumes/' | sed 's/.*\(\/Volumes\/.*\)/\1/' | head -1)

if [ -z "$MOUNT_POINT" ]; then
    # Try alternative parsing
    MOUNT_POINT="/Volumes/Sequ3nce"
    if [ ! -d "$MOUNT_POINT" ]; then
        echo -e "${RED}Error: Failed to mount disk image.${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Mounted at $MOUNT_POINT${NC}"
echo ""

echo -e "${YELLOW}Step 3/5:${NC} Installing to Applications..."

# Remove old version if exists
if [ -d "$INSTALL_DIR/$APP_NAME" ]; then
    echo "  Removing previous version..."
    rm -rf "$INSTALL_DIR/$APP_NAME"
fi

# Copy to Applications
cp -R "$MOUNT_POINT/$APP_NAME" "$INSTALL_DIR/"

echo -e "${GREEN}✓ Installed to $INSTALL_DIR${NC}"
echo ""

echo -e "${YELLOW}Step 4/5:${NC} Signing application (ad-hoc)..."

# Ad-hoc sign the app - this is required for Apple Silicon
codesign --force --deep --sign - "$INSTALL_DIR/$APP_NAME" 2>/dev/null || {
    echo -e "${YELLOW}  Warning: Ad-hoc signing failed, but app may still work.${NC}"
}

# Also remove any quarantine flags just in case
xattr -cr "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true

echo -e "${GREEN}✓ Application signed${NC}"
echo ""

echo -e "${YELLOW}Step 5/5:${NC} Cleaning up..."

# Unmount DMG
hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Installation Complete!             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "Sequ3nce has been installed to ${BLUE}/Applications/Sequ3nce.app${NC}"
echo ""

# Ask to launch
read -p "Would you like to open Sequ3nce now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Launching Sequ3nce..."
    open "$INSTALL_DIR/$APP_NAME"
fi

echo ""
echo -e "${BLUE}Thank you for using Sequ3nce!${NC}"
echo ""
