import type { BillingInterval, PlanSummary } from '@bambino/api-client';
import { Badge, Card, MoneyText, buttonClasses, cn } from '@bambino/ui';
import NextLink from 'next/link';

const PER: Record<BillingInterval, string> = { MONTHLY: 'month', QUARTERLY: '3 months', ANNUAL: 'year' };

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
    <Card
      as="article"
      className={cn(
        'relative flex flex-col gap-4',
        featured && 'border-primary shadow-md ring-1 ring-primary',
      )}
    >
      {featured ? (
        <Badge tone="accent" className="absolute -top-3 left-6">
          Most flexible
        </Badge>
      ) : null}
      <Heading className="font-display text-xl font-bold">{plan.name}</Heading>
      <p>
        <MoneyText value={plan.price} className="font-display text-4xl font-extrabold" />
        <span className="text-foreground-muted"> / {PER[plan.billingInterval]}</span>
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li className="flex gap-2">
          <Check />
          {plan.itemsPerCycle} {plan.itemsPerCycle === 1 ? 'item' : 'items'} each cycle, chosen in your
          baby&apos;s size
        </li>
        <li className="flex gap-2">
          <Check />
          {plan.exchangesPerCycle === null
            ? 'Unlimited size exchanges'
            : `${plan.exchangesPerCycle} size ${plan.exchangesPerCycle === 1 ? 'exchange' : 'exchanges'} per cycle`}
        </li>
        <li className="flex gap-2">
          <Check />
          Pause or cancel from your account
        </li>
      </ul>
      <p className="text-sm text-foreground-muted">{plan.description}</p>
      <NextLink
        href={`/account/subscription/new?plan=${encodeURIComponent(plan.code)}`}
        className={buttonClasses({
          variant: featured ? 'primary' : 'outline',
          fullWidth: true,
          className: 'mt-auto',
        })}
      >
        Choose this plan
      </NextLink>
    </Card>
  );
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 size-4 shrink-0 text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
    >
      <path d="m4.5 10.5 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
