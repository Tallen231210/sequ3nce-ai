#!/bin/bash
# Generate macOS app icons from the existing Electron app icon
# Source: apps/desktop/assets/icon.png (512x512)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
SOURCE="$PROJECT_ROOT/apps/desktop/assets/icon.png"
OUTPUT_DIR="$PROJECT_ROOT/apps/macos/Sequ3nce/Sequ3nce/Assets.xcassets/AppIcon.appiconset"

# Verify source exists
if [ ! -f "$SOURCE" ]; then
    echo "Error: Source icon not found at $SOURCE"
    exit 1
fi

# Create output directory if needed
mkdir -p "$OUTPUT_DIR"

echo "Generating icons from: $SOURCE"
echo "Output directory: $OUTPUT_DIR"

# Generate all required sizes
sips -z 16 16     "$SOURCE" --out "$OUTPUT_DIR/icon_16x16.png" 2>/dev/null
sips -z 32 32     "$SOURCE" --out "$OUTPUT_DIR/icon_16x16@2x.png" 2>/dev/null
sips -z 32 32     "$SOURCE" --out "$OUTPUT_DIR/icon_32x32.png" 2>/dev/null
sips -z 64 64     "$SOURCE" --out "$OUTPUT_DIR/icon_32x32@2x.png" 2>/dev/null
sips -z 128 128   "$SOURCE" --out "$OUTPUT_DIR/icon_128x128.png" 2>/dev/null
sips -z 256 256   "$SOURCE" --out "$OUTPUT_DIR/icon_128x128@2x.png" 2>/dev/null
sips -z 256 256   "$SOURCE" --out "$OUTPUT_DIR/icon_256x256.png" 2>/dev/null
sips -z 512 512   "$SOURCE" --out "$OUTPUT_DIR/icon_256x256@2x.png" 2>/dev/null
sips -z 512 512   "$SOURCE" --out "$OUTPUT_DIR/icon_512x512.png" 2>/dev/null
# For 512@2x, use the original 512x512 (best available quality)
cp "$SOURCE" "$OUTPUT_DIR/icon_512x512@2x.png"

echo ""
echo "Generated icons:"
ls -la "$OUTPUT_DIR"/*.png

echo ""
echo "Done! Open Xcode and rebuild to see the new icon."
