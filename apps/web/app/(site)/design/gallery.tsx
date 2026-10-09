'use client';

import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Modal,
  MoneyText,
  RadioGroup,
  STATUS_TONES,
  SelectField,
  Skeleton,
  Spinner,
  StatusBadge,
  TextField,
  TextareaField,
  type Tone,
  buttonClasses,
  colors,
  contrastRatio,
  fontSizes,
  palette,
  radii,
  shadows,
  useToast,
} from '@bambino/ui';
import NextLink from 'next/link';
import { type ReactNode, useState } from 'react';

function Section({
  id,
  title,
  children,
  intro,
}: {
  id: string;
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-border pt-10">
      <div>
        <h2 id={id} className="font-display text-2xl font-semibold">
          {title}
        </h2>
        {intro ? <p className="mt-1 max-w-prose text-foreground-muted">{intro}</p> : null}
      </div>
      {children}
    </section>
  );
}

const TEXT_SAMPLES: [keyof typeof colors, keyof typeof colors][] = [
  ['foreground', 'background'],
  ['foreground-muted', 'surface'],
  ['primary-foreground', 'primary'],
  ['accent-foreground', 'accent'],
  ['primary-soft-foreground', 'primary-soft'],
  ['success-foreground', 'success-soft'],
  ['warning-foreground', 'warning-soft'],
  ['danger-foreground', 'danger-soft'],
  ['info-foreground', 'info-soft'],
];

const ORDERS = [
  { id: 'BMB-24-00017', status: 'DELIVERED', total: 39000 },
  { id: 'BMB-24-00018', status: 'OUT_FOR_DELIVERY', total: 12500 },
  { id: 'BMB-24-00019', status: 'PENDING_PAYMENT', total: 108000 },
] as const;

