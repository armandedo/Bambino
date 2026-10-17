import type { EmailMessage, EmailTemplate } from './email';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

interface Copy {
  subject: string;
  heading: string;
  body: string;
  /** Button label; omitted for emails with no action. */
  action?: string;
  /** Said after the button. */
  footnote?: string;
}

/**
 * English copy for each template. A message in another locale falls back to English until translations exist
 * (the API stores `preferredLocale`; Kinyarwanda and French copy is a content task, not a code one).
 */
const EN: Record<EmailTemplate, Copy> = {
  'auth.verify_email': {
    subject: 'Confirm your email for Bambino',
    heading: 'Confirm your email',
    body: 'Welcome to Bambino. Please confirm this is your email address so we can reach you about your orders.',
    action: 'Confirm my email',
    footnote: 'The link works for 24 hours. If you did not create an account, you can ignore this message.',
  },
  'auth.password_reset': {
    subject: 'Reset your Bambino password',
    heading: 'Reset your password',
    body: 'We received a request to reset your password. Use the button below to choose a new one.',
    action: 'Choose a new password',
    footnote:
      'The link works for 1 hour and can be used once. If you did not ask for this, ignore this message: your password has not changed.',
  },
  'auth.password_changed': {
    subject: 'Your Bambino password was changed',
    heading: 'Your password was changed',
    body: 'The password on your Bambino account was just changed, and you were signed out of other devices.',
    action: 'Review my account',
    footnote: 'If this was not you, reset your password straight away and contact us.',
  },
  'privacy.export_ready': {
    subject: 'Your Bambino data export is ready',
    heading: 'Your data export is ready',
    body: 'You asked for a copy of your data. Sign in to download it. For your safety the download link is only issued after you sign in, and it expires after a few minutes.',
    action: 'Go to my account',
    footnote: 'The file is deleted from our servers after 7 days.',
  },
  'privacy.account_deleted': {
    subject: 'Your Bambino account was deleted',
    heading: 'Your account was deleted',
    body: 'As you asked, your Bambino account and personal details were deleted. Records we are required to keep, such as payments, were made anonymous.',
    footnote: 'Thank you for having been part of Bambino.',
  },
};

const NAVY = '#16213A';
const YELLOW = '#F2D14B';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** A link we are willing to put in an email: an http(s) address, nothing else (no javascript: or data: links). */
function safeLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function renderEmail(message: Pick<EmailMessage, 'template' | 'params'>): RenderedEmail {
  const copy = EN[message.template];
  const link = safeLink(message.params.link);

  const text = [
    copy.heading,
    '',
    copy.body,
    ...(copy.action && link ? ['', `${copy.action}: ${link}`] : []),
    ...(copy.footnote ? ['', copy.footnote] : []),
    '',
    'Bambino, clothes that keep up with your baby.',
  ].join('\n');

  const button =
    copy.action && link
      ? `<p style="margin:28px 0"><a href="${escapeHtml(link)}" style="background:${YELLOW};color:${NAVY};text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:14px;padding:14px 28px;border-radius:999px;display:inline-block">${escapeHtml(copy.action)}</a></p>
<p style="font-size:13px;color:#4f565b;word-break:break-all">If the button does not work, copy this address into your browser:<br>${escapeHtml(link)}</p>`
      : '';

  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f2f4f5;font-family:Arial,Helvetica,sans-serif;color:${NAVY}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:15px;border:1px solid #e1e4e6">
<tr><td style="padding:20px 28px;background:${NAVY};border-radius:15px 15px 0 0;color:#ffffff;font-weight:700;font-size:18px;letter-spacing:.04em">bambino</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3">${escapeHtml(copy.heading)}</h1>
<p style="margin:0;font-size:16px;line-height:1.6">${escapeHtml(copy.body)}</p>
${button}
${copy.footnote ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#4f565b">${escapeHtml(copy.footnote)}</p>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#6f777d;margin:16px 0 0">Bambino, clothes that keep up with your baby.</p>
</td></tr></table></body></html>`;

  return { subject: copy.subject, text, html };
}
