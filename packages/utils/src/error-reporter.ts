/**
 * Error tracking behind one small interface, shared by the API and the Next apps. The default reports nothing.
 * The Sentry implementation talks to Sentry's envelope endpoint directly (no SDK), so exactly what leaves the
 * process is visible here: the error's type, message and stack, a request id, the app and environment. Never
 * request bodies, cookies, authorization headers, emails, phone numbers or tokens; `scrub` removes those from
 * anything that is sent.
 */

export interface ErrorContext {
  /** The API request id, or Next's digest, so a report can be matched to the log line. */
  requestId?: string | undefined;
  /** Where it happened, e.g. 'graphql', 'webhook', 'job', 'render'. */
  source?: string;
  /** Extra tags. Scrubbed before sending. */
  tags?: Record<string, string | number | boolean | null | undefined>;
}

export interface ErrorReporter {
  report(error: unknown, context?: ErrorContext): Promise<void>;
}

/** Reports nothing. The default when no DSN is configured. */
export const noopErrorReporter: ErrorReporter = { report: async () => undefined };

const SECRET_KEY =
  /pass(word)?|secret|token|authorization|cookie|session|api[-_]?key|dsn|msisdn|phone|email/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\+?\d[\d\s-]{7,}\d/g;
const BEARER = /bearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Removes personal data and secrets from text: emails, phone numbers, bearer tokens and JWTs. */
export function scrubText(text: string): string {
  return text
    .replace(BEARER, 'Bearer [redacted]')
    .replace(JWT, '[redacted-token]')
    .replace(EMAIL, '[redacted-email]')
    .replace(PHONE, '[redacted-number]');
}

/** Deep copy with secret-looking keys dropped and text values scrubbed. */
export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY.test(key) ? '[redacted]' : scrub(item, depth + 1);
    }
    return out;
  }
  return value;
}

export interface SentryOptions {
  dsn: string;
  /** e.g. 'api', 'web', 'admin'. */
  app: string;
  environment: string;
  release?: string | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
}

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

/** https://<key>@<host>/<projectId> → the project's envelope endpoint. */
export function parseSentryDsn(dsn: string): ParsedDsn {
  const url = new URL(dsn);
  const projectId = url.pathname.replace(/^\//, '');
  if (!url.username || !projectId) throw new Error('Invalid Sentry DSN');
  return { envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`, publicKey: url.username };
}

/** Sends scrubbed error events to Sentry. Failures to report are swallowed: reporting must never break a request. */
export class SentryErrorReporter implements ErrorReporter {
  private readonly dsn: ParsedDsn;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: SentryOptions) {
    this.dsn = parseSentryDsn(options.dsn);
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  /** The event that would be sent (exposed for tests). */
  buildEvent(error: unknown, context: ErrorContext = {}): Record<string, unknown> {
    const err =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Non-error thrown');
    return {
      event_id: crypto.randomUUID().replaceAll('-', ''),
      timestamp: this.now().toISOString(),
      platform: 'javascript',
      level: 'error',
      environment: this.options.environment,
      ...(this.options.release ? { release: this.options.release } : {}),
      tags: scrub({ app: this.options.app, source: context.source, ...context.tags }),
      ...(context.requestId ? { extra: { requestId: context.requestId } } : {}),
      exception: {
        values: [
          {
            type: err.name,
            value: scrubText(err.message),
            ...(err.stack ? { stacktrace: { frames: stackFrames(err.stack) } } : {}),
          },
        ],
      },
    };
  }

  async report(error: unknown, context: ErrorContext = {}): Promise<void> {
    const event = this.buildEvent(error, context);
    const header = { event_id: event.event_id, sent_at: this.now().toISOString(), dsn: this.options.dsn };
    const body = `${JSON.stringify(header)}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
    try {
      await this.fetchImpl(this.dsn.envelopeUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_client=bambino/1.0, sentry_key=${this.dsn.publicKey}`,
        },
        body,
      });
    } catch {
      // Reporting is best effort.
    }
  }
}

/** Sentry wants frames oldest first; file paths only, no source or variables. */
function stackFrames(stack: string): { function: string; filename: string }[] {
  return stack
    .split('\n')
    .slice(1, 40)
    .map((line) => line.trim().replace(/^at\s+/, ''))
    .map((line) => {
      const match = /^(.*?)\s*\((.*)\)$/.exec(line);
      return { function: scrubText(match?.[1] || '?'), filename: scrubText(match?.[2] ?? line) };
    })
    .reverse();
}

/** The Sentry reporter when a DSN is set, otherwise the no-op one. */
export function createErrorReporter(
  options: Omit<SentryOptions, 'dsn'> & { dsn?: string | undefined },
): ErrorReporter {
  return options.dsn ? new SentryErrorReporter({ ...options, dsn: options.dsn }) : noopErrorReporter;
}
