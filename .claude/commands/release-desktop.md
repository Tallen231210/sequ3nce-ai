# Release Desktop App to Production

This command releases a new version of the Sequ3nce Electron desktop app.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are committed and pushed
- [ ] You're in the sequ3nce-ai repository

## Steps to Release

### Step 1: Bump the Version

Edit `apps/desktop/package.json` and increment the version number:
- Current format: `"version": "X.Y.Z"`
- Increment Z for patches, Y for minor features, X for major changes

Commit and push the version bump.

### Step 2: Build and Upload to GitHub

Run this command from the desktop directory:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/desktop && GITHUB_TOKEN=$(gh auth token) npm run publish
```

This command:
1. Gets the GitHub token from `gh` CLI (stored in keyring)
2. Builds the Electron app
3. Signs and notarizes with Apple (automatic, may take 1-2 minutes)
4. Creates DMG and ZIP distributables
5. Uploads to GitHub releases (as a draft)

### Step 3: Generate and Upload latest-mac.yml

The auto-updater needs a `latest-mac.yml` file. Generate it with these commands:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/desktop

# Get the version from package.json
VERSION=$(node -p "require('./package.json').version")

# Get the ZIP file path
ZIP_FILE="out/make/zip/darwin/arm64/Sequ3nce-darwin-arm64-${VERSION}.zip"

# Generate SHA512 hash (base64 encoded)
SHA512=$(cat "$ZIP_FILE" | shasum -a 512 | cut -d ' ' -f1 | xxd -r -p | base64)

# Get file size
SIZE=$(stat -f%z "$ZIP_FILE")

# Create latest-mac.yml
cat > out/make/zip/darwin/arm64/latest-mac.yml << EOF
version: ${VERSION}
files:
  - url: Sequ3nce-darwin-arm64-${VERSION}.zip
    sha512: ${SHA512}
    size: ${SIZE}
path: Sequ3nce-darwin-arm64-${VERSION}.zip
sha512: ${SHA512}
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF

# Upload to the release
gh release upload "v${VERSION}" out/make/zip/darwin/arm64/latest-mac.yml --clobber
```

### Step 4: Publish the Release

Remove the draft status so auto-update can find it:

```bash
VERSION=$(node -p "require('./package.json').version")
gh release edit "v${VERSION}" --draft=false
```

### Step 5: Verify Release

Check that the release is complete:
```bash
VERSION=$(node -p "require('./package.json').version")
gh release view "v${VERSION}" --json assets,isDraft -q '{isDraft: .isDraft, assets: [.assets[].name]}'
```

Expected output should show:
- `isDraft: false`
- Assets: `latest-mac.yml`, `Sequ3nce-darwin-arm64-X.Y.Z.zip`, `Sequ3nce.dmg`

## Troubleshooting

### "GITHUB_TOKEN not set"
The `gh` CLI handles this automatically. If it fails, run:
```bash
gh auth status
```
If not logged in, run:
```bash
gh auth login
```

### "Notarization timed out"
Apple's servers occasionally time out. Just run the publish command again.

### "Failed to notarize"
Check that Apple Developer credentials are configured in `forge.config.ts`.

### Auto-update not working
Make sure:
1. The release is NOT a draft (`isDraft: false`)
2. The `latest-mac.yml` file is attached to the release
3. The SHA512 hash in `latest-mac.yml` matches the actual ZIP file

## Auto-Update

Once published with `latest-mac.yml`, users with the app installed will automatically receive the update via electron-updater. No manual distribution needed.

## Files Reference

- Package config: `apps/desktop/package.json`
- Forge config: `apps/desktop/forge.config.ts`
- Build output: `apps/desktop/out/make/`
- Auto-update manifest: `latest-mac.yml` (generated and uploaded to release)
