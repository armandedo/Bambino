'use client';

import type { ProductCard, SizeChartRow } from '@bambino/api-client';
import { buttonClasses, cn } from '@bambino/ui';
import { ArrowRight, Info, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import NextLink from 'next/link';
import { useId, useMemo, useState } from 'react';
import { ProductArt } from '../product-art';
import { DURATION, EASE } from '../motion/primitives';

const DAYS_PER_MONTH = 30.44;
const MAX_MONTHS = 24;

function monthsLabel(months: number): string {
  if (months === 0) return 'Newborn';
  return months === 1 ? '1 month' : `${months} months`;
}

/**
 * The size chart row for an age: the smallest size whose age range contains it. Uses the real chart from the API;
 * age is only one signal, so the UI says so and points to the fit finder for a personal recommendation.
 */
function sizeForAge(chart: SizeChartRow[], ageDays: number) {
  const usable = chart
    .filter((s) => s.minAgeDays !== null && s.maxAgeDays !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = usable.findIndex((s) => ageDays >= (s.minAgeDays ?? 0) && ageDays <= (s.maxAgeDays ?? 0));
  const resolved = index >= 0 ? index : usable.length - 1;
  return { current: usable[resolved] ?? null, next: usable[resolved + 1] ?? null };
}

/** Baby silhouette that grows with the slider. Decorative. */
function GrowingBaby({ months }: { months: number }) {
  const scale = 0.62 + (months / MAX_MONTHS) * 0.38;
  return (
    <div
      aria-hidden="true"
      className="relative flex aspect-[4/3] w-full items-end justify-center overflow-hidden rounded-2xl bg-brand-50 sm:aspect-square"
    >
      <div className="absolute inset-x-[12%] bottom-[10%] h-px bg-brand-200" />
      <motion.svg
        viewBox="0 0 100 140"
        className="relative mb-[10%] h-[78%] origin-bottom text-brand-800"
        animate={{ scale }}
        transition={{ duration: DURATION.normal, ease: EASE }}
      >
        <circle cx="50" cy="26" r="17" className="fill-accent-100" stroke="currentColor" strokeWidth="2.5" />
        <path
          d="M30 56c0-8 9-13 20-13s20 5 20 13l6 28-10 3-4-14v52H38V73l-4 14-10-3 6-28Z"
          className="fill-brand-200"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path d="M44 125h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </motion.svg>
    </div>
  );
}

export function GrowthSlider({ chart, products }: { chart: SizeChartRow[]; products: ProductCard[] }) {
  const sliderId = useId();
  const [months, setMonths] = useState(4);
  const ageDays = Math.round(months * DAYS_PER_MONTH);
  const { current, next } = useMemo(() => sizeForAge(chart, ageDays), [chart, ageDays]);
  const nextExchangeMonth = current?.maxAgeDays
    ? Math.max(months + 1, Math.ceil((current.maxAgeDays + 1) / DAYS_PER_MONTH))
    : null;
  const picks = useMemo(
    () =>
      current ? products.filter((p) => p.variants.some((v) => v.size.code === current.code)).slice(0, 3) : [],
    [products, current],
  );

  if (!current) return null;

  return (
    <div className="grid gap-8 rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
      <GrowingBaby months={months} />
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor={sliderId} className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-foreground-muted">Your baby’s age</span>
            <span className="font-display text-2xl font-semibold text-primary" aria-live="polite">
              {monthsLabel(months)}
            </span>
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={MAX_MONTHS}
            step={1}
            value={months}
            onChange={(event) => setMonths(Number(event.target.value))}
            aria-valuetext={`${monthsLabel(months)}: size ${current.label}`}
            className="h-11 w-full cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-foreground-muted" aria-hidden="true">
            <span>Newborn</span>
            <span>12 months</span>
            <span>24 months</span>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
            <dt className="text-sm text-brand-100">Size on our chart</dt>
            <dd className="font-display text-2xl font-semibold">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={current.code}
                  className="inline-block"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: DURATION.fast, ease: EASE }}
                >
                  {current.label}
                </motion.span>
              </AnimatePresence>
            </dd>
          </div>
          <div className="rounded-2xl bg-accent-50 p-4">
            <dt className="flex items-center gap-1.5 text-sm text-accent-soft-foreground">
              <RefreshCw aria-hidden="true" className="size-4" /> Next exchange
            </dt>
            <dd className="font-display text-xl font-semibold text-primary">
              {next && nextExchangeMonth !== null
                ? `Around ${monthsLabel(nextExchangeMonth)} → ${next.label}`
                : 'Largest size on the chart'}
            </dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-foreground-muted">In this size now</p>
          {picks.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nothing in this size in the shop yet.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3">
              {picks.map((product) => (
                <li key={product.id}>
                  <NextLink
                    href={`/shop/${product.slug}`}
                    className="group flex flex-col gap-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <div className="overflow-hidden rounded-xl">
                      <ProductArt
                        seed={product.slug}
                        className="aspect-square transition-transform duration-500 ease-brand group-hover:scale-105"
                      />
                    </div>
                    <span className="line-clamp-2 text-xs font-medium sm:text-sm">{product.name}</span>
                  </NextLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="flex gap-2 rounded-xl bg-surface-muted p-3 text-sm text-foreground-muted">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            A guide from our size chart using age only. Babies grow at their own pace, so the fit finder uses
            height and weight for a personal recommendation.
          </span>
        </p>
        <NextLink href="/fit" className={buttonClasses({ className: cn('w-fit gap-2') })}>
          Get a personal fit <ArrowRight aria-hidden="true" className="size-4" />
        </NextLink>
      </div>
    </div>
  );
}
