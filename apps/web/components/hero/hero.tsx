'use client';

import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import NextLink from 'next/link';
import { DURATION, EASE } from '../motion/primitives';
import { PHOTOS, photoSrcSet, photoUrl } from '@/lib/stock-photos';

const SIZES = [
  { label: '0–3M', tone: 'bg-brand-100 text-brand-700' },
  { label: '3–6M', tone: 'bg-accent-100 text-accent-800' },
  { label: '6–9M', tone: 'bg-brand-200 text-brand-900' },
] as const;

/**
 * A warm lifestyle photo with the growth story layered on top: three sizes stepping up, and the exchange promise.
 * Decorative (the headline carries the message), so it is hidden from screen readers.
 */
function HeroVisual() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[34rem] pb-6 sm:pb-0">
      <motion.div
        className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-accent-50 sm:-inset-6"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: DURATION.cinematic, ease: EASE, delay: 0.1 }}
      />
      <motion.div
        className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-sand-100 shadow-xl"
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.slow, ease: EASE, delay: 0.25 }}
      >
        <img
          src={photoUrl(PHOTOS.heroMother, 1080, 4 / 5)}
          srcSet={photoSrcSet(PHOTOS.heroMother, 4 / 5)}
          sizes="(min-width: 1024px) 34rem, 100vw"
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute top-4 left-4 flex gap-2">
          {SIZES.map((size, index) => (
            <motion.span
              key={size.label}
              className={`rounded-full px-3 py-1 text-xs font-bold shadow-sm ${size.tone}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: DURATION.fast, ease: EASE, delay: 1 + index * 0.15 }}
            >
              {size.label}
            </motion.span>
          ))}
        </div>
      </motion.div>
      <motion.div
        className="absolute -bottom-2 -left-3 hidden aspect-square w-[34%] overflow-hidden rounded-3xl border-4 border-surface shadow-lg sm:-left-8 sm:block"
        initial={{ opacity: 0, scale: 0.85, rotate: -6 }}
        animate={{ opacity: 1, scale: 1, rotate: -4 }}
        transition={{ duration: DURATION.slow, ease: EASE, delay: 0.75 }}
      >
        <img src={photoUrl(PHOTOS.heroBaby, 480, 1)} alt="" className="size-full object-cover" />
      </motion.div>
      <motion.div
        className="absolute right-3 -bottom-4 flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-md sm:-right-6 sm:bottom-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.normal, ease: EASE, delay: 1.5 }}
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
