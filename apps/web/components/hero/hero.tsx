'use client';

import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import NextLink from 'next/link';
import { DURATION, EASE } from '../motion/primitives';
import { Garment } from './garment';

const SIZES = [
  { label: '0–3M', scale: 0.7, tone: 'fill-brand-100 text-brand-500', rotate: -8, x: '4%', y: '42%' },
  { label: '3–6M', scale: 0.85, tone: 'fill-accent-100 text-accent-600', rotate: 4, x: '34%', y: '14%' },
  { label: '6–9M', scale: 1, tone: 'fill-brand-200 text-brand-800', rotate: -3, x: '58%', y: '40%' },
] as const;

/**
 * The growth story in one image: the same garment in three sizes, settling into place in order, each tagged with
 * its size. Decorative (the headline carries the message), so it is hidden from screen readers.
 */
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-square w-full max-w-[34rem]">
      <motion.div
        className="absolute inset-[6%] rounded-full bg-accent-50"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: DURATION.cinematic, ease: EASE, delay: 0.2 }}
      />
      <motion.div
        className="absolute inset-[18%] rounded-full border border-dashed border-brand-200"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DURATION.slow, delay: 0.6 }}
      />
      {SIZES.map((size, index) => (
        <motion.div
          key={size.label}
          className="absolute w-[38%]"
          style={{ left: size.x, top: size.y }}
          initial={{ opacity: 0, y: 40, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: size.rotate }}
          transition={{ duration: DURATION.slow, ease: EASE, delay: 0.7 + index * 0.18 }}
        >
          <div style={{ transform: `scale(${size.scale})` }} className="origin-bottom">
            <Garment className={size.tone} />
          </div>
          <motion.span
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-bold whitespace-nowrap text-primary shadow-sm"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: DURATION.fast, ease: EASE, delay: 1.2 + index * 0.18 }}
          >
            {size.label}
          </motion.span>
        </motion.div>
      ))}
      <motion.div
        className="absolute right-[4%] bottom-[8%] flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-md"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, ease: EASE, delay: 1.9 }}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ArrowRight className="size-4" strokeWidth={2.25} />
        </span>
        <span className="text-sm leading-tight">
          <span className="block font-bold text-primary">Next size, not a new wardrobe</span>
          <span className="text-foreground-muted">Swap as your baby grows</span>
        </span>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const rise = (delay: number) => ({
    initial: { opacity: 0, y: 28 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: DURATION.slow, ease: EASE, delay },
  });
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-10 pb-16 sm:px-6 md:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24">
        <div className="flex flex-col gap-7">
          <motion.p
            {...rise(0.05)}
            className="w-fit rounded-full border border-brand-200 bg-surface px-3 py-1 text-sm font-semibold text-brand-600"
          >
            Babywear subscription · Designed in Kigali
          </motion.p>
          <motion.h1
            id="hero-title"
            {...rise(0.15)}
            className="font-display text-[2.6rem] leading-[1.02] font-extrabold tracking-tight text-primary sm:text-6xl lg:text-7xl"
          >
            Clothes that grow
            <br className="hidden sm:block" /> with your baby.
          </motion.h1>
          <motion.p {...rise(0.3)} className="max-w-xl text-lg text-foreground-muted sm:text-xl">
            Smart, sustainable babywear — hassle-free, every month. We find the right size, deliver it, and
            swap it for the next one when your baby grows.
          </motion.p>
          <motion.div {...rise(0.45)} className="flex flex-col gap-3 sm:flex-row">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
              Find the right fit <ArrowRight aria-hidden="true" className="size-5" />
            </NextLink>
            <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
              Explore plans
            </NextLink>
          </motion.div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
