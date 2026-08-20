import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';
import ForgeExternalsPlugin from '@timfish/forge-externals-plugin';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

// Skip code signing on CI (no Developer ID cert available)
const isCI = !!process.env.CI;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: 'Sequ3nce Personal',
    executableName: 'Sequ3nce Personal',
    appBundleId: 'com.sequ3nce.personal',
    appCategoryType: 'public.app-category.productivity',
    // Icon paths (relative to project root)
    // Mac: .icns file, Windows: .ico file
    icon: './assets/icon',
    // Code signing configuration (auto-detects Developer ID Application certificate)
    // Disabled on CI — build locally for signed macOS builds
    ...(isCI ? {} : {
      osxSign: {
        optionsForFile: () => {
          return {
            entitlements: './entitlements.plist',
            hardenedRuntime: true,
          };
        },
      },
      osxNotarize: {
        keychainProfile: 'sequ3nce-notarize',
      },
    }),
    // Protocol handler for magic link auth
    protocols: [
      {
        name: 'Sequ3nce Personal',
        schemes: ['sequ3nce-personal'],
      },
    ],
    // Extra resources to include
    extraResource: [
      './assets',
      './app-update.yml',
      // Sequ3nce Stream native dylibs (macOS only — built by scripts/build-native.sh)
      './native',
    ],
    // Microphone (Stream dictation + Coaching Calls), Camera (Coaching Calls)
    extendInfo: {
      NSMicrophoneUsageDescription: 'Sequ3nce uses your microphone for voice dictation and live coaching calls.',
      NSCameraUsageDescription: 'Sequ3nce uses your camera for live coaching calls.',
    },
  },
  // Rebuild NOTHING. The only runtime native module (uiohook-napi) ships
  // N-API prebuilds for every platform we target — rebuilding it is what has
  // broken every Windows CI build since May (node-gyp 9 can't parse modern
  // Visual Studio installs). N-API prebuilds are ABI-stable under Electron.
  rebuildConfig: { onlyModules: [] },
  makers: [
    // Windows installer is built by electron-builder (NSIS) via the
    // `make:win:nsis` npm script — see apps/personal/package.json `build` block.
    // electron-forge handles macOS + Linux installers below.
    // macOS DMG
    new MakerDMG({
      name: 'Sequ3nce Personal',
      icon: './assets/icon.icns',
      format: 'ULFO', // Use ULFO for best compression
    }),
    // macOS ZIP (for auto-updates)
    new MakerZIP({}, ['darwin']),
    // Linux DEB
    new MakerDeb({
      options: {
        name: 'sequ3nce-personal',
        bin: 'Sequ3nce Personal',
        maintainer: 'Sequ3nce',
        homepage: 'https://sequ3nce.ai',
        icon: './assets/icon.png',
        categories: ['Office', 'Utility'],
      },
    }),
    // Linux RPM — strip disabled because koffi bundles cross-arch .node prebuilds
    // that cause `strip` to fail on non-native architectures
    new MakerRpm({
      options: {
        name: 'sequ3nce-personal',
        bin: 'Sequ3nce Personal',
        homepage: 'https://sequ3nce.ai',
        icon: './assets/icon.png',
        categories: ['Office', 'Utility'],
        strip: false,
      },
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'Tallen231210',
        name: 'sequ3nce-ai',
      },
      prerelease: false,
      draft: true, // Create as draft first, then publish manually
    }),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      // Allow all connections in dev mode - the default CSP is too restrictive
      devContentSecurityPolicy: "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws: wss: https:;",
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: './src/index.html',
            js: './src/renderer.ts',
            name: 'main_window',
            preload: {
              js: './src/preload.ts',
            },
          },
          {
            html: './src/ammo-tracker.html',
            js: './src/ammo-tracker-renderer.ts',
            name: 'ammo_tracker',
            preload: {
              js: './src/ammo-tracker-preload.ts',
            },
          },
          {
            html: './src/training.html',
            js: './src/training-renderer.ts',
            name: 'training',
            preload: {
              js: './src/training-preload.ts',
            },
          },
          {
            html: './src/roleplay.html',
            js: './src/roleplay-renderer.ts',
            name: 'roleplay',
            preload: {
              js: './src/roleplay-preload.ts',
            },
          },
          {
            html: './src/schedule.html',
            js: './src/schedule-renderer.ts',
            name: 'schedule',
            preload: {
              js: './src/schedule-preload.ts',
            },
          },
          {
            html: './src/post-call.html',
            js: './src/post-call-renderer.ts',
            name: 'post_call',
            preload: {
              js: './src/post-call-preload.ts',
            },
          },
          {
            html: './src/stream-overlay.html',
            js: './src/stream-overlay-renderer.ts',
            name: 'stream_overlay',
            preload: {
              js: './src/stream-overlay-preload.ts',
            },
          },
        ],
      },
    }),
    // Copies webpack externals (electron-updater) into packaged node_modules
    // so runtime require() can find them after Electron Packager prunes node_modules
    // uiohook-napi is a native module used by the Stream dictation feature for global hotkey capture
    new ForgeExternalsPlugin({
      externals: ['electron-updater', 'uiohook-napi'],
      includeDeps: true,
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // NOTE: Integrity validation disabled until app is properly code-signed
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: false,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
};

export default config;
