import { describe, expect, it } from 'vitest';
import { SUPPORT_CONTACT } from './support';

describe('customer support contact', () => {
  it('links WhatsApp to the number shown, with no message filled in', () => {
    expect(SUPPORT_CONTACT.whatsappHref).toBe('https://wa.me/250722165783');
    expect(SUPPORT_CONTACT.whatsappHref).not.toContain('text=');
    expect(SUPPORT_CONTACT.whatsappNumber.replace(/\D/g, '')).toBe('250722165783');
  });

  it('links email to the address shown', () => {
    expect(SUPPORT_CONTACT.emailHref).toBe(`mailto:${SUPPORT_CONTACT.email}`);
    expect(SUPPORT_CONTACT.email).toBe('shopbambinorw@gmail.com');
  });
});
