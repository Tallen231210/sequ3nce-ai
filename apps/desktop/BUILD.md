# Sequ3nce Desktop App - Build & Release Guide

## Overview

The Sequ3nce desktop app is built with Electron and Electron Forge. This guide covers building, testing, and releasing the app for macOS, Windows, and Linux.

## Prerequisites

1. **Node.js 20+** installed
2. **App Icons** in `./assets/` directory (see `assets/ICONS_NEEDED.md`)
3. **GitHub Token** with `repo` scope for releases

## Quick Start

```bash
# Install dependencies
cd apps/desktop
npm install

# Run in development
npm start

# Build for current platform
npm run make
```

## Build Commands

| Command | Description |
|---------|-------------|
| `npm start` | Run in development mode |
| `npm run make` | Build for current platform |
| `npm run build:mac` | Build macOS DMG |
| `npm run build:win` | Build Windows installer |
| `npm run build:linux` | Build Linux packages |
| `npm run release` | Build and publish to GitHub Releases |

## Environment Configuration

### Development (`.env.development`)
```
WEB_APP_URL=http://localhost:3000
AUDIO_SERVICE_URL=wss://amusing-charm-production.up.railway.app
```

### Production (`.env.production`)
```
WEB_APP_URL=https://sequ3nce.ai
AUDIO_SERVICE_URL=wss://amusing-charm-production.up.railway.app
```

## Manual Release Process

### 1. Update Version
```bash
# Update version in package.json
npm version patch  # or minor/major
```

### 2. Build the App
```bash
# macOS (run on Mac)
npm run build:mac

# Windows (run on Windows or in CI)
npm run build:win

# Linux (run on Linux or in CI)
npm run build:linux
```

### 3. Find Built Files
After building, find the installers in:
- **macOS**: `out/make/*.dmg`
- **Windows**: `out/make/squirrel.windows/x64/*.exe`
- **Linux**: `out/make/deb/x64/*.deb` and `out/make/rpm/x64/*.rpm`

### 4. Create GitHub Release
1. Go to GitHub repository > Releases
2. Click "Draft a new release"
3. Create tag: `desktop-v1.0.0` (match your version)
4. Upload the installer files
5. Write release notes
6. Publish release

## Automated Releases (GitHub Actions)

### Trigger Automated Build

**Option 1: Tag Push**
```bash
git tag desktop-v1.0.0
git push origin desktop-v1.0.0
```

**Option 2: Manual Trigger**
1. Go to Actions > "Build and Release Desktop App"
2. Click "Run workflow"
3. Enter version number
4. Click "Run workflow"

### What Happens
1. GitHub Actions builds for all 3 platforms in parallel
2. Creates a draft release with all installers attached
3. You review and publish the release

## Required Icons

Before building production releases, add these files to `assets/`:

| File | Platform | Format |
|------|----------|--------|
| `icon.icns` | macOS | Apple Icon (512x512 or 1024x1024) |
| `icon.ico` | Windows | Multi-resolution ICO |
| `icon.png` | Linux | PNG (512x512) |
| `dmg-background.png` | macOS | DMG background (540x380) |

See `assets/ICONS_NEEDED.md` for creation instructions.

## Code Signing (Production)

### macOS
For distribution outside the App Store, you need:
1. Apple Developer account
2. Developer ID Application certificate
3. Notarization

Update `forge.config.ts`:
```typescript
osxSign: {
  identity: 'Developer ID Application: Your Name (TEAM_ID)',
},
osxNotarize: {
  appleId: 'your@email.com',
  appleIdPassword: '@keychain:AC_PASSWORD',
  teamId: 'TEAM_ID',
},
```

### Windows
For avoiding SmartScreen warnings:
1. Purchase a code signing certificate
2. Add to `forge.config.ts`:
```typescript
new MakerSquirrel({
  certificateFile: './cert.pfx',
  certificatePassword: process.env.CERT_PASSWORD,
}),
```

## Troubleshooting

### Build fails on Windows
- Ensure Visual Studio Build Tools are installed
- Run as Administrator if permission errors

### Build fails on macOS
- Ensure Xcode Command Line Tools: `xcode-select --install`
- For notarization issues, check Apple Developer portal

### Build fails on Linux
- Install required dependencies: `sudo apt-get install rpm`

### App crashes on launch
- Check DevTools for errors: `npm start` then View > Toggle Developer Tools
- Verify environment variables are set correctly

## Testing Builds

### Local Testing
```bash
# After building
open out/make/*.dmg  # macOS
# or
./out/make/squirrel.windows/x64/Sequ3nceSetup.exe  # Windows
```

### Pre-release Testing
1. Build and upload to GitHub as pre-release
2. Have team members download and test
3. Fix any issues
4. Convert to full release

## Architecture

```
apps/desktop/
├── assets/              # Icons and images
├── src/
│   ├── index.ts         # Main process (Electron)
│   ├── preload.ts       # Preload script
│   ├── renderer.ts      # Renderer entry
│   └── renderer/
│       ├── App.tsx      # Main React app
│       └── components/  # React components
├── forge.config.ts      # Electron Forge config
├── webpack.main.config.ts
├── webpack.renderer.config.ts
└── package.json
```

## Support

For issues with the build process:
1. Check this documentation
2. Review GitHub Actions logs
3. Open an issue on GitHub
