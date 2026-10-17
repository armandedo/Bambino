import type { Env } from '../config/env';
import type { Logger } from '../infra/logger';
import { ConsoleEmailProvider, type EmailProvider, ResendEmailProvider } from './email';

/** One place that turns configuration into an email provider, shared by the Node server and the Worker. */
export function createEmailProvider(env: Env, logger: Logger): EmailProvider {
  if (env.EMAIL_PROVIDER === 'resend') {
    if (!env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
    return new ResendEmailProvider({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  return new ConsoleEmailProvider(logger);
}
