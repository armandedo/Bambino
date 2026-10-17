'use client';

import { AdminShell, Alert, Button, Card, DataTable, MoneyText, StatusBadge } from '@bambino/ui';
import NextLink from 'next/link';
import { RouterLink } from '@/components/router-link';
import { Logo } from '@/components/logo';

const GARMENTS = [
  { tag: 'SEED-ORGANIC-SAN-03M-G1', product: 'Bodysuit', status: 'INSPECTION', cycles: 1 },
  { tag: 'SEED-FOOTEDRO-OAT-36M-G2', product: 'Footed romper', status: 'AVAILABLE_FOR_REUSE', cycles: 2 },
  { tag: 'SEED-SLEEPSUI-CLO-69M-G1', product: 'Two-piece sleep suit', status: 'WITH_CUSTOMER', cycles: 0 },
  { tag: 'SEED-EVERYDAY-CLA-912M-G3', product: 'Everyday trousers', status: 'RECYCLE', cycles: 3 },
] as const;

/** Sample data only: shows the staff layout. The real dashboard is Phase 8. */
export function AdminPreview() {
  return (
    <AdminShell
      brand={
        <NextLink href="/design" className="rounded-md focus-visible:outline-2 focus-visible:outline-focus">
          <Logo />
        </NextLink>
      }
      title="Garments"
      link={RouterLink}
      actions={
        <>
          <Button variant="outline" size="sm">
            Export
          </Button>
          <Button size="sm">Register garment</Button>
        </>
      }
      user={
        <div className="text-sm">
          <p className="font-semibold">Operations (sample)</p>
          <p className="text-foreground-muted">ops@seed.test</p>
        </div>
      }
      navGroups={[
        {
          label: 'Overview',
          items: [{ href: '/preview/admin-shell#dashboard', label: 'Dashboard' }],
        },
        {
          label: 'Operations',
          items: [
            { href: '/preview/admin-shell#orders', label: 'Orders' },
            { href: '/preview/admin-shell', label: 'Garments', current: true },
            { href: '/preview/admin-shell#returns', label: 'Returns and inspection' },
            { href: '/preview/admin-shell#deliveries', label: 'Deliveries' },
          ],
        },
        {
          label: 'Catalogue',
          items: [
            { href: '/preview/admin-shell#products', label: 'Products' },
            { href: '/preview/admin-shell#inventory', label: 'Inventory' },
          ],
        },
      ]}
    >
      <div className="flex flex-col gap-6">
        <Alert tone="info" title="Layout preview with sample rows">
          This shows the admin frame from the design system. The working admin dashboard is Phase 8.
        </Alert>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['In circulation', '57'],
            ['Awaiting inspection', '4'],
            ['Average cycles per garment', '1.6'],
          ].map(([label, value]) => (
            <Card key={label} padding="sm">
              <p className="text-sm text-foreground-muted">{label}</p>
              <p className="font-display text-3xl font-semibold">{value}</p>
              <p className="text-xs text-foreground-muted">Sample figure</p>
            </Card>
          ))}
        </div>
        <DataTable
          caption="Garments (sample)"
          rows={GARMENTS}
          rowKey={(row) => row.tag}
          columns={[
            {
              key: 'tag',
              header: 'Tag',
              cell: (row) => <span className="font-mono text-xs">{row.tag}</span>,
              rowHeader: true,
            },
            { key: 'product', header: 'Product', cell: (row) => row.product },
            { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
            { key: 'cycles', header: 'Cycles', cell: (row) => row.cycles, align: 'end' },
            {
              key: 'value',
              header: 'Value',
              cell: () => <MoneyText value={{ amount: 9000, currency: 'RWF' }} />,
              align: 'end',
            },
          ]}
        />
      </div>
    </AdminShell>
  );
}
