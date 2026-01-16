#!/bin/bash
# Upload latest-mac.yml to GitHub release for auto-updater
# This script is run automatically after `npm run publish`

set -e

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
ZIP_FILE="out/make/zip/darwin/arm64/Sequ3nce-darwin-arm64-${VERSION}.zip"

echo "Generating latest-mac.yml for v${VERSION}..."

# Check if zip exists
if [ ! -f "$ZIP_FILE" ]; then
    echo "Error: ZIP file not found: $ZIP_FILE"
    exit 1
fi

# Generate SHA512 hash (base64 encoded)
SHA512_BASE64=$(shasum -a 512 "$ZIP_FILE" | awk '{print $1}' | xxd -r -p | base64)
SIZE=$(stat -f%z "$ZIP_FILE")
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Create the yml file
cat > /tmp/latest-mac.yml << EOF
version: ${VERSION}
files:
  - url: Sequ3nce-darwin-arm64-${VERSION}.zip
    sha512: ${SHA512_BASE64}
    size: ${SIZE}
path: Sequ3nce-darwin-arm64-${VERSION}.zip
sha512: ${SHA512_BASE64}
releaseDate: '${RELEASE_DATE}'
EOF

echo "Generated /tmp/latest-mac.yml:"
cat /tmp/latest-mac.yml

# Upload to GitHub release
echo ""
echo "Uploading to GitHub release v${VERSION}..."
gh release upload "v${VERSION}" /tmp/latest-mac.yml --repo Tallen231210/sequ3nce-ai --clobber

# Publish the release (remove draft status)
echo "Publishing release v${VERSION}..."
gh release edit "v${VERSION}" --repo Tallen231210/sequ3nce-ai --draft=false

echo ""
echo "✅ Auto-update manifest uploaded and release published!"
echo "   Users will now receive v${VERSION} via auto-update."
