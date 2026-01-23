# GitHub Repo Privacy Migration Plan

**Created:** January 23, 2026
**Status:** In Progress - Waiting for users to update

## Problem

The main repo (`Tallen231210/sequ3nce-ai`) was public, exposing all source code. However, the macOS app uses Sparkle for auto-updates, which needs a public URL for the `appcast.xml` file.

## Solution

Created a separate public repo just for releases:
- **Main repo:** `Tallen231210/sequ3nce-ai` (will become private)
- **Releases repo:** `Tallen231210/sequ3nce-releases` (stays public, only contains appcast.xml)

## What Was Done (January 22-23, 2026)

1. **Created `sequ3nce-releases` repo** with just the `appcast.xml` file

2. **Released v1.7.7** with updated `SUFeedURL` in Info.plist:
   ```
   https://raw.githubusercontent.com/Tallen231210/sequ3nce-releases/main/appcast.xml
   ```

3. **Updated old appcast.xml** to point v1.7.7 download to the new releases repo, so existing users get migrated when they update

## Migration Path

```
User on v1.7.6 or earlier
    ↓
Checks old appcast.xml (in main repo)
    ↓
Sees v1.7.7 available, downloads from releases repo
    ↓
Updates to v1.7.7
    ↓
Now checks NEW appcast.xml (in releases repo)
    ↓
Main repo can safely go private
```

## When to Make Main Repo Private

**Wait ~1-2 weeks** from January 23, 2026 (so around **February 5, 2026**) to give users time to update to v1.7.7.

After most users have updated, run:

```bash
gh repo edit Tallen231210/sequ3nce-ai --visibility private
```

## Future Releases

For all future macOS releases:

1. Update `apps/macos/appcast.xml` in the main repo (for your records)
2. **Also update** `appcast.xml` in `sequ3nce-releases` repo (this is what users check)
3. Upload the `.zip` to GitHub releases on `sequ3nce-releases` repo

Or simplify by only maintaining the appcast in the releases repo going forward.

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| SUFeedURL | `apps/macos/Sequ3nce/Sequ3nce/Info.plist` | Where app checks for updates |
| Main appcast | `apps/macos/appcast.xml` | Backup/reference copy |
| Public appcast | `sequ3nce-releases/appcast.xml` | What users actually check |

## Verification

After making the repo private, verify:
1. App still checks for updates (should work - uses releases repo now)
2. New users can still download from your website (update download links if needed)
3. Existing users on v1.7.7+ are unaffected
