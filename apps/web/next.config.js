const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@randombeast/shared'],
  
  // Enable instrumentation hook for Sentry
  experimental: {
    instrumentationHook: true,
  },

  // Bundle analyzer (ANALYZE=true pnpm build)
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
