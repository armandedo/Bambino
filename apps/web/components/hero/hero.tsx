'use client';

import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import NextLink from 'next/link';
import { Entrance } from '../motion/entrance';
import { DURATION, EASE } from '../motion/primitives';
import { PHOTOS, photoSrcSet, photoUrl } from '@/lib/stock-photos';

const SIZES = [
  { label: '0–3M', tone: 'bg-brand-100 text-brand-700' },
  { label: '3–6M', tone: 'bg-accent-100 text-accent-800' },
  { label: '6–9M', tone: 'bg-brand-200 text-brand-900' },
] as const;

/**
 * A warm lifestyle photo with the growth story layered on top: three sizes stepping up, and the exchange promise.
 * Decorative (the headline carries the message), so it is hidden from screen readers. The main photo is the
 * page's largest paint, so it uses the CSS entrance (visible from the first paint); only the layers around it fade.
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
      <Entrance
        delay={0.1}
        className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-sand-100 shadow-xl"
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
      </Entrance>
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
          <span className="block font-bold text-primary">Too small? We swap it.</span>
          <span className="text-foreground-muted">Next size up, at your door</span>
        </span>
      </motion.div>
    </div>
  );
}

/** A hand-drawn underline under one word of the headline. Decorative. */
function Scribble() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 220 18"
      preserveAspectRatio="none"
      className="absolute -bottom-2 left-0 h-3 w-full text-accent sm:-bottom-3 sm:h-4"
    >
      <path
        d="M3 12c38-7 84-10 128-8 30 1 56 4 86 1"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Hero() {
  // The words render on the server and are visible before any JavaScript runs; only the photo animates in.
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pt-8 pb-16 sm:px-6 md:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-24">
        <div className="flex flex-col gap-6">
          <p className="text-base font-medium text-brand-600">
            <span lang="rw" className="font-bold text-accent-700">
              Muraho!
            </span>{' '}
            We&rsquo;re Bambino, a babywear subscription from Kigali.
          </p>
          <h1
            id="hero-title"
            className="font-display text-[2.5rem] leading-[1.05] font-extrabold tracking-tight text-primary sm:text-6xl"
          >
            Your baby is going to outgrow{' '}
            <span className="relative inline-block whitespace-nowrap">
              everything.
              <Scribble />
            </span>
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-foreground-muted">
            Every few months a whole drawer stops fitting. We bring clothes in the size your baby is now, pick
            them up when they get small, and bring the next size. One monthly fee, and nothing left forgotten
            at the back of a cupboard.
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
              Find my baby&rsquo;s size <ArrowRight aria-hidden="true" className="size-5" />
            </NextLink>
            <NextLink
              href="/plans"
              className="px-2 py-3 font-semibold text-primary underline decoration-accent decoration-2 underline-offset-4 hover:decoration-primary"
            >
              or see what it costs
            </NextLink>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}
