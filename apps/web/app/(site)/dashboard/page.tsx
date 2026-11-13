'use client';

import { RequestEmailVerificationMutation } from '@bambino/api-client';
import { Alert, Button, Skeleton, StatusBadge, buttonClasses } from '@bambino/ui';
import { useMutation } from '@tanstack/react-query';
import NextLink from 'next/link';
import type { ReactNode } from 'react';
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

/** One block of the overview: a heading, its content and one link. Shows a skeleton while its data loads. */
function Block({
  title,
  loading,
  error,
  action,
  children,
}: {
  title: string;
  loading: boolean;
  error?: unknown;
  action?: { href: string; label: string } | undefined;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {action ? (
          <NextLink
            href={action.href}
            className="text-sm font-medium text-link underline underline-offset-4 hover:decoration-2"
          >
            {action.label}
          </NextLink>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-14" />
      ) : error ? (
        <p className="text-sm text-foreground-muted">{errorMessage(error)}</p>
      ) : (
        children
      )}
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
  const orderCount = orders.data?.length ?? 0;

  return (
    <>
      <PageTitle
        title={`Hello${viewer?.firstName ? `, ${viewer.firstName}` : ''}`}
        action={
          <NextLink href="/shop" className={buttonClasses({ size: 'sm' })}>
            Keep shopping
          </NextLink>
        }
      />
      {viewer && !viewer.emailVerified ? <VerifyEmailBanner /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Block
          title="On its way"
          loading={orders.isPending}
          error={orders.error}
          action={
            activeOrder
              ? { href: `/dashboard/orders/${activeOrder.id}`, label: 'Follow this order' }
              : undefined
          }
        >
          {activeOrder ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="font-medium">{activeOrder.orderNumber}</span>
              <StatusBadge status={activeOrder.status} />
              <span className="text-foreground-muted">Placed {formatDate(activeOrder.placedAt)}</span>
            </div>
          ) : (
            <p className="text-sm text-foreground-muted">Nothing is on its way right now.</p>
          )}
        </Block>
        <Block
          title="Your orders"
          loading={orders.isPending}
          error={orders.error}
          action={{ href: '/dashboard/orders', label: 'View all orders' }}
        >
          <p className="text-sm text-foreground-muted">
            {orderCount === 0
              ? 'You have not placed an order yet.'
              : `${orderCount} ${orderCount === 1 ? 'order' : 'orders'} so far.`}
          </p>
        </Block>
        <Block
          title="Saved sizes"
          loading={babies.isPending}
          error={babies.error}
          action={{ href: '/dashboard/baby', label: 'Children and sizes' }}
        >
          {babies.data?.length ? (
            <ul className="flex flex-col gap-1.5 text-sm">
              {babies.data.map((baby) => (
                <li key={baby.id} className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{baby.nickname}</span>
                  <span className="text-foreground-muted">
                    {baby.latestRecommendation
                      ? `Size ${baby.latestRecommendation.recommendedSize.label}`
                      : 'No size saved yet'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">
              Add your child’s measurements to get a size suggestion.
            </p>
          )}
        </Block>
        <Block title="Updates" loading={notifications.isPending} error={notifications.error}>
          {notifications.data?.edges.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {notifications.data.edges.slice(0, 5).map(({ node }) => (
                <li key={node.id} className="flex flex-wrap justify-between gap-x-3">
                  <span className={node.read ? 'text-foreground-muted' : 'font-medium'}>
                    {notificationText(node.type)}
                  </span>
                  <span className="text-foreground-muted">{formatDate(node.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">You’re all caught up.</p>
          )}
        </Block>
      </div>
    </>
  );
}
