import { SUPPORT_CONTACT } from '@bambino/config';
import { buttonClasses } from '@bambino/ui';
import { Mail, MessageCircle } from 'lucide-react';

const TEXT_LINK = 'inline-block rounded-sm py-1 font-medium text-foreground underline underline-offset-4';

/** The Help page's contact block: who to message, how, and when someone is there. */
export function SupportContact() {
  return (
    <section
      aria-labelledby="support-contact"
      className="flex flex-col gap-4 rounded-md border border-border p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <h2 id="support-contact" className="text-lg font-semibold">
          Need a hand?
        </h2>
        <p className="leading-relaxed text-foreground-muted">
          Have a question about sizes, delivery or your order? Message us on WhatsApp or send us an email.
        </p>
        <p className="leading-relaxed text-foreground-muted">
          We’re available every day, 9:00 AM–9:00 PM, Kigali time.
        </p>
      </div>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <a
          href={SUPPORT_CONTACT.whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClasses({ className: 'gap-2' })}
        >
          <MessageCircle className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Chat on WhatsApp
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a
          href={SUPPORT_CONTACT.emailHref}
          className={buttonClasses({ variant: 'outline', className: 'gap-2' })}
        >
          <Mail className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Email Bambino
        </a>
      </div>
      <dl className="flex flex-col gap-2 border-t border-border pt-4 text-[15px]">
        <div className="grid gap-x-3 sm:grid-cols-[6.5rem_1fr]">
          <dt className="font-semibold">WhatsApp</dt>
          <dd>
            <a
              href={SUPPORT_CONTACT.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className={TEXT_LINK}
            >
              {SUPPORT_CONTACT.whatsappNumber}
            </a>
          </dd>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-[6.5rem_1fr]">
          <dt className="font-semibold">Email</dt>
          <dd className="break-words">
            <a href={SUPPORT_CONTACT.emailHref} className={TEXT_LINK}>
              {SUPPORT_CONTACT.email}
            </a>
          </dd>
        </div>
        <div className="grid gap-x-3 sm:grid-cols-[6.5rem_1fr]">
          <dt className="font-semibold">Hours</dt>
          <dd className="text-foreground-muted">{SUPPORT_CONTACT.hours}</dd>
        </div>
      </dl>
    </section>
  );
}
