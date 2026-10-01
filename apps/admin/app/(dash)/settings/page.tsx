'use client';

import { CatalogueFiltersQuery, DeliveryOptionsQuery } from '@bambino/api-client';
import { Alert, Card, CardHeader, DataTable, MoneyText } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { QueryState, RequirePermission } from '@/components/kit';
import { api } from '@/lib/session';

/**
 * Read-only for now: the API has no operations yet for editing delivery options or the size chart.
 * Both are changed through seeds or the database until those operations exist.
 */
function Settings() {
  const delivery = useQuery({
    queryKey: ['delivery-options'],
    queryFn: async () => (await api.request(DeliveryOptionsQuery)).deliveryOptions,
  });
  const sizes = useQuery({
    queryKey: ['catalogue-filters-full'],
    queryFn: () => api.request(CatalogueFiltersQuery),
  });
  return (
    <div className="flex flex-col gap-6">
      <Alert tone="info" title="View only">
        Editing delivery options and the size chart is not built yet. The size chart in use is the labelled
        seed chart, pending the real chart (open question 9).
      </Alert>
      <Card>
        <CardHeader title="Delivery options" level={2} />
        <QueryState query={delivery} what="delivery options">
          {(list) => (
            <DataTable
              caption="Delivery options"
              captionHidden
              rows={list}
              rowKey={(o) => o.code}
              columns={[
                { key: 'name', header: 'Name', rowHeader: true, cell: (o) => o.name },
                {
                  key: 'code',
                  header: 'Code',
                  cell: (o) => <span className="font-mono text-xs">{o.code}</span>,
                },
                {
                  key: 'days',
                  header: 'Working days',
                  cell: (o) => `${o.estimatedDaysMin}–${o.estimatedDaysMax}`,
                },
                { key: 'fee', header: 'Fee', align: 'end', cell: (o) => <MoneyText value={o.fee} /> },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card>
        <CardHeader title="Size chart" level={2} />
        <QueryState query={sizes} what="sizes">
          {(data) => (
            <DataTable
              caption="Sizes"
              captionHidden
              rows={[...data.sizes].sort((a, b) => a.sortOrder - b.sortOrder)}
              rowKey={(s) => s.code}
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  rowHeader: true,
                  cell: (s) => <span className="font-mono">{s.code}</span>,
                },
                { key: 'label', header: 'Label', cell: (s) => s.label },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings:write">
      <Settings />
    </RequirePermission>
  );
}
