// Sentry is optional - only initializes when package is installed and DSN is configured
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

if (dsn) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry = require('@sentry/nextjs') as any;
    Sentry.init({
      dsn,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      environment: process.env.NODE_ENV,
      ignoreErrors: ['ResizeObserver loop limit exceeded'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        if (process.env.NODE_ENV === 'development') return null;
        return event;
      },
    });
  } catch {
    // @sentry/nextjs not installed, skip initialization
  }
}
