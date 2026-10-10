'use client';

import { cn } from '@bambino/ui';
import { Baby, Box, ClipboardList, type LucideIcon, RefreshCw, Ruler, Undo2 } from 'lucide-react';
import { AnimatePresence, motion, useInView } from 'motion/react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PHOTOS, type StockPhoto, stockSrc } from '@/lib/stock-photos';
import { DURATION, EASE } from '../motion/primitives';

interface Step {
  title: string;
  body: string;
  icon: LucideIcon;
  tint: string;
  photo: StockPhoto;
}

export const STEPS: Step[] = [
  {
    title: 'Tell us about your baby',
    body: 'Their name and birthday, plus height and weight if you have them handy. Only you can see this.',
    icon: Baby,
    tint: 'bg-brand-50 text-brand-700',
    photo: PHOTOS.stepProfile,
  },
  {
    title: 'Pick a plan',
    body: 'Monthly, every three months, or once a year. You can pause or stop whenever you like.',
    icon: ClipboardList,
    tint: 'bg-accent-50 text-accent-700',
    photo: PHOTOS.stepPlan,
  },
  {
    title: 'We work out the size',
    body: 'We suggest a size from the measurements and tell you why. If it looks wrong to you, change it.',
    icon: Ruler,
    tint: 'bg-brand-100 text-brand-800',
    photo: PHOTOS.stepFit,
  },
  {
    title: 'Your box arrives',
    body: 'Clothes in your baby’s size, brought to your door anywhere in Kigali.',
    icon: Box,
    tint: 'bg-accent-100 text-accent-800',
    photo: PHOTOS.stepBox,
  },
  {
    title: 'Send back what’s too small',
    body: 'Book a pickup from your account. We check every piece, and the ones in good shape earn you credit.',
    icon: Undo2,
    tint: 'bg-brand-50 text-brand-700',
    photo: PHOTOS.stepReturn,
  },
  {
    title: 'Get the next size up',
    body: 'Spend your credit on the next size. What you sent back gets washed and goes to another family.',
    icon: RefreshCw,
    tint: 'bg-accent-50 text-accent-700',
    photo: PHOTOS.stepExchange,
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
      <span className="font-display text-sm font-semibold text-emphasis tabular-nums" aria-hidden="true">
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="flex flex-col gap-2">
        <div className="relative mb-2 aspect-video w-full overflow-hidden rounded-2xl lg:hidden">
          <Image src={stockSrc(step.photo)} alt="" fill sizes="100vw" className="object-cover" />
        </div>
        <h3 className="font-display text-2xl font-semibold text-primary sm:text-3xl">{step.title}</h3>
        <p className="max-w-md text-lg text-foreground-muted">{step.body}</p>
      </div>
    </li>
  );
}

/** The pinned photo is half of the 80rem page on large screens. */
const STICKY_SIZES = '(min-width: 1024px) 38rem, 100vw';

/** Six steps with a pinned visual that follows the step in view (desktop). The list alone tells the whole story. */
export function HowItWorksStory() {
  const [active, setActive] = useState(0);
  const step = STEPS[active] ?? STEPS[0];
  if (!step) return null;
  const Icon = step.icon;
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
      <div className="hidden lg:block">
        <div className="sticky top-28 aspect-square overflow-hidden rounded-2xl border border-border bg-sand-100">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              className="absolute inset-0"
              initial={{ opacity: 0, scale: 1.04 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DURATION.normal, ease: EASE }}
            >
              <Image src={stockSrc(step.photo)} alt="" fill sizes={STICKY_SIZES} className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-900/80 via-brand-900/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-14 flex items-center gap-4 px-8">
                <span
                  className={cn('flex size-14 shrink-0 items-center justify-center rounded-2xl', step.tint)}
                >
                  <Icon aria-hidden="true" className="size-7" strokeWidth={1.75} />
                </span>
                <p className="font-display text-2xl font-semibold text-primary-foreground drop-shadow">{step.title}</p>
              </div>
            </motion.div>
          </AnimatePresence>
          {/* Loads the other steps' photos (same sizes, so the same files) for a smooth change between steps. */}
          <div className="pointer-events-none invisible absolute size-px overflow-hidden" aria-hidden="true">
            {STEPS.map((s) => (
              <Image key={s.title} src={stockSrc(s.photo)} alt="" fill sizes={STICKY_SIZES} />
            ))}
          </div>
          <ol className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2" aria-hidden="true">
            {STEPS.map((s, index) => (
              <li
                key={s.title}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300 ease-brand',
                  index === active ? 'w-8 bg-sand-0' : 'w-1.5 bg-sand-0/50',
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
