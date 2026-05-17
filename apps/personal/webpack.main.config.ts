import type { Configuration } from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/index.ts',
  // Put your normal webpack config below here
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
  },
  // electron-updater must be loaded at runtime (not bundled by webpack)
  // because it uses dynamic requires, lazy-val, and native fs/https operations.
  //
  // bufferutil + utf-8-validate are OPTIONAL native peers of `ws` (pulled in
  // transitively via daily-co / playwright-style libs). Webpack tries to
  // resolve them at compile time and fails on CI where they aren't installed.
  // Marking them as externals tells webpack to leave the requires alone — at
  // runtime ws falls back to its pure-JS implementation when they're missing.
  // Same rationale: pre-bundled, optional, dynamically-required.
  externals: {
    'electron-updater': 'commonjs2 electron-updater',
    'bufferutil': 'commonjs2 bufferutil',
    'utf-8-validate': 'commonjs2 utf-8-validate',
    // @sentry/electron has native crashpad bindings + dynamic requires
    // that webpack can't bundle. Forge externals plugin copies the
    // node_modules entry back into the packaged app.
    '@sentry/electron': 'commonjs2 @sentry/electron',
    '@sentry/electron/main': 'commonjs2 @sentry/electron/main',
  },
};
