'use client';

import { cn } from '@bambino/ui';
import { Baby, Box, ClipboardList, type LucideIcon, RefreshCw, Ruler, Undo2 } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { DURATION, EASE } from '../motion/primitives';

interface Step {
  title: string;
  body: string;
  icon: LucideIcon;
  tint: string;
}

export const STEPS: Step[] = [
  {
    title: 'Create a profile',
    body: 'Your baby’s name, age and, if you have them, height and weight. Children’s details stay private to your account.',
    icon: Baby,
    tint: 'bg-brand-50 text-brand-700',
  },
  {
    title: 'Choose a plan',
    body: 'Monthly, quarterly or annual. Pause or cancel from your account.',
    icon: ClipboardList,
    tint: 'bg-accent-50 text-accent-700',
  },
  {
    title: 'Get fitted',
    body: 'We recommend a size from your measurements and show the reasons, so you can check it.',
    icon: Ruler,
    tint: 'bg-brand-100 text-brand-800',
  },
  {
    title: 'Receive your box',
    body: 'Pieces in your baby’s size, delivered to your door in Kigali.',
    icon: Box,
    tint: 'bg-accent-100 text-accent-800',
  },
  {
    title: 'Return what’s outgrown',
    body: 'Book a pickup when pieces get small. Every piece is inspected and returned pieces earn exchange credit.',
    icon: Undo2,
    tint: 'bg-brand-50 text-brand-700',
  },
  {
    title: 'Exchange for the next size',
    body: 'Choose the next size with your credit applied. Good pieces go on to another family.',
    icon: RefreshCw,
    tint: 'bg-accent-50 text-accent-700',
  },
];

function StepItem({
  step,
  index,
  onActive,
}: {
  step: Step;
  index: number;
  onActive: (index: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <li ref={ref} className="flex gap-5 py-8 lg:min-h-[42vh] lg:items-center">
      <span className="font-display text-sm font-extrabold text-emphasis tabular-nums" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-2xl font-bold text-primary sm:text-3xl">{step.title}</h3>
        <p className="max-w-md text-lg text-foreground-muted">{step.body}</p>
      </div>
    </li>
  );
}

/** Six steps with a pinned visual that follows the step in view (desktop). The list alone tells the whole story. */
export function HowItWorksStory() {
  const [active, setActive] = useState(0);
  const step = STEPS[active] ?? STEPS[0];
  if (!step) return null;
  const Icon = step.icon;
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
      <div className="hidden lg:block">
        <div className="sticky top-28 flex aspect-square items-center justify-center rounded-[2rem] border border-border bg-surface">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="flex flex-col items-center gap-6 px-10 text-center"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: DURATION.normal, ease: EASE }}
            >
              <span className={cn('flex size-32 items-center justify-center rounded-[2rem]', step.tint)}>
                <Icon aria-hidden="true" className="size-14" strokeWidth={1.5} />
              </span>
              <p className="font-display text-2xl font-bold text-primary">{step.title}</p>
            </motion.div>
          </AnimatePresence>
          <ol className="absolute bottom-6 flex gap-2" aria-hidden="true">
            {STEPS.map((s, index) => (
              <li
                key={s.title}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 ease-brand',
                  index === active ? 'w-8 bg-primary' : 'w-1.5 bg-sand-300',
                )}
              />
            ))}
          </ol>
        </div>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {STEPS.map((s, index) => (
          <StepItem key={s.title} step={s} index={index} onActive={setActive} />
        ))}
      </ol>
    </div>
  );
}
