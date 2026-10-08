'use client';

import { RequestEmailVerificationMutation } from '@bambino/api-client';
import { Alert, Button, MoneyText, Skeleton, StatusBadge, buttonClasses, cn } from '@bambino/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Baby, Bell, ClipboardList, RefreshCw, Shirt, Truck } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { api } from '@/lib/browser-api';
import { errorMessage, formatDate, notificationText } from '@/lib/messages';
import {
  useBabies,
  useCredits,
  useGarments,
  useNotifications,
  useOrders,
  useSubscriptions,
} from '@/lib/queries';
import { useSession } from '@/lib/session';
import { PageTitle } from './account-nav';

function VerifyEmailBanner() {
  const resend = useMutation({ mutationFn: () => api.request(RequestEmailVerificationMutation) });
  return (
    <Alert
      tone="warning"
      title="Please confirm your email address"
      action={
        resend.isSuccess ? (
          <p className="text-sm font-medium">Sent. Check your inbox.</p>
        ) : (
          <Button size="sm" variant="outline" loading={resend.isPending} onClick={() => resend.mutate()}>
            Send the link again
          </Button>
        )
      }
    >
      We sent you a link when you signed up. {resend.isError ? errorMessage(resend.error) : null}
    </Alert>
  );
}

/** One dashboard card: icon, title, body and a single next action. Shows a skeleton while its data loads. */
function DashCard({
  icon,
  title,
  loading,
  error,
  action,
  tone = 'default',
  className,
  children,
}: {
  icon: ReactNode;
  title: string;
  loading: boolean;
  error?: unknown;
  action?: { href: string; label: string };
  tone?: 'default' | 'feature';
  className?: string;
  children: ReactNode;
}) {
  const feature = tone === 'feature';
  return (
    <section
      aria-label={title}
      className={cn(
        'flex h-full flex-col gap-4 rounded-[1.5rem] p-6',
        feature ? 'bg-primary text-primary-foreground' : 'border border-border bg-surface',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-10 items-center justify-center rounded-xl',
            feature ? 'bg-brand-700 text-accent' : 'bg-brand-50 text-brand-700',
          )}
        >
          {icon}
        </span>
        <h2
          className={cn(
            'font-display text-lg font-bold',
            feature ? 'text-primary-foreground' : 'text-primary',
          )}
        >
          {title}
        </h2>
      </div>
      <div className="flex-1">
        {loading ? (
          <Skeleton className="h-16" />
        ) : error ? (
          <p className={feature ? 'text-brand-100' : 'text-foreground-muted'}>{errorMessage(error)}</p>
        ) : (
          children
        )}
      </div>
      {action ? (
        <NextLink
          href={action.href}
          className={cn(
            'inline-flex w-fit items-center gap-1.5 text-sm font-semibold underline underline-offset-4 hover:decoration-2',
            feature ? 'text-accent-200' : 'text-link',
          )}
        >
          {action.label} <ArrowRight aria-hidden="true" className="size-4" />
        </NextLink>
      ) : null}
    </section>
  );
}

const ACTIVE_DELIVERY = ['PAID', 'PROCESSING', 'PACKED', 'READY_FOR_DISPATCH', 'OUT_FOR_DELIVERY'];

