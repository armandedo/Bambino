'use client';

import { RequirePermission, QueryState } from '@/components/kit';
import { MetricsGrid, kigaliDayStart, useMetrics } from '@/components/metrics';
import { useState } from 'react';

function Dashboard() {
  // Fixed once per visit, so the query key is stable.
  const [period] = useState(() => ({ start: kigaliDayStart(29), end: new Date().toISOString() }));
  const metrics = useMetrics(period.start, period.end);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-foreground-muted">Last 30 days (Kigali time). Snapshot figures are as of now.</p>
      <QueryState query={metrics} what="metrics">
        {(data) => <MetricsGrid metrics={data} />}
      </QueryState>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequirePermission permission="report:read">
      <Dashboard />
    </RequirePermission>
  );
}
