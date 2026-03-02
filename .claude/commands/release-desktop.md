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
1. Builds the macOS `.dmg` and `.zip` on `macos-latest`
2. Builds the Windows `.exe` installer on `windows-latest`
3. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
4. Generates `latest.yml` (Windows auto-update manifest) and `latest-mac.yml` (macOS auto-update manifest)
5. Creates a **draft** GitHub release with all artifacts attached

### Step 4: Publish the Release

The CI creates a draft release. Publish it:

```bash
gh release edit desktop-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

Or publish from the GitHub Releases web UI.

### Step 5: Verify Release

Check that the release was created correctly:

```bash
gh release view desktop-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'
```

Expected files:
- `Sequ3nce.dmg` — macOS installer
- `Sequ3nce-darwin-*.zip` — macOS auto-update archive
- `latest-mac.yml` — macOS auto-update manifest
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

### macOS app shows "damaged" warning (Gatekeeper)
The CI-built macOS app is unsigned. Users need to right-click → Open to bypass Gatekeeper on first launch. To avoid this, build macOS locally where your Keychain has the Developer ID cert:
```bash
cd apps/desktop && npm run build:mac
```
Then manually attach the signed `.dmg` and `.zip` to the GitHub release.

### Auto-update not working
Verify the update manifests are attached to the release:
```bash
gh release view desktop-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[] | select(.name | test("latest"))'
```

The manifests must contain the correct version, SHA512 hash, and file size for `electron-updater` to find the update.

## Auto-Update

Once published:
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
