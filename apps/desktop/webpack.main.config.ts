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
  // because it uses dynamic requires, lazy-val, and native fs/https operations
  externals: {
    'electron-updater': 'commonjs2 electron-updater',
    // @sentry/electron has native crashpad bindings + dynamic requires
    // that webpack can't bundle. Forge externals plugin copies the
    // node_modules entry back into the packaged app.
    '@sentry/electron': 'commonjs2 @sentry/electron',
    '@sentry/electron/main': 'commonjs2 @sentry/electron/main',
  },
};
