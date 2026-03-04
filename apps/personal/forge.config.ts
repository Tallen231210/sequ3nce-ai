import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives';
import { WebpackPlugin } from '@electron-forge/plugin-webpack';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';

import { mainConfig } from './webpack.main.config';
import { rendererConfig } from './webpack.renderer.config';

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
    osxSign: {
      optionsForFile: () => {
        return {
          entitlements: './entitlements.plist',
          hardenedRuntime: true,
        };
      },
    },
    // Notarization configuration (uses keychain profile for credentials)
    osxNotarize: {
      keychainProfile: 'sequ3nce-notarize',
    },
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
    ],
    // macOS Info.plist additions for privacy permissions
    extendInfo: {
      NSMicrophoneUsageDescription: 'Sequ3nce Personal needs microphone access to record sales calls and provide real-time transcription.',
      NSCameraUsageDescription: 'Sequ3nce Personal needs camera access for video calls in the Role Play Room.',
      NSAppleEventsUsageDescription: 'Sequ3nce Personal needs to control system audio for call recording.',
      NSScreenCaptureUsageDescription: 'Sequ3nce Personal needs screen recording access to capture system audio from your sales calls.',
    },
  },
  rebuildConfig: {},
  makers: [
    // Windows installer
    new MakerSquirrel({
      name: 'Sequ3nce Personal',
      setupIcon: './assets/icon.ico',
      // The ICO file to use as the icon for the generated Setup.exe
      iconUrl: 'https://raw.githubusercontent.com/Tallen231210/sequ3nce-ai/main/apps/personal/assets/icon.ico',
    }),
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
    // Linux RPM
    new MakerRpm({
      options: {
        name: 'sequ3nce-personal',
        bin: 'Sequ3nce Personal',
        homepage: 'https://sequ3nce.ai',
        icon: './assets/icon.png',
        categories: ['Office', 'Utility'],
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
        ],
      },
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
