const { withSentryConfig } = require('@sentry/nextjs');
const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@randombeast/shared'],
  
  // Включить экспериментальный instrumentation
  experimental: {
    instrumentationHook: true,
  },

  // Bundle analyzer (запускать через ANALYZE=true pnpm build)
  ...(process.env.ANALYZE === 'true' && {
    webpack: (config, { isServer }) => {
      if (!isServer) {
        const { BundleAnalyzerPlugin } = require('@next/bundle-analyzer')();
        config.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: true,
          })
        );
      }
      return config;
    },
  }),
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

module.exports = withSentryConfig(
  withNextIntl(nextConfig),
  sentryWebpackPluginOptions
);
