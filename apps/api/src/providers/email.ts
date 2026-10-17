import type { Logger } from '../infra/logger';
import { renderEmail } from './email-templates';

export type EmailTemplate =
  | 'auth.verify_email'
  | 'auth.password_reset'
  | 'auth.password_changed'
  | 'privacy.export_ready'
  | 'privacy.account_deleted';

/** Templates are rendered by the provider in the recipient's locale; services never build email text. */
export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  locale: string;
  params: Record<string, string>;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * MOCKED: writes the message to the log instead of sending it, so links can be
 * followed in development. Startup refuses this provider in production.
 */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly logger: Logger) {}

  async send(message: EmailMessage): Promise<void> {
    this.logger.info('email (console provider, not sent)', {
      to: message.to,
      template: message.template,
      locale: message.locale,
      link: message.params.link,
    });
  }
}

export interface ResendEmailOptions {
  apiKey: string;
  /** "Bambino <hello@your-domain>": the domain must be verified in Resend (SPF and DKIM records). */
  from: string;
  fetch?: typeof fetch;
  /** Overridable for tests. */
  endpoint?: string;
}

/**
 * Sends through Resend's HTTP API with plain `fetch`, so it runs on Node and on Cloudflare Workers alike.
 *
 * It throws when Resend refuses or cannot be reached. Callers already treat a failed email as non-fatal (the account
 * change has committed; the person can ask again), so the failure is logged there, never the API key: the error text
 * carries the HTTP status and Resend's own message only.
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly doFetch: typeof fetch;
  private readonly endpoint: string;

  constructor(private readonly options: ResendEmailOptions) {
    this.doFetch = options.fetch ?? fetch;
    this.endpoint = options.endpoint ?? 'https://api.resend.com/emails';
  }

  async send(message: EmailMessage): Promise<void> {
    const { subject, text, html } = renderEmail(message);
    const response = await this.doFetch(this.endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.options.from, to: [message.to], subject, text, html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      let detail = '';
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === 'string') detail = `: ${body.message.slice(0, 200)}`;
      } catch {
        // No JSON body; the status says enough.
      }
      throw new Error(`Resend refused the email (HTTP ${response.status})${detail}`);
    }
  }
}

/** Test double that records messages. */
export class MemoryEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }

  lastTo(to: string, template: EmailTemplate): EmailMessage | undefined {
    return this.sent.filter((message) => message.to === to && message.template === template).at(-1);
  }
}
