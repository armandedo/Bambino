import { describe, expect, it } from 'vitest';
import { ResendEmailProvider } from './email';
import { renderEmail } from './email-templates';
import type { EmailTemplate } from './email';

const ALL: EmailTemplate[] = [
  'auth.verify_email',
  'auth.password_reset',
  'auth.password_changed',
  'privacy.export_ready',
  'privacy.account_deleted',
];
const LINK = 'https://bambino.example/verify-email?token=abc_DEF-123';

describe('email templates', () => {
  it('renders every template with a subject, plain text and HTML', () => {
    for (const template of ALL) {
      const email = renderEmail({ template, params: { link: LINK } });
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.text).toContain('Bambino');
      expect(email.html).toContain('<!doctype html>');
    }
  });

  it('puts the link in the text and in the button of an email that has an action', () => {
    const email = renderEmail({ template: 'auth.verify_email', params: { link: LINK } });
    expect(email.text).toContain(LINK);
    expect(email.html).toContain(`href="${LINK}"`);
  });

  it('shows no button for an account-deleted email, even if a link is given', () => {
    const email = renderEmail({ template: 'privacy.account_deleted', params: { link: LINK } });
    expect(email.html).not.toContain('href=');
    expect(email.text).not.toContain(LINK);
  });

  it('refuses a link that is not http(s), so a crafted value cannot become a javascript: link', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', '']) {
      const email = renderEmail({ template: 'auth.password_reset', params: { link: bad } });
      expect(email.html).not.toContain('href=');
      expect(email.text).not.toContain(bad || 'zzz-never');
    }
  });

  it('escapes HTML in the link', () => {
    const email = renderEmail({
      template: 'auth.password_reset',
      params: { link: 'https://bambino.example/reset?token=a"><script>x</script>' },
    });
    expect(email.html).not.toContain('<script>');
  });
});

describe('Resend email provider', () => {
  function provider(respond: (init: RequestInit, url: string) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(init, url);
    }) as unknown as typeof fetch;
    return {
      calls,
      provider: new ResendEmailProvider({
        apiKey: 're_test_key_123456',
        from: 'Bambino <hello@bambino.example>',
        fetch: fetchImpl,
      }),
    };
  }
  const message = {
    to: 'parent@example.com',
    template: 'auth.verify_email' as const,
    locale: 'en',
    params: { link: LINK },
  };

  it('posts the rendered message to Resend with the key in the authorization header only', async () => {
    const { provider: p, calls } = provider(() => new Response('{"id":"x"}', { status: 200 }));
    await p.send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get('authorization')).toBe('Bearer re_test_key_123456');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body.from).toBe('Bambino <hello@bambino.example>');
    expect(body.to).toEqual(['parent@example.com']);
    expect(body.subject).toBe('Confirm your email for Bambino');
    expect(String(body.html)).toContain(LINK);
    expect(JSON.stringify(body)).not.toContain('re_test_key_123456');
  });

  it('throws with the status and Resend message, and never with the key', async () => {
    const { provider: p } = provider(
      () => new Response('{"message":"The domain is not verified"}', { status: 403 }),
    );
    const error = await p.send(message).then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(error?.message).toBe('Resend refused the email (HTTP 403): The domain is not verified');
    expect(error?.message).not.toContain('re_test_key');
  });

  it('still reports the status when the error has no JSON body', async () => {
    const { provider: p } = provider(() => new Response('upstream error', { status: 502 }));
    await expect(p.send(message)).rejects.toThrow('Resend refused the email (HTTP 502)');
  });
});
