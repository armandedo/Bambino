'use client';

import { cn } from '@bambino/ui';
import { ArrowRight, BadgeCheck, Coins, type LucideIcon, Search, Shirt, Truck } from 'lucide-react';
import { Stagger, StaggerItem } from '../motion/primitives';

const SEQUENCE: { title: string; body: string; icon: LucideIcon; highlight?: boolean }[] = [
  { title: 'Current size', body: 'Pieces your baby is outgrowing', icon: Shirt },
  { title: 'Return', body: 'Book a pickup from your account', icon: Truck },
  { title: 'Inspection', body: 'Each piece is checked by our team', icon: Search },
  { title: 'Credit', body: 'Accepted pieces earn exchange credit', icon: Coins, highlight: true },
  { title: 'Next size', body: 'Choose it, with your credit applied', icon: BadgeCheck },
];

/** Current size → return → inspection → credit → next size, revealed in order. */
export function ExchangeSequence({ tone = 'default' }: { tone?: 'default' | 'inverse' }) {
  const inverse = tone === 'inverse';
  return (
    <Stagger as="ol" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" gap={0.12}>
      {SEQUENCE.map((step, index) => {
        const Icon = step.icon;
        return (
          <StaggerItem as="li" key={step.title} className="relative">
            <div
              className={cn(
                'flex h-full flex-col gap-3 rounded-2xl p-5',
                inverse ? 'bg-brand-700 text-primary-foreground' : 'border border-border bg-surface',
                step.highlight &&
                  (inverse ? 'bg-accent text-accent-foreground' : 'border-accent bg-accent-50'),
              )}
            >
              <span className="flex items-center justify-between">
                <Icon aria-hidden="true" className="size-6" strokeWidth={1.75} />
                <span
                  className={cn(
                    'text-xs font-bold tabular-nums',
                    inverse && !step.highlight ? 'text-accent-200' : 'text-emphasis',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
              </span>
              <span className="font-display text-lg font-bold">{step.title}</span>
              <span
                className={cn(
                  'text-sm',
                  inverse && !step.highlight ? 'text-brand-100' : 'text-foreground-muted',
                  step.highlight && inverse && 'text-brand-900',
                )}
              >
                {step.body}
              </span>
            </div>
            {index < SEQUENCE.length - 1 ? (
              <ArrowRight
                aria-hidden="true"
                className={cn(
                  'absolute top-1/2 -right-3 z-10 hidden size-5 -translate-y-1/2 lg:block',
                  inverse ? 'text-accent-200' : 'text-sand-400',
                )}
              />
            ) : null}
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
