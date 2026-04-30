# Release Desktop App (Electron) to Production

This command releases a new version of the Sequ3nce Electron desktop app for **Windows and macOS**.

> **Note:** This is the cross-platform Electron app. The legacy Swift macOS app uses `/release-desktop-swift` instead.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
- [ ] You're in the sequ3nce-ai repository

## Steps to Release

### Step 1: Bump the Version

Edit `apps/desktop/package.json` and increment the version number:
- Current format: `"version": "X.Y.Z"`
- Increment Z for patches, Y for minor features, X for major changes

### Step 2: Commit and Push

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/desktop/package.json
git commit -m "Bump Electron desktop version to X.Y.Z"
git push
```

### Step 3: Create and Push Tag

The GitHub Actions CI workflow triggers on tags matching `desktop-v*` or `v[0-9]*`:

```bash
git tag desktop-vX.Y.Z
git push origin desktop-vX.Y.Z
```

This triggers the CI workflow (`.github/workflows/desktop-release.yml`) which:
1. Builds the Windows `.exe` installer on `windows-latest`
2. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
3. Builds an **unsigned** macOS `.dmg` and `.zip` on `macos-latest` (placeholder — will be replaced in Step 5)
4. Generates `latest.yml` (Windows auto-update manifest) and `latest-mac.yml` (macOS auto-update manifest)
5. Creates a **draft** GitHub release with all artifacts attached

### Step 4: Wait for CI and Publish the Draft Release

Wait for CI to complete:
```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 3
```

Then publish the draft release:
```bash
gh release edit desktop-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

### Step 5: Build Signed macOS App Locally

**CRITICAL:** CI macOS builds are unsigned AND arm64-only. Auto-update silently fails on unsigned builds, and Intel Macs cannot run an arm64-only binary. You MUST build locally where the Developer ID certificate and `sequ3nce-notarize` keychain profile exist.

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/desktop
npm run build:mac
```

This builds a **signed, notarized, universal** `.dmg` and `.zip` (both arm64 + x64 slices via `lipo`-merge) using the local Keychain credentials. The `build:mac` script in `package.json` carries `--arch=universal`; do not use `npm run make -- --platform darwin` directly, as that defaults to host-arch only.

### Step 6: Replace macOS Assets on the Release

Remove the unsigned CI-built macOS artifacts and upload the signed local builds:

```bash
# Remove unsigned CI builds
gh release delete-asset desktop-vX.Y.Z Sequ3nce.dmg --repo Tallen231210/sequ3nce-ai --yes
gh release delete-asset desktop-vX.Y.Z Sequ3nce-darwin-universal-X.Y.Z.zip --repo Tallen231210/sequ3nce-ai --yes

# Upload signed local builds
gh release upload desktop-vX.Y.Z \
  "apps/desktop/out/make/Sequ3nce.dmg" \
  "apps/desktop/out/make/zip/darwin/universal/Sequ3nce-darwin-universal-X.Y.Z.zip" \
  --repo Tallen231210/sequ3nce-ai
```

### Step 7: Update the macOS Auto-Update Manifest

The `latest-mac.yml` manifest must match the signed ZIP's SHA512 hash and file size. Generate and upload the corrected manifest:

```bash
# Get SHA512 of signed ZIP
SHA512=$(shasum -a 512 "apps/desktop/out/make/zip/darwin/universal/Sequ3nce-darwin-universal-X.Y.Z.zip" | awk '{print $1}' | xxd -r -p | base64)

# Get file size
SIZE=$(stat -f%z "apps/desktop/out/make/zip/darwin/universal/Sequ3nce-darwin-universal-X.Y.Z.zip")

# Create manifest
cat > /tmp/latest-mac.yml << MANIFEST
version: X.Y.Z
files:
  - url: Sequ3nce-darwin-universal-X.Y.Z.zip
    sha512: ${SHA512}
    size: ${SIZE}
path: Sequ3nce-darwin-universal-X.Y.Z.zip
sha512: ${SHA512}
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
MANIFEST

# Replace manifest on release
gh release delete-asset desktop-vX.Y.Z latest-mac.yml --repo Tallen231210/sequ3nce-ai --yes
gh release upload desktop-vX.Y.Z /tmp/latest-mac.yml --repo Tallen231210/sequ3nce-ai
```

### Step 8: Verify Final Release

```bash
gh release view desktop-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'
```

Expected files:
- `Sequ3nce.dmg` — macOS installer (SIGNED)
- `Sequ3nce-darwin-universal-X.Y.Z.zip` — macOS auto-update archive (SIGNED)
- `latest-mac.yml` — macOS auto-update manifest (matches signed ZIP)
- `Sequ3nce-X.Y.Z.Setup.exe` — Windows installer
- `latest.yml` — Windows auto-update manifest
- `sequ3nce_X.Y.Z_amd64.deb` — Linux Debian package
- `sequ3nce-X.Y.Z-1.x86_64.rpm` — Linux RPM package

## Troubleshooting

### CI workflow didn't trigger
Check that the tag matches the pattern `desktop-v*` or `v[0-9]*`:
```bash
git tag -l "desktop-v*" | tail -5
```

### Build failed
Check GitHub Actions logs:
```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 5
gh run view <run-id> --repo Tallen231210/sequ3nce-ai --log-failed
```

### Auto-update not working on macOS
1. Verify the `.dmg` and `.zip` on the release are signed (built locally, not CI):
```bash
# Download and check
gh release download desktop-vX.Y.Z --pattern '*.zip' --dir /tmp/update-check --repo Tallen231210/sequ3nce-ai
unzip -q /tmp/update-check/Sequ3nce-darwin-universal-X.Y.Z.zip -d /tmp/update-check/
codesign -v --deep /tmp/update-check/Sequ3nce.app
```
2. Verify the `latest-mac.yml` SHA512 matches the signed ZIP (not the unsigned CI build).

### macOS app shows "damaged" warning (Gatekeeper)
This means the `.dmg` is unsigned (CI-built). Re-do Steps 5-7 to replace with signed builds.

## Auto-Update

Once published with signed macOS builds:
- **Windows** users receive updates via `electron-updater` using `latest.yml`
- **macOS** users receive updates via `electron-updater` using `latest-mac.yml`
- The app checks on startup (5-second delay) and every 4 hours

## Download Page

The download page at `/download` automatically picks up the latest release. No manual changes needed — the releases API (`/api/releases`) fetches from the `sequ3nce-ai` repo.

## Files Reference

- Package config: `apps/desktop/package.json`
- Forge config: `apps/desktop/forge.config.ts`
- CI workflow: `.github/workflows/desktop-release.yml`
- Build output: `apps/desktop/out/make/`
- Signing config: `forge.config.ts` → `osxSign` + `osxNotarize` (local only, skipped on CI)
- Entitlements: `apps/desktop/entitlements.plist`
