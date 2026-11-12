'use client';

import { RequestEmailVerificationMutation } from '@bambino/api-client';
import { Alert, Button, Skeleton, StatusBadge, buttonClasses, cn } from '@bambino/ui';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Baby, Bell, ShoppingBag, Truck } from 'lucide-react';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
import { Stagger, StaggerItem } from '@/components/motion/primitives';
import { api } from '@/lib/browser-api';
import { errorMessage, formatDate, notificationText } from '@/lib/messages';
import { useBabies, useNotifications, useOrders } from '@/lib/queries';
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
            'font-display text-lg font-semibold',
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
  const orders = useOrders();
  const notifications = useNotifications();
  const activeOrder = orders.data?.find((order) => ACTIVE_DELIVERY.includes(order.status));
  return (
    <>
      <PageTitle
        title={`Hello${viewer?.firstName ? `, ${viewer.firstName}` : ''}`}
        description="Your little corner of Bambino. Find your orders and saved sizes here."
      />
      {viewer && !viewer.emailVerified ? <VerifyEmailBanner /> : null}
      <Stagger className="grid gap-5 md:grid-cols-2">
        <StaggerItem>
          <DashCard
            icon={<ShoppingBag className="size-5" />}
            title="Your orders"
            loading={orders.isPending}
            error={orders.error}
            action={{ href: '/dashboard/orders', label: 'View all orders' }}
          >
            <p className="font-display text-3xl font-semibold">{orders.data?.length ?? 0}</p>
            <p className="mt-2 text-sm text-foreground-muted">All your little finds, in one place.</p>
          </DashCard>
        </StaggerItem>
        <StaggerItem>
          <DashCard
            icon={<Truck className="size-5" />}
            title="On its way"
            loading={orders.isPending}
            error={orders.error}
            action={
              activeOrder
                ? { href: `/dashboard/orders/${activeOrder.id}`, label: 'Follow this order' }
                : { href: '/shop', label: 'Explore the shop' }
            }
          >
            {activeOrder ? (
              <>
                <p className="mb-3 font-mono text-sm">{activeOrder.orderNumber}</p>
                <StatusBadge status={activeOrder.status} />
                <p className="mt-2 text-sm text-foreground-muted">
                  Placed {formatDate(activeOrder.placedAt)}
                </p>
              </>
            ) : (
              <p className="text-foreground-muted">Nothing on its way just yet.</p>
            )}
          </DashCard>
        </StaggerItem>
        <StaggerItem>
          <DashCard
            icon={<Baby className="size-5" />}
            title="Their saved sizes"
            loading={babies.isPending}
            error={babies.error}
            action={{ href: '/dashboard/baby', label: 'Baby profiles & sizes' }}
          >
            {babies.data?.length ? (
              <ul className="flex flex-col gap-2">
                {babies.data.map((baby) => (
                  <li key={baby.id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">{baby.nickname}</span>
                    <span className="text-sm text-foreground-muted">
                      {baby.latestRecommendation
                        ? `Size ${baby.latestRecommendation.recommendedSize.label}`
                        : 'Find their size'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">Add your baby’s measurements for a size suggestion.</p>
            )}
          </DashCard>
        </StaggerItem>
        <StaggerItem>
          <DashCard
            icon={<Bell className="size-5" />}
            title="A little update"
            loading={notifications.isPending}
            error={notifications.error}
          >
            {notifications.data?.edges.length ? (
              <ul className="flex flex-col gap-3 text-sm">
                {notifications.data.edges.slice(0, 5).map(({ node }) => (
                  <li key={node.id}>
                    <span className={node.read ? 'text-foreground-muted' : 'font-medium'}>
                      {notificationText(node.type)}
                    </span>
                    <span className="mt-1 block text-xs text-foreground-muted">
                      {formatDate(node.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">You’re all caught up.</p>
            )}
          </DashCard>
        </StaggerItem>
      </Stagger>
      <NextLink href="/shop" className={buttonClasses({ className: 'w-fit' })}>
        Find their next favourite <ArrowRight className="size-4" aria-hidden="true" />
      </NextLink>
    </>
  );
}
