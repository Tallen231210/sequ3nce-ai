# Release Windows Desktop App (Electron) to Production

This command releases a new version of the Sequ3nce Electron desktop app for **Windows only**.

> **Note:** macOS users use the Swift app instead (`/release-desktop-swift`). The Electron app is exclusively for Windows.

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
git tag vX.Y.Z
git push origin vX.Y.Z
```

This triggers the CI workflow (`.github/workflows/desktop-release.yml`) which:
1. Builds the Windows `.exe` installer on `windows-latest`
2. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
3. Generates `latest.yml` (Windows auto-update manifest with SHA512 hash)
4. Creates a **draft** GitHub release with all artifacts attached

### Step 4: Publish the Release

The CI creates a draft release. Publish it:

```bash
gh release edit vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

Or publish from the GitHub Releases web UI.

### Step 5: Verify Release

Check that the release was created correctly:

```bash
gh release view vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'
```

Expected files:
- `Sequ3nce-X.Y.Z.Setup.exe` — Windows installer
- `latest.yml` — Windows auto-update manifest
- `sequ3nce_X.Y.Z_amd64.deb` — Linux Debian package
- `sequ3nce-X.Y.Z-1.x86_64.rpm` — Linux RPM package

## Troubleshooting

### CI workflow didn't trigger
Check that the tag matches the pattern `v[0-9]*` or `desktop-v*`:
```bash
git tag -l "v*" | tail -5
```

### Windows build failed
Check GitHub Actions logs:
```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 5
gh run view <run-id> --repo Tallen231210/sequ3nce-ai --log-failed
```

### Auto-update not working for Windows users
Verify `latest.yml` is attached to the release:
```bash
gh release view vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[] | select(.name == "latest.yml")'
```

The `latest.yml` must contain the correct version, SHA512 hash, and file size for `electron-updater` to find the update.

## Auto-Update

Once published, Windows users with the app installed will automatically receive the update via `electron-updater`. The app checks on startup (5-second delay) and every 4 hours.

## Download Page

The download page at `/download` automatically picks up the latest release with a `.exe` asset. No manual changes needed — the releases API (`/api/releases`) fetches from the `sequ3nce-ai` repo with `?per_page=100`.

## Files Reference

- Package config: `apps/desktop/package.json`
- Forge config: `apps/desktop/forge.config.ts`
- CI workflow: `.github/workflows/desktop-release.yml`
- Build output: `apps/desktop/out/make/`
