'use client';

import { MoneyText, Skeleton, StatusBadge, buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import NextLink from 'next/link';
import { Reveal } from '@/components/motion/primitives';
import { useCredits, useExchanges, useGarments, useReturns } from '@/lib/queries';
import { useSession } from '@/lib/session';

/** For signed-in parents: what they hold, what is returnable now, and anything in progress. */
function SignedInPanel() {
  const garments = useGarments();
  const returns = useReturns();
  const exchanges = useExchanges();
  const credits = useCredits();
  if (garments.isPending || returns.isPending || exchanges.isPending || credits.isPending) {
    return <Skeleton className="h-48 rounded-2xl" />;
  }
  const held = garments.data ?? [];
  const eligible = held.filter((g) => g.status === 'WITH_CUSTOMER');
  const openReturns = (returns.data ?? []).filter((r) => !['COMPLETED', 'REJECTED'].includes(r.status));
  const openExchanges = (exchanges.data ?? []).filter(
    (e) => !['COMPLETED', 'REJECTED', 'CANCELLED'].includes(e.status),
  );
  return (
    <div className="grid gap-6 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex flex-col gap-5">
        <h2 className="font-display text-2xl font-semibold text-primary">Your exchanges</h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-brand-50 p-4">
            <dt className="text-sm text-foreground-muted">Ready to return</dt>
            <dd className="font-display text-3xl font-semibold text-primary">{eligible.length}</dd>
          </div>
          <div className="rounded-2xl bg-surface-muted p-4">
            <dt className="text-sm text-foreground-muted">In progress</dt>
            <dd className="font-display text-3xl font-semibold text-primary">
              {openReturns.length + openExchanges.length}
            </dd>
          </div>
          <div className="rounded-2xl bg-accent-50 p-4">
            <dt className="text-sm text-accent-soft-foreground">Exchange credit</dt>
            <dd className="font-display text-3xl font-semibold text-primary">
              {credits.data ? <MoneyText value={credits.data.balance} /> : '—'}
            </dd>
          </div>
        </dl>
        {openReturns.length > 0 ? (
          <ul className="flex flex-wrap gap-2 text-sm">
            {openReturns.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1">
                <span className="font-mono">{r.returnNumber}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <NextLink href="/dashboard/exchange" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
        {eligible.length > 0 ? 'Start a return' : 'Open your exchanges'}{' '}
        <ArrowRight aria-hidden="true" className="size-5" />
      </NextLink>
    </div>
  );
}

export function ExchangePanel() {
  const { viewer, loading } = useSession();
  if (loading) return <Skeleton className="h-48 rounded-2xl" />;
  return (
    <Reveal>
      {viewer ? (
        <SignedInPanel />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-accent-50 p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold text-primary">Already a subscriber?</h2>
          <p className="text-foreground-muted">Sign in to see the pieces you have and start a return.</p>
          <NextLink href="/login?next=/dashboard/exchange" className={buttonClasses()}>
            Sign in
          </NextLink>
        </div>
      )}
    </Reveal>
  );
}
