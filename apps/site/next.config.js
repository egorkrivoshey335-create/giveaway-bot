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

const sentryConfig = {
  // Sentry source maps — отключаем если нет SENTRY_AUTH_TOKEN
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  disableLogger: true,
  // Не фейлим сборку если Sentry недоступен
  errorHandler: (err) => {
    console.warn('[Sentry] Upload skipped:', err?.message || err);
  },
};

module.exports = withSentryConfig(withNextIntl(nextConfig), sentryConfig);
