const withNextIntl = require('next-intl/plugin')('./src/i18n/request.ts');
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@randombeast/shared'],
  experimental: {
    instrumentationHook: true,
  },
};

const hasSentryDsn = !!process.env.SENTRY_DSN_SITE;

const sentryConfig = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
  // Disable source map generation if Sentry DSN is not configured
  sourcemaps: {
    disable: !hasSentryDsn,
    deleteSourcemapsAfterUpload: true,
  },
  // Don't fail the build if Sentry is not configured
  errorHandler: (err) => {
    console.warn('[Sentry] Upload skipped:', err?.message || err);
  },
};

module.exports = withSentryConfig(withNextIntl(nextConfig), sentryConfig);
