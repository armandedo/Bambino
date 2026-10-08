import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

/**
 * The home page's opening: what Bambino is, one main action and one photo. Rendered on the server with no
 * animation, so it is readable at the first paint and without JavaScript.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-surface-muted">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <div className="flex flex-col gap-5">
          <p className="text-xs font-semibold tracking-[0.16em] text-emphasis uppercase">
            <span lang="rw">Muraho</span> · Babywear subscription in Kigali
          </p>
          <h1
            id="hero-title"
            className="font-display text-4xl leading-[1.15] font-semibold text-foreground sm:text-5xl lg:text-[3.5rem]"
          >
            Baby clothes in the right size, every month.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-foreground-muted">
            Babies outgrow clothes every few months. We deliver clothes in your baby&rsquo;s size, collect
            them when they get small, and bring the next size up.
          </p>
          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg' })}>
              Find my baby&rsquo;s size <ArrowRight aria-hidden="true" className="size-4" />
            </NextLink>
            <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
              See plans and prices
            </NextLink>
          </div>
        </div>
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100 lg:aspect-[5/4]">
          {/* The page's largest paint: fetched early, never lazy. */}
          <Image
            src={stockSrc(PHOTOS.heroMother)}
            alt={PHOTOS.heroMother.alt}
            fill
            sizes="(min-width: 1024px) 34rem, 100vw"
            fetchPriority="high"
            loading="eager"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
