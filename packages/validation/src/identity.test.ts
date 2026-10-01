import { LEGAL_DOCUMENT_VERSIONS } from '@bambino/config';
import { describe, expect, it } from 'vitest';
import { addressSchema, emailSchema, passwordSchema, phoneSchema, registerSchema } from './identity';

const consents = (['TERMS_OF_SERVICE', 'PRIVACY_POLICY', 'CHILD_DATA_PROCESSING'] as const).map((type) => ({
  type,
  documentVersion: LEGAL_DOCUMENT_VERSIONS[type],
  granted: true,
}));

const validRegistration = {
  email: '  Parent@Example.RW ',
  password: 'a-long-enough-secret',
  firstName: 'Aline',
  lastName: 'Uwase',
  consents,
};

describe('identity validation', () => {
  it('normalises email to trimmed lower case', () => {
    expect(emailSchema.parse('  Parent@Example.RW ')).toBe('parent@example.rw');
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });

  it('enforces password length and rejects common passwords', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false);
    expect(passwordSchema.safeParse('Password123').success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
    expect(passwordSchema.safeParse('correct horse battery').success).toBe(true);
  });

  it('accepts E.164 phone numbers after stripping formatting', () => {
    expect(phoneSchema.parse('+250 788 123 456')).toBe('+250788123456');
    expect(phoneSchema.safeParse('0788123456').success).toBe(false);
  });

  it('requires every mandatory consent at the current document version', () => {
    expect(registerSchema.safeParse(validRegistration).success).toBe(true);
    const missing = registerSchema.safeParse({ ...validRegistration, consents: consents.slice(0, 2) });
    expect(missing.success).toBe(false);
    const stale = registerSchema.safeParse({
      ...validRegistration,
      consents: consents.map((consent) => ({ ...consent, documentVersion: 'old' })),
    });
    expect(stale.success).toBe(false);
    const refused = registerSchema.safeParse({
      ...validRegistration,
      consents: consents.map((consent) => ({ ...consent, granted: false })),
    });
    expect(refused.success).toBe(false);
  });

  it('applies the market address format', () => {
    const address = {
      recipientName: 'Aline Uwase',
      phone: '+250788123456',
      countryCode: 'rw',
      region: 'Kigali',
      district: 'Gasabo',
      sector: 'Kimironko',
    };
    expect(addressSchema.parse(address).countryCode).toBe('RW');
    const noSector = addressSchema.safeParse({ ...address, sector: '' });
    expect(noSector.success).toBe(false);
    expect(addressSchema.safeParse({ ...address, countryCode: 'FR' }).success).toBe(false);
  });
});
