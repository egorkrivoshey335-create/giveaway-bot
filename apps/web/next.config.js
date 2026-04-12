const createNextIntlPlugin = require('next-intl/plugin');
const path = require('path');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@randombeast/shared'],

  // Enable instrumentation hook for Sentry
  experimental: {
    instrumentationHook: true,
  },

  webpack: (config, options) => {
    // Explicit @/ alias so it always resolves regardless of tsconfig reading
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };

    // Allow webpack to resolve .js imports to .ts files (needed for @randombeast/shared)
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      ...config.resolve.extensionAlias,
    };

    // Bundle analyzer (ANALYZE=true pnpm build)
    if (process.env.ANALYZE === 'true' && !options.isServer) {
      const { BundleAnalyzerPlugin } = require('@next/bundle-analyzer')();
      config.plugins.push(
        new BundleAnalyzerPlugin({ analyzerMode: 'static', openAnalyzer: true })
      );
    }

    return config;
  },
};

// Подключаем Sentry только если пакет установлен и DSN задан
let finalConfig = withNextIntl(nextConfig);

try {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN) {
    const { withSentryConfig } = require('@sentry/nextjs');
    finalConfig = withSentryConfig(withNextIntl(nextConfig), {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      silent: true,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    });
  }
} catch {
  // @sentry/nextjs не установлен — пропускаем
}

module.exports = finalConfig;
