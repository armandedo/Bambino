import { GARMENT_STATUSES, ORDER_STATUSES, PAYMENT_STATUSES, SUBSCRIPTION_STATUSES } from '@bambino/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axeViolations } from '../testing/axe';
import { Alert } from './alert';
import { Badge, STATUS_TONES, StatusBadge, humanizeStatus } from './badge';
import { Button, buttonClasses } from './button';
import { Card, CardHeader } from './card';
import { Checkbox, RadioGroup, SelectField, TextField, TextareaField } from './field';
import { Modal } from './modal';
import { MoneyText } from './money';
import { AdminShell, SiteShell } from './shells';
import { Skeleton, Spinner } from './spinner';
import { EmptyState, ErrorState } from './states';
import { DataTable } from './table';
import { ToastProvider, useToast } from './toast';

describe('Button', () => {
  it('is a real button that defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('type', 'button');
  });

  it('is disabled and busy while loading, keeping its label', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Pay now
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Pay now' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('responds to the keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Continue</Button>);
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button'));
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('exposes its look for links', () => {
    expect(buttonClasses({ variant: 'outline', size: 'lg' })).toContain('border-border-strong');
  });
});

describe('form fields', () => {
  it('links the label, hint and error to the input', () => {
    render(<TextField label="Email" hint="We send receipts here." error="Enter a valid email." required />);
    const input = screen.getByRole('textbox', { name: /Email/ });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input).toHaveProperty('required', true);
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    const descriptions = describedBy.map((id) => document.getElementById(id)?.textContent);
    expect(descriptions).toEqual(['Enter a valid email.', 'We send receipts here.']);
  });

  it('has no aria-invalid or description when valid', () => {
    render(<TextField label="Name" />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('select, textarea, checkbox and radio group are labelled and operable by keyboard', async () => {
    const onPlan = vi.fn();
    render(
      <form>
        <SelectField
          label="Size"
          placeholder="Choose a size"
          options={[
            { value: '0-3M', label: '0–3 months' },
            { value: '3-6M', label: '3–6 months' },
          ]}
        />
        <TextareaField label="Notes" />
        <Checkbox label="Send me offers" />
        <RadioGroup
          legend="Plan"
          name="plan"
          onChange={onPlan}
          options={[
            { value: 'MONTHLY', label: 'Monthly' },
            { value: 'QUARTERLY', label: 'Quarterly', description: 'Save 8%' },
          ]}
        />
      </form>,
    );
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Size' }), '3-6M');
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveProperty('value', '3-6M');
    await userEvent.type(screen.getByRole('textbox', { name: 'Notes' }), 'Gift');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Send me offers' }));
    expect(screen.getByRole('checkbox', { name: 'Send me offers' })).toHaveProperty('checked', true);
    const group = screen.getByRole('group', { name: 'Plan' });
    await userEvent.click(within(group).getByRole('radio', { name: /Quarterly/ }));
    expect(onPlan).toHaveBeenCalledWith('QUARTERLY');
  });
});

describe('badges', () => {
  it('gives every order, payment, subscription and garment status a tone and a readable label', () => {
    for (const status of [
      ...ORDER_STATUSES,
      ...PAYMENT_STATUSES,
      ...SUBSCRIPTION_STATUSES,
      ...GARMENT_STATUSES,
    ]) {
      expect(STATUS_TONES[status]).toBeDefined();
    }
    expect(humanizeStatus('OUT_FOR_DELIVERY')).toBe('Out for delivery');
  });

  it('shows the status as text, not colour alone', () => {
    render(<StatusBadge status="PAST_DUE" />);
    expect(screen.getByText('Past due')).toBeTruthy();
  });
});

describe('MoneyText', () => {
  it('formats minor units from the API without arithmetic', () => {
    render(<MoneyText value={{ amount: 39000, currency: 'RWF' }} locale="en-US" />);
    expect(screen.getByText(/39,000/)).toBeTruthy();
  });

  it('shows an unknown currency raw instead of guessing its decimals', () => {
    render(<MoneyText value={{ amount: 1050, currency: 'XYZ' }} />);
    expect(screen.getByText('XYZ 1050')).toBeTruthy();
  });
});

describe('Modal', () => {
  function Harness({ onClose }: { onClose?: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Cancel subscription</Button>
        <Modal
          open={open}
          onClose={() => {
            onClose?.();
            setOpen(false);
          }}
          title="Cancel your subscription?"
          description="You keep your plan until the end of the paid period."
          footer={<Button onClick={() => setOpen(false)}>Keep my plan</Button>}
        />
      </>
    );
  }

  it('opens as a labelled dialog and closes from its close button', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel your subscription?' });
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('asks the parent to close on Escape (the cancel event)', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel subscription' }));
    const dialog = screen.getByRole('dialog');
    act(() => {
      dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});

describe('toasts', () => {
  function Trigger() {
    const toast = useToast();
    return (
      <>
        <Button onClick={() => toast.show({ title: 'Saved', tone: 'success', durationMs: 1000 })}>
          Save
        </Button>
        <Button onClick={() => toast.show({ title: 'Payment failed', tone: 'danger' })}>Fail</Button>
      </>
    );
  }

  it('announces in live regions; errors are assertive and stay until dismissed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <ToastProvider>
          <Trigger />
        </ToastProvider>,
      );
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await user.click(screen.getByRole('button', { name: 'Fail' }));

      const polite = screen.getByRole('list', { name: 'Notifications' });
      const assertive = screen.getByRole('list', { name: 'Urgent notifications' });
      expect(polite.getAttribute('aria-live')).toBe('polite');
      expect(assertive.getAttribute('aria-live')).toBe('assertive');
      expect(within(polite).getByText('Saved')).toBeTruthy();
      expect(within(assertive).getByText('Payment failed')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(within(polite).queryByText('Saved')).toBeNull();
      expect(within(assertive).getByText('Payment failed')).toBeTruthy();

      await user.click(screen.getByRole('button', { name: 'Dismiss: Payment failed' }));
      expect(within(assertive).queryByText('Payment failed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow('useToast must be used inside <ToastProvider>');
    vi.mocked(console.error).mockRestore();
  });
});

describe('SiteShell', () => {
  it('has a skip link, landmarks, the current page marked, and a mobile menu that reports its state', async () => {
    render(
      <SiteShell
        brand={<a href="/">Bambino</a>}
        nav={[
          { href: '/shop', label: 'Shop', current: true },
          { href: '/subscriptions', label: 'Plans' },
        ]}
        footer={<p>Footer</p>}
      >
        <h1>Home</h1>
      </SiteShell>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' }).getAttribute('href')).toBe('#main');
    expect(screen.getByRole('main').id).toBe('main');
    expect(screen.getByRole('banner')).toBeTruthy();
    expect(screen.getByRole('contentinfo')).toBeTruthy();
    const desktop = screen.getByRole('navigation', { name: 'Main' });
    expect(within(desktop).getByRole('link', { name: 'Shop' }).getAttribute('aria-current')).toBe('page');

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Close menu' }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Main mobile' }).hidden).toBe(false);
  });
});

describe('accessibility (axe)', () => {
  const cases: [string, ReactElement][] = [
    [
      'buttons',
      <div key="b">
        <Button>Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button loading>Loading</Button>
      </div>,
    ],
    [
      'fields',
      <form key="f">
        <TextField label="Email" error="Required" hint="Hint" required />
        <SelectField label="Size" options={[{ value: 'a', label: 'A' }]} />
        <TextareaField label="Notes" />
        <Checkbox label="Agree" error="You must agree" />
        <RadioGroup legend="Plan" name="p" options={[{ value: 'm', label: 'Monthly' }]} />
      </form>,
    ],
    [
      'feedback',
      <div key="fb">
        <Alert tone="danger" title="Payment failed" live>
          Try again.
        </Alert>
        <Alert tone="info">Note</Alert>
        <Badge tone="success">Paid</Badge>
        <StatusBadge status="DELIVERED" />
        <Spinner />
        <Skeleton className="h-4" />
      </div>,
    ],
    [
      'card, states and table',
      <div key="c">
        <Card as="section">
          <CardHeader title="Your plan" description="Monthly" />
        </Card>
        <EmptyState title="No orders yet" description="Orders appear here." />
        <ErrorState title="Could not load orders" requestId="req_123" />
        <DataTable
          caption="Orders"
          columns={[
            { key: 'n', header: 'Order', cell: (row: { id: string }) => row.id, rowHeader: true },
            {
              key: 't',
              header: 'Total',
              cell: () => <MoneyText value={{ amount: 1, currency: 'RWF' }} />,
              align: 'end',
            },
          ]}
          rows={[{ id: 'BMB-1' }]}
          rowKey={(row) => row.id}
        />
      </div>,
    ],
    [
      'site shell',
      <SiteShell
        key="s"
        brand={<a href="/">Bambino</a>}
        nav={[{ href: '/shop', label: 'Shop' }]}
        footer={<p>f</p>}
      >
        <h1>Page</h1>
      </SiteShell>,
    ],
    [
      'admin shell',
      <AdminShell
        key="a"
        brand={<a href="/admin">Bambino admin</a>}
        title="Orders"
        navGroups={[
          { label: 'Operations', items: [{ href: '/admin/orders', label: 'Orders', current: true }] },
        ]}
      >
        <p>Content</p>
      </AdminShell>,
    ],
  ];

  it.each(cases)('%s have no violations', async (_name, element) => {
    const { container } = render(element);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('an open modal has no violations', async () => {
    render(
      <Modal open onClose={() => undefined} title="Confirm" footer={<Button>OK</Button>}>
        <p>Body</p>
      </Modal>,
    );
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
