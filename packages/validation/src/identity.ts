import { LEGAL_DOCUMENT_VERSIONS, LOCALES, getMarket } from '@bambino/config';
import { CONSENT_TYPES } from '@bambino/types';
import { z } from 'zod';

/**
 * Input validation shared by the API (authoritative) and the web and mobile forms
 * (for instant feedback). Messages are translation keys, never English sentences.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** A short list of the most common passwords that meet the length rule. Not a substitute for length. */
const COMMON_PASSWORDS = new Set([
  '1234567890',
  '0123456789',
  'qwertyuiop',
  'password12',
  'password123',
  'password1234',
  'iloveyou12',
  'qwerty1234',
  '1q2w3e4r5t',
  'abcdefghij',
  'bambino123',
  'kigali1234',
]);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'validation.email.too_long')
  .pipe(z.email('validation.email.invalid'));

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, 'validation.password.too_short')
  .max(PASSWORD_MAX_LENGTH, 'validation.password.too_long')
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), 'validation.password.too_common');

/** E.164: plus sign, country code, subscriber number; 8 to 15 digits in total. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'validation.phone.invalid'));

const personName = z.string().trim().min(1, 'validation.name.required').max(80, 'validation.name.too_long');

export const consentSchema = z.object({
  type: z.enum(CONSENT_TYPES),
  documentVersion: z.string().trim().min(1).max(40),
  granted: z.boolean(),
});

/** Consents a customer must give, at the current document version, to create an account. */
export const REQUIRED_REGISTRATION_CONSENTS = [
  'TERMS_OF_SERVICE',
  'PRIVACY_POLICY',
  'CHILD_DATA_PROCESSING',
] as const;

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: personName,
    lastName: personName,
    phone: phoneSchema.nullish(),
    consents: z.array(consentSchema).max(10),
  })
  .superRefine((input, context) => {
    for (const required of REQUIRED_REGISTRATION_CONSENTS) {
      const consent = input.consents.find((candidate) => candidate.type === required);
      if (!consent?.granted || consent.documentVersion !== LEGAL_DOCUMENT_VERSIONS[required]) {
        context.addIssue({
          code: 'custom',
          path: ['consents'],
          message: `validation.consent.required.${required}`,
        });
      }
    }
  });
export type RegisterInput = z.infer<typeof registerSchema>;

/** Login checks shape only; it never reveals whether a password would satisfy the current policy. */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

export const updateProfileSchema = z.object({
  firstName: personName.nullish(),
  lastName: personName.nullish(),
  phone: phoneSchema.nullish(),
  preferredLocale: z.enum(LOCALES).nullish(),
});

const addressText = (max: number) => z.string().trim().max(max).nullish();

/** Address shape is generic; which fields are required comes from the market's address format. */
export const addressSchema = z
  .object({
    label: addressText(40),
    recipientName: personName,
    phone: phoneSchema,
    countryCode: z.string().trim().toUpperCase().length(2),
    region: addressText(80),
    district: addressText(80),
    sector: addressText(80),
    street: addressText(120),
    directions: addressText(300),
    isDefault: z.boolean().nullish(),
  })
  .superRefine((input, context) => {
    let market;
    try {
      market = getMarket(input.countryCode);
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['countryCode'],
        message: 'validation.address.unsupported_country',
      });
      return;
    }
    for (const field of market.addressFormat) {
      if (field.required && !input[field.key]) {
        context.addIssue({ code: 'custom', path: [field.key], message: 'validation.address.field_required' });
      }
    }
  });
export type AddressInput = z.infer<typeof addressSchema>;

/** Opaque single-use tokens from emails: base64url, fixed length. */
export const emailTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'validation.token.invalid');
