import type { Instrumentation } from 'next';
import { createErrorReporter } from '@bambino/utils';

// Server-side errors (rendering, route handlers, proxy) go to error tracking when SENTRY_DSN is set. Only the
// error, Next's digest and the route are sent: no headers, cookies or request bodies.
const reporter = createErrorReporter({
  dsn: process.env.SENTRY_DSN,
  app: 'admin',
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
});

export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  const digest =
    typeof error === 'object' && error !== null && 'digest' in error ? String(error.digest) : undefined;
  await reporter.report(error, {
    requestId: digest,
    source: 'render',
    tags: { route: context.routePath, routeType: context.routeType },
  });
};
