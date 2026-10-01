'use client';

import { RequestEmailVerificationMutation } from '@bambino/api-client';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  EmptyState,
  MoneyText,
  StatusBadge,
  buttonClasses,
} from '@bambino/ui';
import { useMutation } from '@tanstack/react-query';
import NextLink from 'next/link';
import { QueryState } from '@/components/query-state';
import { api } from '@/lib/browser-api';
import { errorMessage, formatDate, notificationText } from '@/lib/messages';
import { useBabies, useCredits, useNotifications, useOrders, useSubscriptions } from '@/lib/queries';
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

export default function AccountOverviewPage() {
  const { viewer } = useSession();
  const babies = useBabies();
  const subscriptions = useSubscriptions();
  const orders = useOrders();
  const credits = useCredits();
  const notifications = useNotifications();

  return (
    <>
      <PageTitle
        title={`Hello, ${viewer?.firstName ?? ''}`}
        description="Everything about your baby’s wardrobe in one place."
      />
      {viewer && !viewer.emailVerified ? <VerifyEmailBanner /> : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card as="section" aria-labelledby="sub-title">
          <CardHeader title={<span id="sub-title">Subscription</span>} level={2} />
          <QueryState query={subscriptions} what="your subscription">
            {(list) => {
              const current = list.find((s) => !['CANCELLED', 'EXPIRED'].includes(s.status));
              if (!current) {
                return (
                  <div className="flex flex-col gap-3">
                    <p className="text-foreground-muted">No active subscription yet.</p>
                    <NextLink
                      href="/account/subscription/new"
                      className={buttonClasses({ size: 'sm', className: 'w-fit' })}
                    >
                      Start a subscription
                    </NextLink>
                  </div>
                );
              }
              return (
                <div className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {current.plan.name} for {current.babyProfile.nickname}{' '}
                    <StatusBadge status={current.status} />
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {current.status === 'PENDING'
                      ? 'Waiting for the first payment.'
                      : `Current period ends ${formatDate(current.currentPeriodEnd)}.`}
                  </p>
                  <NextLink
                    href="/account/subscription"
                    className="w-fit text-sm font-semibold text-link underline underline-offset-4 hover:decoration-2"
                  >
                    Manage subscription
                  </NextLink>
                </div>
              );
            }}
          </QueryState>
        </Card>

        <Card as="section" aria-labelledby="baby-title">
          <CardHeader title={<span id="baby-title">Sizes</span>} level={2} />
          <QueryState query={babies} what="your baby profiles">
            {(list) =>
              list.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-foreground-muted">Add your baby to get a size recommendation.</p>
                  <NextLink href="/size-finder" className={buttonClasses({ size: 'sm', className: 'w-fit' })}>
                    Find my baby’s size
                  </NextLink>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {list.map((baby) => (
                    <li key={baby.id} className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-semibold">{baby.nickname}</span>
                      <span className="text-sm text-foreground-muted">
                        {baby.latestRecommendation
                          ? `Size ${baby.latestRecommendation.recommendedSize.label}${baby.latestRecommendation.nextSize ? `, next ${baby.latestRecommendation.nextSize.code}` : ''}`
                          : 'No recommendation yet'}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </Card>

        <Card as="section" aria-labelledby="credit-title">
          <CardHeader title={<span id="credit-title">Exchange credit</span>} level={2} />
          <QueryState query={credits} what="your credit">
            {(summary) => (
              <div className="flex flex-col gap-2">
                <p className="font-display text-3xl font-extrabold">
                  <MoneyText value={summary.balance} />
                </p>
                <p className="text-sm text-foreground-muted">
                  Earned when returned pieces pass inspection. Used automatically at checkout if you choose.
                </p>
              </div>
            )}
          </QueryState>
        </Card>

        <Card as="section" aria-labelledby="note-title">
          <CardHeader title={<span id="note-title">Notifications</span>} level={2} />
          <QueryState query={notifications} what="notifications">
            {(data) =>
              data.edges.length === 0 ? (
                <p className="text-foreground-muted">Nothing new.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {data.edges.slice(0, 5).map(({ node }) => (
                    <li key={node.id} className="flex justify-between gap-3">
                      <span className={node.read ? 'text-foreground-muted' : 'font-semibold'}>
                        {notificationText(node.type)}
                      </span>
                      <span className="shrink-0 text-foreground-muted">{formatDate(node.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </QueryState>
        </Card>
      </div>

      <section aria-labelledby="recent-orders" className="flex flex-col gap-3">
        <h2 id="recent-orders" className="font-display text-xl font-bold">
          Recent orders
        </h2>
        <QueryState query={orders} what="your orders">
          {(list) =>
            list.length === 0 ? (
              <EmptyState
                title="No orders yet"
                description="Orders you place appear here with their delivery status."
                level={3}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {list.slice(0, 3).map((order) => (
                  <li key={order.id}>
                    <NextLink
                      href={`/account/orders/${order.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      <span className="font-mono text-sm">{order.orderNumber}</span>
                      <StatusBadge status={order.status} />
                      <span className="text-sm text-foreground-muted">{formatDate(order.placedAt)}</span>
                      <MoneyText value={order.totals.total} className="font-semibold" />
                    </NextLink>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryState>
      </section>
    </>
  );
}
