import type { Logger } from '../infra/logger';

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
