/**
 * How customers reach Bambino. One place, so the Help page and the footer always agree.
 * This is customer support only; it is not the sender of order and account emails (EMAIL_FROM on the API).
 */
const EMAIL = 'shopbambinorw@gmail.com';
/** International format without "+" or spaces, as wa.me needs it. */
const WHATSAPP_DIGITS = '250722165783';

export const SUPPORT_CONTACT = {
  email: EMAIL,
  emailHref: `mailto:${EMAIL}`,
  whatsappNumber: '+250 722 165 783',
  /** Opens a chat with nothing typed: no `text` parameter, so nothing is sent or pre-filled. */
  whatsappHref: `https://wa.me/${WHATSAPP_DIGITS}`,
  hours: 'Monday–Sunday, 9:00 AM–9:00 PM, Kigali time (CAT)',
  hoursShort: 'Every day, 9:00 AM–9:00 PM, Kigali time',
} as const;