export function Gallery() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState('MONTHLY');
  const tones = Object.keys(STATUS_TONES) as (keyof typeof STATUS_TONES)[];
  const badgeTones: Tone[] = ['neutral', 'brand', 'accent', 'success', 'warning', 'danger', 'info'];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-4xl font-semibold">Design system</h1>
        <p className="max-w-prose text-lg text-foreground-muted">
          Tokens and components from <code className="font-mono text-base">@bambino/ui</code>, shared by the
          website and the admin dashboard. Every colour pair below is tested to reach WCAG AA contrast.
        </p>
        <nav aria-label="On this page" className="flex flex-wrap gap-2 pt-2">
          {['colours', 'type', 'buttons', 'forms', 'feedback', 'data', 'overlays', 'states', 'shells'].map(
            (id) => (
              <a key={id} href={`#${id}`} className={buttonClasses({ size: 'sm', variant: 'outline' })}>
                {id[0]?.toUpperCase()}
                {id.slice(1)}
              </a>
            ),
          )}
        </nav>
      </div>

      <Section
        id="colours"
        title="Colour"
        intro="The palette, then the semantic pairs components use, with their measured contrast."
      >
        <div className="flex flex-col gap-3">
          {Object.entries(palette).map(([name, shades]) => (
            <div key={name} className="grid grid-cols-[6rem_1fr] items-center gap-3">
              <span className="text-sm font-semibold capitalize">{name}</span>
              <ul className="grid grid-cols-5 gap-1 sm:grid-cols-11">
                {Object.entries(shades).map(([shade, hex]) => (
                  <li key={shade} className="flex flex-col gap-1">
                    <span className="h-10 rounded-md border border-border" style={{ backgroundColor: hex }} />
                    <span className="text-xs text-foreground-muted">
                      {shade}
                      <span className="sr-only"> {hex}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <ul className="grid gap-3 sm:grid-cols-3">
          {TEXT_SAMPLES.map(([fg, bg]) => (
            <li
              key={`${fg}-${bg}`}
              className="flex flex-col gap-1 rounded-lg border border-border p-4"
              style={{ backgroundColor: colors[bg], color: colors[fg] }}
            >
              <span className="font-semibold">
                {fg} on {bg}
              </span>
              <span className="text-sm">Contrast {contrastRatio(colors[fg], colors[bg]).toFixed(2)} : 1</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="type"
        title="Type, radius and shadow"
        intro="Space Grotesk for everything: semibold headings, regular text. Body text is 16px."
      >
        <div className="flex flex-col gap-2">
          {(Object.keys(fontSizes) as (keyof typeof fontSizes)[])
            .slice()
            .reverse()
            .map((size) => (
              <p key={size} className="flex items-baseline gap-4">
                <span className="w-12 shrink-0 text-xs text-foreground-muted">{size}</span>
                <span
                  className={size.match(/xl/) ? 'font-display font-semibold' : ''}
                  style={{ fontSize: fontSizes[size][0] }}
                >
                  Clothes that keep up with your baby
                </span>
              </p>
            ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {Object.entries(radii).map(([name, value]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <span
                className="size-16 border-2 border-primary bg-primary-soft"
                style={{ borderRadius: value }}
              />
              <span className="text-xs text-foreground-muted">radius {name}</span>
            </div>
          ))}
          {Object.entries(shadows).map(([name, value]) => (
            <div key={name} className="flex flex-col items-center gap-1">
              <span className="size-16 rounded-lg bg-surface" style={{ boxShadow: value }} />
              <span className="text-xs text-foreground-muted">shadow {name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="buttons"
        title="Buttons"
        intro="44px tall by default, visible focus ring, and a loading state that keeps the label."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="accent">Accent</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Cancel subscription</Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 2000);
            }}
          >
            {loading ? 'Waiting for phone approval' : 'Pay with mobile money'}
          </Button>
          <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
            A link styled as a button
          </NextLink>
        </div>
      </Section>

      <Section
        id="forms"
        title="Form fields"
        intro="Labels, hints and errors are linked to their control, so screen readers read them together."
      >
        <div className="grid gap-6 md:grid-cols-2">
          <TextField label="Email" type="email" autoComplete="email" hint="We send receipts here." required />
          <TextField
            label="Phone (MTN or Airtel)"
            type="tel"
            defaultValue="0780"
            error="Enter a full number, like +250 78 000 0001."
          />
          <SelectField
            label="Baby's size"
            placeholder="Choose a size"
            options={[
              { value: 'NB', label: 'Newborn' },
              { value: '0-3M', label: '0–3 months' },
              { value: '3-6M', label: '3–6 months' },
            ]}
          />
          <TextField label="Disabled" disabled defaultValue="Can't change this" />
          <TextareaField label="Delivery notes" hint="For example: gate code, landmark." />
          <div className="flex flex-col gap-4">
            <Checkbox label="Send me offers and news" hint="You can stop these at any time." />
            <Checkbox label="I accept the terms" error="You need to accept the terms to continue." />
          </div>
          <RadioGroup
            legend="Plan"
            name="plan"
            value={plan}
            onChange={setPlan}
            options={[
              { value: 'MONTHLY', label: 'Monthly', description: 'Most flexible' },
              { value: 'QUARTERLY', label: 'Quarterly', description: 'Billed every 3 months' },
              { value: 'ANNUAL', label: 'Annual', description: 'Not available yet', disabled: true },
            ]}
          />
        </div>
      </Section>

      <Section
        id="feedback"
        title="Badges and alerts"
        intro="Status is always written out, never shown by colour alone."
      >
        <div className="flex flex-wrap gap-2">
          {badgeTones.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {tones.map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Your size recommendation is ready">
            Based on height and weight measured 3 days ago.
          </Alert>
          <Alert tone="success" title="Payment received">
            Your order is being prepared.
          </Alert>
          <Alert tone="warning" title="Renewal payment due">
            Approve the payment on your phone within 7 days to keep your plan.
          </Alert>
          <Alert
            tone="danger"
            title="Payment declined"
            action={
              <Button size="sm" variant="outline">
                Try again
              </Button>
            }
          >
            Your wallet declined the payment. No money was taken.
          </Alert>
        </div>
      </Section>

      <Section id="data" title="Cards and tables">
        <div className="grid gap-6 md:grid-cols-[1fr_2fr]">
          <Card as="section" aria-labelledby="card-demo">
            <CardHeader
              title={<span id="card-demo">Next delivery</span>}
              description="Monthly plan · Amani"
              level={3}
              action={<StatusBadge status="ACTIVE" />}
            />
            <p className="text-sm text-foreground-muted">3 pieces in size 3–6 months, arriving Thursday.</p>
          </Card>
          <DataTable
            caption="Recent orders"
            rows={ORDERS}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'id',
                header: 'Order',
                cell: (row) => <span className="font-mono">{row.id}</span>,
                rowHeader: true,
              },
              { key: 'status', header: 'Status', cell: (row) => <StatusBadge status={row.status} /> },
              {
                key: 'total',
                header: 'Total',
                cell: (row) => <MoneyText value={{ amount: row.total, currency: 'RWF' }} />,
                align: 'end',
              },
            ]}
          />
        </div>
      </Section>

      <Section
        id="overlays"
        title="Modal and toasts"
        intro="The modal is a native dialog: focus is trapped, Escape closes it, and focus returns to the button."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button variant="outline" onClick={() => toast.show({ title: 'Address saved', tone: 'success' })}>
            Success toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.show({
                title: 'Payment failed',
                description: 'Your wallet declined it. No money was taken.',
                tone: 'danger',
              })
            }
          >
            Error toast (stays until dismissed)
          </Button>
        </div>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Cancel your subscription?"
          description="You keep your plan until the end of the period you paid for."
          footer={
            <>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Keep my plan
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setModalOpen(false);
                  toast.show({ title: 'Demo only', description: 'Nothing was cancelled.', tone: 'info' });
                }}
              >
                Cancel at period end
              </Button>
            </>
          }
        >
          <p className="text-sm">Garments you still have should be returned by then.</p>
        </Modal>
      </Section>

      <Section id="states" title="Loading, empty and error states">
        <div className="grid gap-6 md:grid-cols-3">
          <Card aria-busy="true" className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Spinner label="Loading orders" />
              <span className="text-sm text-foreground-muted">Loading orders…</span>
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </Card>
          <EmptyState
            title="No orders yet"
            description="When you place an order it will appear here."
            level={3}
            action={<Button size="sm">Browse the shop</Button>}
          />
          <ErrorState
            title="We couldn't load your orders"
            description="Please try again in a moment."
            requestId="5f2c9e1a-demo"
            level={3}
            action={
              <Button size="sm" variant="outline">
                Try again
              </Button>
            }
          />
        </div>
      </Section>

      <Section
        id="shells"
        title="Layout shells"
        intro="This page sits in the customer site shell. The admin shell is shown on its own page."
      >
        <div className="flex flex-wrap gap-3">
          <NextLink href="/preview/admin-shell" className={buttonClasses({ variant: 'outline' })}>
            View the admin shell
          </NextLink>
        </div>
        <p className="text-sm text-foreground-muted">
          The mobile app shell is built with React Native in Phase 7; it uses the same tokens.
        </p>
      </Section>
    </div>
  );
}
