# Release Swift macOS Desktop App to Production

This command releases a new version of the Sequ3nce Swift macOS app (**macOS only**).

> **Note:** For Windows releases, use `/release-desktop` instead. The Swift and Electron apps are completely separate apps for their respective platforms.

## Pre-flight Checklist

Before releasing, ensure:
- [ ] All code changes are complete and tested
- [ ] You're in the sequ3nce-ai repository
- [ ] The app builds successfully in Xcode

## Steps to Release

### Step 1: Bump the Version

Edit `apps/macos/Sequ3nce/Sequ3nce/Info.plist`:
- `CFBundleShortVersionString`: The version number (e.g., "1.4.1")
- `CFBundleVersion`: The build number (increment by 1 each release)

### Step 2: Update appcast.xml

Edit `apps/macos/appcast.xml`:
1. Add a new `<item>` block at the top (below `<!-- Latest Release -->`)
2. Update version numbers, date, and release notes
3. Leave `sparkle:edSignature` as placeholder (will be filled in Step 4)
4. Move the previous latest release comment to its version (e.g., `<!-- v1.4.0 -->`)

### Step 3: Build, Sign, and Notarize

Run the release script:

```bash
cd /Users/tylerallen/Desktop/sequ3nce-ai/apps/macos/Sequ3nce && ./scripts/release.sh X.Y.Z
```

Replace `X.Y.Z` with the version number (e.g., `1.4.1`).

This script:
1. Cleans and archives the Xcode project
2. Exports the app with Developer ID signing
3. Creates a ZIP and DMG for distribution
4. Submits to Apple for notarization (may take 2-5 minutes)
5. Staples the notarization ticket to both app and DMG
6. Re-creates ZIP with stapled app (for Sparkle auto-updates)

**User action:** Once the script finishes, paste the terminal output to Claude.

### Step 4: Generate Sparkle Signature (Claude does this)

Claude will run the Sparkle signing tool:

```bash
/Users/tylerallen/Desktop/sequ3nce-ai/apps/macos/scripts/bin/sign_update /Users/tylerallen/Desktop/sequ3nce-ai/apps/macos/build/Sequ3nce.zip
```

This outputs something like:
```
sparkle:edSignature="ABC123..." length="1589311"
```

### Step 5: Update appcast.xml (Claude does this)

Claude updates `apps/macos/appcast.xml`:
- Replace `SIGNATURE_PLACEHOLDER` with the `sparkle:edSignature` from sign_update output
- Update `length` with the file size in bytes

### Step 6: Commit and Push (Claude does this)

```bash
git add -A && git commit -m "Release macOS vX.Y.Z" && git push
```

### Step 7: Create GitHub Release (Claude does this)

Upload **both** the DMG (for new downloads) and ZIP (for Sparkle auto-updates) to the `sequ3nce-releases` repo:

```bash
gh release create macos-vX.Y.Z \
  --repo Tallen231210/sequ3nce-releases \
  --title "macOS vX.Y.Z" \
  --notes "See appcast.xml for release notes" \
  apps/macos/build/Sequ3nce-macOS.dmg \
  apps/macos/build/Sequ3nce.zip
```

> **Important:** Always upload the DMG alongside the ZIP. The download page serves the DMG to new users (avoids macOS Gatekeeper warnings). The ZIP is used by Sparkle for auto-updates to existing users.

## Troubleshooting

### "Notarization failed"
Check Apple Developer credentials and ensure the app is signed with Developer ID.

### "Signature invalid"
Ensure you're using the correct Sparkle EdDSA private key stored in Keychain.

### Build fails
Run `xcodebuild clean` and try again, or open in Xcode to see detailed errors.

## Auto-Update

Once the GitHub release is published and appcast.xml is pushed:
- Users will see "Update Available" dialog on app launch
- Sparkle handles download and installation automatically

## Files Reference

- Info.plist: `apps/macos/Sequ3nce/Sequ3nce/Info.plist`
- Appcast: `apps/macos/appcast.xml`
- Release script: `apps/macos/scripts/release.sh`
- Build script: `apps/macos/scripts/build-release.sh`
- Build output: `apps/macos/build/` (contains both `Sequ3nce.zip` and `Sequ3nce-macOS.dmg`)
- Sparkle public key: In Info.plist under `SUPublicEDKey`
- GitHub repo for releases: `Tallen231210/sequ3nce-releases` (public)
