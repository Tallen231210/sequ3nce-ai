# Release Desktop App to Production

This command releases a new version of the Sequ3nce Electron desktop app.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
- [ ] You're in the sequ3nce-ai repository

## Steps to Release

### Step 1: Bump the Version

Edit `apps/desktop/package.json` and increment the version number:
- Current format: `"version": "X.Y.Z"`
- Increment Z for patches, Y for minor features, X for major changes

### Step 2: Build and Publish

Run this command from the desktop directory:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/desktop && GITHUB_TOKEN=$(gh auth token) npm run publish
```

This command:
1. Gets the GitHub token from `gh` CLI (stored in keyring)
2. Builds the Electron app
3. Signs and notarizes with Apple (automatic, may take 1-2 minutes)
4. Creates DMG and ZIP distributables
5. Uploads to GitHub releases

### Step 3: Verify Release

Check that the release was created:
- Go to: https://github.com/Tallen231210/sequ3nce-ai/releases
- Verify the new version tag exists
- Verify DMG and ZIP files are attached

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

## Auto-Update

Once published, users with the app installed will automatically receive the update via electron-updater. No manual distribution needed.

## Files Reference

- Package config: `apps/desktop/package.json`
- Forge config: `apps/desktop/forge.config.ts`
- Build output: `apps/desktop/out/make/`
