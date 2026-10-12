'use client';

import type { OrderStatus } from '@bambino/api-client';
import { cn } from '@bambino/ui';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { DURATION, EASE } from './motion/primitives';

const STAGES = ['Order confirmed', 'Preparing', 'Packed', 'Out for delivery', 'Delivered'] as const;

/** Which stage an order status belongs to; -1 before payment, null when the order is no longer on this path. */
function stageOf(status: OrderStatus): number | null {
  switch (status) {
    case 'PENDING_PAYMENT':
      return -1;
    case 'CONFIRMED':
    case 'PAID':
      return 0;
    case 'PROCESSING':
      return 1;
    case 'PACKED':
    case 'READY_FOR_DISPATCH':
      return 2;
    case 'OUT_FOR_DELIVERY':
      return 3;
    case 'DELIVERED':
    case 'RETURN_REQUESTED':
    case 'RETURNED':
      return 4;
    default:
      return null;
  }
}

/** Order Confirmed → Preparing → Packed → Out for Delivery → Delivered, with the current stage marked. */
export function DeliveryProgress({ status }: { status: OrderStatus }) {
  const current = stageOf(status);
  if (current === null) return null;
  const fill = current < 0 ? 0 : current / (STAGES.length - 1);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-4 h-1 rounded-full bg-sand-200" aria-hidden="true">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${fill * 100}%` }}
          transition={{ duration: DURATION.slow, ease: EASE }}
        />
      </div>
      <ol className="grid grid-cols-5 gap-1">
        {STAGES.map((stage, index) => {
          const done = index < current || (index === current && index === STAGES.length - 1);
          const active = index === current;
          return (
            <li
              key={stage}
              aria-current={active ? 'step' : undefined}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : active
                      ? 'border-primary bg-surface text-primary'
                      : 'border-sand-300 bg-surface text-foreground-muted',
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-xs leading-tight sm:text-sm',
                  active ? 'font-semibold text-primary' : 'text-foreground-muted',
                )}
              >
                {stage}
                <span className="sr-only">{done ? ' (done)' : active ? ' (current)' : ''}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
