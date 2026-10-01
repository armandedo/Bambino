'use client';

import { AdminMetricsQuery } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { percent } from '@/lib/format';
import { api } from '@/lib/session';
import { Section, Stat } from './kit';

export function useMetrics(periodStart: string, periodEnd: string) {
  return useQuery({
    queryKey: ['metrics', periodStart, periodEnd],
    queryFn: async () => (await api.request(AdminMetricsQuery, { periodStart, periodEnd })).adminMetrics,
  });
}

/** Start of a Kigali calendar day `daysAgo` days back, as an ISO instant (Kigali is UTC+2, no DST). */
export function kigaliDayStart(daysAgo: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(new Date());
  const start = new Date(`${today}T00:00:00+02:00`);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  return start.toISOString();
}

export function MetricsGrid({ metrics }: { metrics: NonNullable<ReturnType<typeof useMetrics>['data']> }) {
  return (
    <div className="flex flex-col gap-8">
      <Section title="Customers and revenue">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Active subscribers" value={metrics.activeSubscribers} hint="Now" />
          <Stat
            label="Monthly recurring revenue"
            value={<MoneyText value={metrics.monthlyRecurringRevenue} />}
            hint="Active plans, as a monthly amount"
          />
          <Stat
            label="Subscription revenue"
            value={<MoneyText value={metrics.subscriptionRevenue} />}
            hint="Collected in the period"
          />
          <Stat
            label="Shop and exchange revenue"
            value={<MoneyText value={metrics.oneTimeRevenue} />}
            hint="Collected in the period"
          />
          <Stat
            label="Customers"
            value={metrics.totalCustomers}
            hint={`${metrics.newCustomers} new in the period`}
          />
          <Stat
            label="Revenue per subscriber"
            value={
              metrics.averageRevenuePerSubscriber ? (
                <MoneyText value={metrics.averageRevenuePerSubscriber} />
              ) : (
                '—'
              )
            }
            hint="Subscription revenue ÷ paying subscribers"
          />
          <Stat
            label="Payment success"
            value={percent(metrics.paymentSuccessRate)}
            hint="Of payments settled in the period"
          />
          <Stat label="Orders placed" value={metrics.orders} hint="In the period" />
        </div>
      </Section>
      <Section title="Work waiting">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Orders to fulfil"
            value={metrics.pendingOrders}
            hint="Paid, not yet out for delivery"
          />
          <Stat label="Open returns" value={metrics.pendingReturns} hint="Requested to inspecting" />
          <Stat label="Exchanges to review" value={metrics.openExchangeRequests} />
          <Stat label="Low-stock items" value={metrics.lowStockItems} hint="At or below reorder level" />
        </div>
      </Section>
      <Section title="Circular economy">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Garments with families"
            value={metrics.garmentsInCirculation}
            hint="Reserved, delivered or on the way back"
          />
          <Stat label="Returned" value={metrics.garmentsReturned} hint="In the period" />
          <Stat label="Passed inspection for reuse" value={metrics.garmentsReused} hint="In the period" />
          <Stat label="Recycled" value={metrics.garmentsRecycled} hint="In the period" />
          <Stat label="Sent to refurbish" value={metrics.garmentsRefurbished} hint="In the period" />
          <Stat
            label="Average cycles per garment"
            value={
              metrics.averageGarmentLifecycleCount === null
                ? '—'
                : metrics.averageGarmentLifecycleCount.toFixed(2)
            }
            hint="Garments worn at least once"
          />
        </div>
      </Section>
      <Section title="Retention and delivery">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Subscription churn"
            value={percent(metrics.subscriptionChurnRate)}
            hint="Of subscriptions active at the start"
          />
          <Stat
            label="Customer retention"
            value={percent(metrics.customerRetentionRate)}
            hint="Earlier payers who paid again"
          />
          <Stat
            label="On-time delivery"
            value={percent(metrics.onTimeDeliveryRate)}
            hint="Delivered by the promised day"
          />
        </div>
      </Section>
      <p className="text-xs text-foreground-muted">
        Every figure is counted from transactional records. “—” means there is not yet enough data to
        calculate it.
      </p>
    </div>
  );
}
