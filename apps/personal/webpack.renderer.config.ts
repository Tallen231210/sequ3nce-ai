import type { Configuration } from 'webpack';
import webpack from 'webpack';

import { rules } from './webpack.rules';
import { plugins } from './webpack.plugins';

rules.push({
  test: /\.css$/,
  use: [
    { loader: 'style-loader' },
    { loader: 'css-loader' },
    {
      loader: 'postcss-loader',
      options: {
        postcssOptions: {
          plugins: [
            require('@tailwindcss/postcss'),
            require('autoprefixer'),
          ],
        },
      },
    },
  ],
});

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins: [
    ...plugins,
    new webpack.DefinePlugin({
      // Optional development Convex deployment. Empty means the app's normal
      // Convex site; the production bundle does not expose the FreeHire UI.
      'process.env.FREEHIRE_DEV_CONVEX_SITE_URL': JSON.stringify(
        process.env.FREEHIRE_DEV_CONVEX_SITE_URL || '',
      ),
    }),
  ],
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
