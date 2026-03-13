# Release Personal App (Electron) to Production

This command releases a new version of the Sequ3nce Personal Electron app for **Windows, macOS, and Linux**.

> **Note:** This is the B2C personal app. The B2B desktop app uses `/release-desktop` instead.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
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

Stage ONLY the files that changed. **Never use `git add -A` or `git add .`** — always add files by name.

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
2. Builds the macOS `.dmg` and `.zip` on `macos-latest` (**unsigned** — CI has no cert)
3. Builds Linux `.deb` and `.rpm` packages on `ubuntu-latest`
4. Generates `latest-personal.yml` (Windows) and `latest-personal-mac.yml` (macOS) auto-update manifests
5. Creates a **draft** GitHub release with all artifacts attached

### Step 5: Wait for CI

Monitor the build (~3-4 minutes):

```bash
gh run list --repo Tallen231210/sequ3nce-ai --limit 3
```

Or watch it live (use the run ID from the list command):

```bash
gh run watch <run-id> --repo Tallen231210/sequ3nce-ai --exit-status
```

### Step 6: Publish the Release

Once CI completes successfully, the release is a **draft**. Publish it:

```bash
gh release edit personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false
```

### Step 7: Build Signed macOS App Locally

**This step is required.** The CI-built macOS app is unsigned and will trigger Gatekeeper's "damaged app" warning. You must build locally where the Developer ID cert and notarization keychain profile are available.

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/personal && npm run build:mac
```

This uses `forge.config.ts` which automatically:
- Signs with `Developer ID Application: Tyler Allen (P3LCDZYPU5)` via `osxSign`
- Notarizes with Apple via `osxNotarize` using keychain profile `sequ3nce-notarize`

Verify signing and notarization:

```bash
# Check code signing
codesign -dvv "out/Sequ3nce Personal-darwin-arm64/Sequ3nce Personal.app" 2>&1 | grep Authority

# Check notarization (must say "source=Notarized Developer ID")
spctl -a -vv "out/Sequ3nce Personal-darwin-arm64/Sequ3nce Personal.app" 2>&1
```

### Step 8: Replace CI macOS Assets with Signed Versions

Remove the unsigned CI-built macOS assets and upload the signed ones:

```bash
# Remove unsigned CI assets
gh release delete-asset personal-vX.Y.Z "Sequ3nce.Personal.dmg" --repo Tallen231210/sequ3nce-ai --yes
gh release delete-asset personal-vX.Y.Z "Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip" --repo Tallen231210/sequ3nce-ai --yes

# Upload signed assets
gh release upload personal-vX.Y.Z "out/make/Sequ3nce Personal.dmg#Sequ3nce.Personal.dmg" --repo Tallen231210/sequ3nce-ai
gh release upload personal-vX.Y.Z "out/make/zip/darwin/arm64/Sequ3nce Personal-darwin-arm64-X.Y.Z.zip#Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip" --repo Tallen231210/sequ3nce-ai
```

### Step 9: Update macOS Auto-Update Manifest

The signed `.zip` has a different SHA512 hash than the CI version. You must regenerate the manifest.

```bash
# Compute SHA512 (base64) and size of signed .zip
SHA=$(shasum -a 512 "out/make/zip/darwin/arm64/Sequ3nce Personal-darwin-arm64-X.Y.Z.zip" | awk '{print $1}' | xxd -r -p | base64)
SIZE=$(stat -f%z "out/make/zip/darwin/arm64/Sequ3nce Personal-darwin-arm64-X.Y.Z.zip")

# Write manifest
cat > /tmp/latest-personal-mac.yml << EOF
version: X.Y.Z
files:
  - url: Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip
    sha512: $SHA
    size: $SIZE
path: Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip
sha512: $SHA
releaseDate: '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
EOF

# Replace manifest on release
gh release delete-asset personal-vX.Y.Z "latest-personal-mac.yml" --repo Tallen231210/sequ3nce-ai --yes
gh release upload personal-vX.Y.Z "/tmp/latest-personal-mac.yml" --repo Tallen231210/sequ3nce-ai
```

### Step 10: Verify

Run all three of these checks:

```bash
# 1. Check all 7 release assets are present
gh release view personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --json assets --jq '.assets[].name'

# 2. Verify macOS auto-update endpoint serves the new version
curl -sL "https://sequ3nce.ai/api/updates/personal/latest-personal-mac.yml" | head -2

