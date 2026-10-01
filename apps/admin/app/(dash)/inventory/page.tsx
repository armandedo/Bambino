'use client';

import { AdminAdjustInventoryMutation, AdminInventoryQuery, type InventoryRow } from '@bambino/api-client';
import { Badge, Button, Checkbox, DataTable, Modal, TextField } from '@bambino/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pager, QueryState, RequirePermission, useAction, usePager } from '@/components/kit';
import { api, useStaff } from '@/lib/session';

function Adjust({ row, onDone }: { row: InventoryRow; onDone: () => void }) {
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const value = Number(delta);
  const valid =
    Number.isInteger(value) &&
    value !== 0 &&
    row.quantityOnHand + value >= row.quantityReserved &&
    note.trim().length >= 3;
  const adjust = useAction(
    () =>
      api.request(AdminAdjustInventoryMutation, {
        input: {
          variantId: row.variant.id,
          locationCode: row.locationCode,
          onHandDelta: value,
          note: note.trim(),
        },
      }),
    {
      success: (r) => `On hand is now ${r.adminAdjustInventory.quantityOnHand}`,
      invalidate: [['admin-inventory']],
    },
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {row.product.name} · {row.variant.size.label} · {row.variant.color} at {row.locationCode}:{' '}
        {row.quantityOnHand} on hand, {row.quantityReserved} reserved.
      </p>
      <TextField
        label="Change on hand by"
        inputMode="numeric"
        value={delta}
        onChange={(event) => setDelta(event.target.value)}
        hint="Positive for stock received, negative for damage or loss. Cannot go below what is reserved."
      />
      <TextField
        label="Reason"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        hint="Recorded with the adjustment."
      />
      <Button
        disabled={!valid}
        loading={adjust.isPending}
        onClick={() => adjust.mutate(undefined, { onSuccess: onDone })}
      >
        Record adjustment
      </Button>
    </div>
  );
}

function Inventory() {
  const { can } = useStaff();
  const [lowOnly, setLowOnly] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const pager = usePager();
  const inventory = useQuery({
    queryKey: ['admin-inventory', lowOnly, pager.after],
    queryFn: async () =>
      (
        await api.request(AdminInventoryQuery, {
          belowThresholdOnly: lowOnly,
          page: { first: 50, after: pager.after },
        })
      ).adminInventory,
  });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-foreground-muted">
        New units for one-time sale. Garments for subscriptions are tracked one by one on the Garments page.
      </p>
      <Checkbox
        label="Only items at or below their reorder level"
        checked={lowOnly}
        onChange={(event) => {
          setLowOnly(event.target.checked);
          pager.reset();
        }}
      />
      <QueryState query={inventory} what="inventory">
        {(page) => (
          <>
            <DataTable
              caption="Inventory"
              captionHidden
              rows={page.items}
              rowKey={(r) => r.id}
              empty="Nothing to show."
              columns={[
                {
                  key: 'product',
                  header: 'Product',
                  rowHeader: true,
                  cell: (r) => `${r.product.name} · ${r.variant.size.label} · ${r.variant.color}`,
                },
                {
                  key: 'sku',
                  header: 'SKU',
                  cell: (r) => <span className="font-mono text-xs">{r.variant.sku}</span>,
                },
                { key: 'location', header: 'Location', cell: (r) => r.locationCode },
                { key: 'onHand', header: 'On hand', align: 'end', cell: (r) => r.quantityOnHand },
                { key: 'reserved', header: 'Reserved', align: 'end', cell: (r) => r.quantityReserved },
                {
                  key: 'available',
                  header: 'Available',
                  align: 'end',
                  cell: (r) => (
                    <span className="inline-flex items-center gap-2">
                      {r.belowThreshold ? <Badge tone="warning">Low</Badge> : null}
                      {r.quantityAvailable}
                    </span>
                  ),
                },
                {
                  key: 'adjust',
                  header: <span className="sr-only">Actions</span>,
                  cell: (r) =>
                    can('inventory:write') ? (
                      <Button size="sm" variant="ghost" onClick={() => setAdjusting(r)}>
                        Adjust<span className="sr-only"> {r.variant.sku}</span>
                      </Button>
                    ) : null,
                },
              ]}
            />
            <Pager pager={pager} pageInfo={page.pageInfo} totalCount={page.totalCount} />
          </>
        )}
      </QueryState>
      <Modal open={adjusting !== null} onClose={() => setAdjusting(null)} title="Adjust stock">
        {adjusting ? <Adjust row={adjusting} onDone={() => setAdjusting(null)} /> : null}
      </Modal>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <RequirePermission permission="inventory:read">
      <Inventory />
    </RequirePermission>
  );
}