export default function DashboardPage() {
  const { viewer } = useSession();
  const babies = useBabies();
  const subscriptions = useSubscriptions();
  const orders = useOrders();
  const credits = useCredits();
  const garments = useGarments();
  const notifications = useNotifications();

  const firstBaby = babies.data?.[0];
  const recommendation = firstBaby?.latestRecommendation ?? null;
  const subscription = subscriptions.data?.find((s) => !['CANCELLED', 'EXPIRED'].includes(s.status));
  const withYou = (garments.data ?? []).filter((g) => g.status === 'WITH_CUSTOMER');
  const outgrown = recommendation
    ? withYou.filter((g) => g.size.sortOrder < recommendation.recommendedSize.sortOrder)
    : [];
  const activeOrder = orders.data?.find((o) => ACTIVE_DELIVERY.includes(o.status));

  return (
    <>
      <PageTitle
        title={`Hello, ${viewer?.firstName ?? ''}`}
        description="Your baby’s wardrobe at a glance."
      />
      {viewer && !viewer.emailVerified ? <VerifyEmailBanner /> : null}

      <Stagger className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <StaggerItem className="md:col-span-2 xl:col-span-1">
          <DashCard
            tone="feature"
            icon={<RefreshCw className="size-5" />}
            title="Next exchange"
            loading={babies.isPending || garments.isPending}
            error={babies.error ?? garments.error}
            action={{
              href: '/dashboard/exchange',
              label: outgrown.length > 0 ? 'Return outgrown pieces' : 'Returns & exchanges',
            }}
          >
            {recommendation ? (
              <div className="flex flex-col gap-2">
                <p className="font-display text-2xl font-semibold">
                  {outgrown.length > 0
                    ? `${outgrown.length} ${outgrown.length === 1 ? 'piece is' : 'pieces are'} smaller than ${recommendation.recommendedSize.label}`
                    : recommendation.nextSize
                      ? `Next size: ${recommendation.nextSize.label}`
                      : `Size ${recommendation.recommendedSize.label}`}
                </p>
                <p className="text-sm text-brand-100">
                  Based on {firstBaby?.nickname}’s latest recommendation (
                  {formatDate(recommendation.createdAt)}).
                </p>
              </div>
            ) : (
              <p className="text-brand-100">Add your baby’s measurements to see when the next size is due.</p>
            )}
          </DashCard>
        </StaggerItem>

        <StaggerItem>
          <DashCard
            icon={<ClipboardList className="size-5" />}
            title="Your plan"
            loading={subscriptions.isPending}
            error={subscriptions.error}
            action={
              subscription
                ? { href: '/dashboard/subscription', label: 'Manage plan' }
                : { href: '/plans', label: 'Explore plans' }
            }
          >
            {subscription ? (
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {subscription.plan.name} <StatusBadge status={subscription.status} />
                </p>
                <p className="text-sm text-foreground-muted">
                  {subscription.status === 'PENDING'
                    ? 'Starts when the first payment is confirmed.'
                    : `Current period ends ${formatDate(subscription.currentPeriodEnd)}.`}
                </p>
              </div>
            ) : (
              <p className="text-foreground-muted">No active subscription yet.</p>
            )}
          </DashCard>
        </StaggerItem>

        <StaggerItem>
          <DashCard
            icon={<Baby className="size-5" />}
            title="Baby profile"
            loading={babies.isPending}
            error={babies.error}
            action={
              firstBaby
                ? { href: '/dashboard/baby', label: 'Sizes and growth' }
                : { href: '/fit', label: 'Find the right fit' }
            }
          >
            {firstBaby ? (
              <ul className="flex flex-col gap-2">
                {(babies.data ?? []).map((baby) => (
                  <li key={baby.id} className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{baby.nickname}</span>
                    <span className="text-sm text-foreground-muted">
                      {baby.latestRecommendation
                        ? `Size ${baby.latestRecommendation.recommendedSize.label}`
                        : 'No size yet'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">Add your baby to get a size recommendation.</p>
            )}
          </DashCard>
        </StaggerItem>

        <StaggerItem>
          <DashCard
            icon={<Shirt className="size-5" />}
            title="Wardrobe"
            loading={garments.isPending}
            error={garments.error}
            action={{ href: '/dashboard/wardrobe', label: 'Open wardrobe' }}
          >
            <p className="font-display text-3xl font-semibold text-primary">{withYou.length}</p>
            <p className="text-sm text-foreground-muted">
              {withYou.length === 1 ? 'piece with you now' : 'pieces with you now'}
            </p>
          </DashCard>
        </StaggerItem>

        <StaggerItem>
          <DashCard
            icon={<Truck className="size-5" />}
            title="Delivery"
            loading={orders.isPending}
            error={orders.error}
            action={
              activeOrder
                ? { href: `/dashboard/orders/${activeOrder.id}`, label: 'Track delivery' }
                : { href: '/dashboard/orders', label: 'All orders' }
            }
          >
            {activeOrder ? (
              <div className="flex flex-col gap-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{activeOrder.orderNumber}</span>{' '}
                  <StatusBadge status={activeOrder.status} />
                </p>
                <p className="text-sm text-foreground-muted">Placed {formatDate(activeOrder.placedAt)}</p>
              </div>
            ) : (
              <p className="text-foreground-muted">Nothing on its way right now.</p>
            )}
          </DashCard>
        </StaggerItem>

        <StaggerItem>
          <DashCard
            icon={<RefreshCw className="size-5" />}
            title="Exchange credit"
            loading={credits.isPending}
            error={credits.error}
          >
            <p className="font-display text-3xl font-semibold text-primary">
              {credits.data ? <MoneyText value={credits.data.balance} /> : '—'}
            </p>
            <p className="text-sm text-foreground-muted">Earned when returned pieces pass inspection.</p>
          </DashCard>
        </StaggerItem>

        <StaggerItem className="md:col-span-2 xl:col-span-3">
          <DashCard
            icon={<Bell className="size-5" />}
            title="Notifications"
            loading={notifications.isPending}
            error={notifications.error}
          >
            {notifications.data && notifications.data.edges.length > 0 ? (
              <ul className="flex flex-col gap-2 text-sm">
                {notifications.data.edges.slice(0, 5).map(({ node }) => (
                  <li key={node.id} className="flex justify-between gap-3">
                    <span className={node.read ? 'text-foreground-muted' : 'font-semibold'}>
                      {notificationText(node.type)}
                    </span>
                    <span className="shrink-0 text-foreground-muted">{formatDate(node.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">Nothing new.</p>
            )}
          </DashCard>
        </StaggerItem>
      </Stagger>

      {!subscription && !subscriptions.isPending ? (
        <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'w-fit gap-2' })}>
          Find the right fit to get started <ArrowRight aria-hidden="true" className="size-5" />
        </NextLink>
      ) : null}
    </>
  );
}
