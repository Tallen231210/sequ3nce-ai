# Release Personal App (Electron) to Production

This command releases a new version of the Sequ3nce Personal Electron app for **Windows and macOS**.

> **Note:** This is the B2C personal app. The B2B desktop app uses `/release-desktop` instead.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
- [ ] You're in the sequ3nce-ai repository

## Steps to Release

### Step 1: Bump the Version

Edit `apps/personal/package.json` and increment the version number:
- Current format: `"version": "X.Y.Z"`
- Increment Z for patches, Y for minor features, X for major changes

### Step 2: Commit and Push

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/package.json
git commit -m "Bump Personal app version to X.Y.Z"
git push
```

### Step 3: Create and Push Tag

The GitHub Actions CI workflow triggers on tags matching `personal-v*`:

```bash
git tag personal-vX.Y.Z
git push origin personal-vX.Y.Z
```

This triggers the CI workflow (`.github/workflows/personal-release.yml`) which:
1. Builds the macOS `.dmg` and `.zip` on `macos-latest`
2. Builds the Windows `.exe` installer on `windows-latest`
3. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
4. Generates `latest-personal.yml` (Windows auto-update manifest) and `latest-personal-mac.yml` (macOS auto-update manifest)
5. Creates a **draft** GitHub release with all artifacts attached

### Step 4: Publish the Release

The CI creates a draft release. Publish it:

```bash
gh release edit personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

Or publish from the GitHub Releases web UI.

### Step 5: Verify Release

Check that the release was created correctly:

```bash
gh release view personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'
```

Expected files:
- `Sequ3nce Personal.dmg` — macOS installer
- `Sequ3nce Personal-darwin-*.zip` — macOS auto-update archive
- `latest-personal-mac.yml` — macOS auto-update manifest
- `Sequ3nce Personal-X.Y.Z.Setup.exe` — Windows installer
- `latest-personal.yml` — Windows auto-update manifest
- `sequ3nce-personal_X.Y.Z_amd64.deb` — Linux Debian package
- `sequ3nce-personal-X.Y.Z-1.x86_64.rpm` — Linux RPM package

## Troubleshooting

### CI workflow didn't trigger
Check that the tag matches the pattern `personal-v*`:
```bash
git tag -l "personal-v*" | tail -5
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
cd apps/personal && npm run build:mac
```
Then manually attach the signed `.dmg` and `.zip` to the GitHub release.

### Auto-update not working
Verify the update manifests are attached to the release:
```bash
gh release view personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[] | select(.name | test("latest-personal"))'
```

The manifests must contain the correct version, SHA512 hash, and file size for `electron-updater` to find the update.

## Auto-Update

Once published:
- **Windows** users receive updates via `electron-updater` using `latest-personal.yml`
- **macOS** users receive updates via `electron-updater` using `latest-personal-mac.yml`
- The app checks on startup (5-second delay) and every 4 hours
- The personal app uses the `personal` auto-update channel, so B2B and B2C updates never conflict

## Files Reference

- Package config: `apps/personal/package.json`
- Forge config: `apps/personal/forge.config.ts`
- CI workflow: `.github/workflows/personal-release.yml`
- Build output: `apps/personal/out/make/`
