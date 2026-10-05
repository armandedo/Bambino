import { createErrorReporter } from '@bambino/utils';

/**
 * Error tracking in the browser, on when NEXT_PUBLIC_SENTRY_DSN is set (the CSP then allows its host). Reports carry
 * the error and the reference shown to the parent, never form contents or account details.
 */
export const browserErrorReporter = createErrorReporter({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  app: 'web',
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
});
