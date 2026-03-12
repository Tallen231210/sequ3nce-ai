# Release Personal App (Electron) to Production

This command releases a new version of the Sequ3nce Personal Electron app for **Windows and macOS**.

> **Note:** This is the B2C personal app. The B2B desktop app uses `/release-desktop` instead.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
- [ ] Convex backend is deployed: `cd apps/web && npx convex deploy --yes`
- [ ] You're on the `main` branch with no uncommitted changes

## Steps to Release

### Step 1: Deploy Convex Backend (if needed)

If any Convex files changed (`apps/web/convex/*`), deploy first:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/web && npx convex deploy --yes
```

### Step 2: Bump the Version

Edit `apps/personal/package.json` and increment the version number:
- Increment Z for patches/fixes (1.1.0 → 1.1.1)
- Increment Y for minor features (1.1.0 → 1.2.0)
- Increment X for major changes (1.1.0 → 2.0.0)

### Step 3: Commit and Push

Stage ONLY the files that changed. Never use `git add -A`. Typical files:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai
git add apps/personal/package.json [other changed files...]
git commit -m "Description of changes"
git push origin main
```

**Important:** The `git push` triggers Vercel auto-deploy for the web dashboard. If you modified any `apps/web/` files (Convex routes, API routes, middleware), this push deploys those too.

### Step 4: Create and Push Tag

The GitHub Actions CI workflow triggers on tags matching `personal-v*`:

```bash
git tag personal-vX.Y.Z
git push origin personal-vX.Y.Z
```

This triggers `.github/workflows/personal-release.yml` which:
1. Builds the Windows `.exe` installer on `windows-latest`
2. Builds the macOS `.dmg` and `.zip` on `macos-latest` (unsigned — CI has no cert)
3. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
4. Generates `latest-personal.yml` (Windows) and `latest-personal-mac.yml` (macOS) auto-update manifests
5. Creates a **draft** GitHub release with all artifacts attached

### Step 5: Wait for CI

Monitor the build (~4-5 minutes):

```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 3
```

Or watch it live:

```bash
gh run watch <run-id> --repo Tallen231210/sequ3nce-ai --exit-status
```

### Step 6: Publish the Release

Once CI completes successfully, publish the draft:

```bash
gh release edit personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

### Step 7: Verify

```bash
# Check release assets
gh release view personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'

# Verify auto-update endpoint serves the new version
curl -sL "https://sequ3nce.ai/api/updates/personal/latest-personal-mac.yml" | head -2
curl -sL "https://sequ3nce.ai/api/updates/personal/latest-personal.yml" | head -2
```

Expected release assets:
- `Sequ3nce.Personal.dmg` — macOS installer
- `Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip` — macOS auto-update archive
- `latest-personal-mac.yml` — macOS auto-update manifest
- `Sequ3nce.Personal-X.Y.Z.Setup.exe` — Windows installer
- `latest-personal.yml` — Windows auto-update manifest
- `sequ3nce-personal_X.Y.Z_amd64.deb` — Linux Debian package
- `sequ3nce-personal-X.Y.Z-1.x86_64.rpm` — Linux RPM package

Both `curl` commands should show `version: X.Y.Z` matching the release you just published.

## Auto-Update Architecture

The Personal app uses a **dedicated update server** to avoid conflicts with B2B Desktop releases in the same repo:

```
Electron app → https://sequ3nce.ai/api/updates/personal/{manifest}
                        ↓
              Next.js API route queries GitHub API
              Finds latest personal-v* release (ignores desktop-v*)
                        ↓
              302 redirect to GitHub release asset
```

- **Update server**: `apps/web/src/app/api/updates/personal/[...file]/route.ts`
- **App config**: `apps/personal/src/index.ts` — uses `provider: 'generic'` with `url: 'https://sequ3nce.ai/api/updates/personal'`
- **Channel**: `personal` (manifests are named `latest-personal.yml` / `latest-personal-mac.yml`)
- **Check frequency**: On startup (5-second delay) + every 4 hours

This ensures B2C auto-updates work regardless of which app (B2B or B2C) published the most recent GitHub release.

## Troubleshooting

### CI workflow didn't trigger
Check that the tag matches the pattern `personal-v*`:
```bash
git tag -l "personal-v*" | sort -V | tail -5
```

### Build failed
```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 5
gh run view <run-id> --repo Tallen231210/sequ3nce-ai --log-failed
```

### Auto-update endpoint returns old version
The endpoint has no persistent cache (`force-dynamic`). If it's stale:
1. Check GitHub API directly: `curl -s "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases?per_page=3" | python3 -c "import sys,json; [print(r['tag_name']) for r in json.load(sys.stdin)]"`
2. Ensure the release is published (not draft)
3. Redeploy Vercel if needed: `git push origin main`

### macOS app shows "damaged" warning (Gatekeeper)
The CI-built macOS app is unsigned. Users need to right-click → Open to bypass Gatekeeper on first launch. For a signed build, build locally:
```bash
cd apps/personal && npm run build:mac
```
Then manually attach the signed `.dmg` and `.zip` to the GitHub release.

## Files Reference

- Package config: `apps/personal/package.json`
- Auto-updater setup: `apps/personal/src/index.ts` (search for "Auto-Update")
- Update server: `apps/web/src/app/api/updates/personal/[...file]/route.ts`
- Forge config: `apps/personal/forge.config.ts`
- CI workflow: `.github/workflows/personal-release.yml`
- Build output: `apps/personal/out/make/`