# 3. Verify Windows auto-update endpoint serves the new version
curl -sL "https://sequ3nce.ai/api/updates/personal/latest-personal.yml" | head -2
```

Expected release assets (all 7):
- `Sequ3nce.Personal.dmg` — macOS installer (signed + notarized)
- `Sequ3nce.Personal-darwin-arm64-X.Y.Z.zip` — macOS auto-update archive (signed + notarized)
- `latest-personal-mac.yml` — macOS auto-update manifest (with signed .zip hash)
- `Sequ3nce.Personal-X.Y.Z.Setup.exe` — Windows installer
- `latest-personal.yml` — Windows auto-update manifest
- `sequ3nce-personal_X.Y.Z_amd64.deb` — Linux Debian package
- `sequ3nce-personal-X.Y.Z-1.x86_64.rpm` — Linux RPM package

Both `curl` commands should show `version: X.Y.Z` matching the release you just published.

## Critical: electron-updater and Webpack (DO NOT CHANGE)

Auto-update requires **two configurations working together**. Removing either one breaks auto-update:

### 1. Webpack Externals (`apps/personal/webpack.main.config.ts`)

```typescript
externals: {
  'electron-updater': 'commonjs2 electron-updater',
},
```

**Why:** electron-updater uses dynamic `require()`, `lazy-val`, and native `fs`/`https` — webpack cannot bundle it. This tells webpack to emit a runtime `require()` instead.

### 2. Forge Externals Plugin (`apps/personal/forge.config.ts`)

```typescript
import ForgeExternalsPlugin from '@timfish/forge-externals-plugin';

// In the plugins array:
new ForgeExternalsPlugin({
  externals: ['electron-updater'],
  includeDeps: true,
}),
```

**Why:** Electron Forge's webpack plugin **prunes all node_modules** from the packaged app (since webpack is supposed to have bundled everything). Without this plugin, the runtime `require('electron-updater')` fails with "Cannot find module" because there's no `node_modules` in the asar. The plugin copies electron-updater and all its transitive dependencies back into the packaged app's `node_modules` after pruning.

**Both configs exist in the B2B Desktop app too** (`apps/desktop/webpack.main.config.ts` and `apps/desktop/forge.config.ts`).

### What breaks if you remove either one:

| Removed | Error |
|---------|-------|
| Webpack externals | Auto-update silently fails (webpack bundles electron-updater, breaking its dynamic requires) |
| Forge externals plugin | App crashes on launch: `"Cannot find module 'electron-updater'"` |

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
- **Signing**: `apps/personal/forge.config.ts` — `osxSign` + `osxNotarize` with keychain profile `sequ3nce-notarize` (skipped on CI)
- **Channel**: `personal` (manifests are named `latest-personal.yml` / `latest-personal-mac.yml`)
- **Check frequency**: On startup (5-second delay) + every 4 hours

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
The endpoint uses `force-dynamic` + `cache: "no-store"` so it should never be stale. If it somehow is:
1. Check GitHub API directly: `curl -s "https://api.github.com/repos/Tallen231210/sequ3nce-ai/releases?per_page=3" | python3 -c "import sys,json; [print(r['tag_name']) for r in json.load(sys.stdin)]"`
2. Ensure the release is published (not draft) — `gh release edit personal-vX.Y.Z --repo Tallen231210/sequ3nce-ai --draft=false`
3. Redeploy Vercel if needed: push an empty commit or any change to `main`

### macOS app shows "damaged" warning (Gatekeeper)
You skipped Step 7. The CI-built macOS app is unsigned. Go back and do Steps 7-9 to build, sign, notarize, and upload the macOS assets.

### App crashes with "Cannot find module 'electron-updater'"
The `@timfish/forge-externals-plugin` is missing or misconfigured in `forge.config.ts`. See the "Critical: electron-updater and Webpack" section above. Both the webpack externals AND the forge externals plugin are required.

### Auto-update not working (no crash, just no updates)
1. Verify `electron-updater` is in webpack `externals` in `webpack.main.config.ts`
2. Verify `ForgeExternalsPlugin` is in `forge.config.ts` plugins array
3. Check that `apps/personal/src/index.ts` uses `provider: 'generic'` with URL `https://sequ3nce.ai/api/updates/personal`
4. Verify the update endpoint returns the correct manifest: `curl -sL "https://sequ3nce.ai/api/updates/personal/latest-personal-mac.yml"`

### Notarization fails
1. Verify keychain profile exists: The profile `sequ3nce-notarize` must be stored in the login keychain. If missing, create it:
   ```bash
   xcrun notarytool store-credentials sequ3nce-notarize --apple-id <APPLE_ID> --team-id P3LCDZYPU5 --password <APP_SPECIFIC_PASSWORD>
   ```
2. Ensure you have internet access (notarization requires uploading to Apple)
3. Check Apple Developer account is in good standing

## Files Reference

| File | Purpose |
|------|---------|
| `apps/personal/package.json` | Version number + `electron-updater` in dependencies |
| `apps/personal/src/index.ts` | Auto-updater config (search "Auto-Update") |
| `apps/personal/webpack.main.config.ts` | Webpack externals — keeps electron-updater out of bundle |
| `apps/personal/forge.config.ts` | Forge externals plugin + signing + notarization config |
| `apps/personal/entitlements.plist` | macOS entitlements for code signing |
| `apps/web/src/app/api/updates/personal/[...file]/route.ts` | Dedicated update server |
| `apps/web/src/middleware.ts` | Clerk middleware exclusion for `/api/updates/*` |
| `.github/workflows/personal-release.yml` | CI workflow (Windows + Linux + unsigned macOS) |
| `apps/personal/out/make/` | Local build output |
