'use client';

import { Button, TextField } from '@bambino/ui';
import { type FormEvent, useState } from 'react';
import { QueryState, RequirePermission } from '@/components/kit';
import { MetricsGrid, useMetrics } from '@/components/metrics';

function kigaliDate(offsetDays: number): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(date);
}

/** Kigali calendar days; the end day is included. */
function toPeriod(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+02:00`);
  const end = new Date(`${to}T00:00:00+02:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function Analytics() {
  const [range, setRange] = useState(() => ({ from: kigaliDate(-89), to: kigaliDate(0) }));
  const [error, setError] = useState<string | undefined>();
  const period = toPeriod(range.from, range.to);
  const metrics = useMetrics(period.start, period.end);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get('from') ?? '');
    const to = String(form.get('to') ?? '');
    if (!from || !to || to < from) {
      setError('Choose an end date on or after the start date.');
      return;
    }
    setError(undefined);
    setRange({ from, to });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={onSubmit}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <TextField label="From" name="from" type="date" defaultValue={range.from} />
        <TextField label="To (included)" name="to" type="date" defaultValue={range.to} error={error} />
        <Button type="submit" variant="outline">
          Update
        </Button>
      </form>
      <QueryState query={metrics} what="metrics">
        {(data) => <MetricsGrid metrics={data} />}
      </QueryState>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequirePermission permission="report:read">
      <Analytics />
    </RequirePermission>
  );
}
