import type { BillingInterval, PlanSummary } from '@bambino/api-client';
import { MoneyText, buttonClasses, cn } from '@bambino/ui';
import { Check } from 'lucide-react';
import NextLink from 'next/link';

const PER: Record<BillingInterval, string> = { MONTHLY: 'month', QUARTERLY: '3 months', ANNUAL: 'year' };

/** One plan. Name, price, items and exchanges all come from the API; nothing here is computed client-side. */
export function PlanCard({
  plan,
  featured = false,
  level = 3,
}: {
  plan: PlanSummary;
  featured?: boolean;
  level?: 2 | 3;
}) {
  const Heading = `h${level}` as const;
  return (
    <article
      className={cn(
        'group relative flex h-full flex-col gap-6 rounded-[1.75rem] p-7 transition-[transform,box-shadow] duration-500 ease-brand focus-within:-translate-y-1 hover:-translate-y-1',
        featured
          ? 'bg-primary text-primary-foreground shadow-lg'
          : 'border border-border bg-surface text-foreground shadow-xs hover:shadow-md',
      )}
    >
      {featured ? (
        <span className="absolute -top-3 left-7 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-foreground">
          Most flexible
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        <Heading
          className={cn(
            'font-display text-xl font-bold',
            featured ? 'text-primary-foreground' : 'text-primary',
          )}
        >
          {plan.name}
        </Heading>
        <p>
          <MoneyText value={plan.price} className="font-display text-4xl font-extrabold tracking-tight" />
          <span className={featured ? 'text-brand-100' : 'text-foreground-muted'}>
            {' '}
            / {PER[plan.billingInterval]}
          </span>
        </p>
      </div>
      <ul className="flex flex-col gap-3 text-sm">
        {[
          `${plan.itemsPerCycle} ${plan.itemsPerCycle === 1 ? 'piece' : 'pieces'} each cycle, in your baby’s size`,
          plan.exchangesPerCycle === null
            ? 'Unlimited size exchanges'
            : `${plan.exchangesPerCycle} size ${plan.exchangesPerCycle === 1 ? 'exchange' : 'exchanges'} per cycle`,
          'Pause or cancel from your account',
        ].map((line) => (
          <li key={line} className="flex gap-2">
            <Check
              aria-hidden="true"
              className={cn('mt-0.5 size-4 shrink-0', featured ? 'text-accent' : 'text-brand-500')}
              strokeWidth={2.5}
            />
            {line}
          </li>
        ))}
      </ul>
      <p className={cn('text-sm', featured ? 'text-brand-100' : 'text-foreground-muted')}>
        {plan.description}
      </p>
      <NextLink
        href={`/dashboard/subscription/new?plan=${encodeURIComponent(plan.code)}`}
        className={buttonClasses({
          variant: featured ? 'accent' : 'primary',
          fullWidth: true,
          className: 'mt-auto',
        })}
      >
        Choose this plan
        <span className="sr-only">: {plan.name}</span>
      </NextLink>
    </article>
  );
}
