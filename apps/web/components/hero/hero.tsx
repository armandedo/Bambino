import { buttonClasses } from '@bambino/ui';
import { ArrowRight, Heart } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-background">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-10 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:py-16">
        <div className="flex flex-col items-start gap-6">
          <p className="flex items-center gap-2 text-sm font-medium text-emphasis">
            <span className="h-px w-8 bg-current" aria-hidden="true" /> For their little everyday adventures
          </p>
          <h1
            id="hero-title"
            className="max-w-[12ch] font-display text-5xl leading-[1.06] font-semibold tracking-[-0.055em] text-primary sm:text-6xl lg:text-7xl"
          >
            Little clothes.
            <br />
            <span className="text-emphasis">Lovely everyday</span> moments.
          </h1>
          <p className="max-w-[39ch] text-lg leading-relaxed text-foreground-muted">
            From first cuddles to finding their own style. Shop clothes for babies, kids and teens, from
            newborn through age 17, right here in Kigali.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1">
            <NextLink href="/shop" className={buttonClasses({ size: 'lg' })}>
              Shop little favourites <ArrowRight aria-hidden="true" className="size-4" />
            </NextLink>
            <NextLink href="#ages" className="py-3 text-sm font-medium underline underline-offset-4">
              Find their age & size
            </NextLink>
          </div>
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <Heart aria-hidden="true" className="size-4 text-emphasis" /> Newborn to 17 years. A little
            something for every stage.
          </p>
        </div>
        <div className="relative mx-auto w-full max-w-lg pb-7 pl-4 sm:pl-6">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-7 bottom-0 rounded-t-[46%] rounded-b-[2rem] bg-accent-soft"
          />
          <div className="relative aspect-[4/4.5] overflow-hidden rounded-t-[46%] rounded-b-[2rem] bg-sand-200">
            <Image
              src={stockSrc(PHOTOS.heroMother)}
              alt={PHOTOS.heroMother.alt}
              fill
              sizes="(min-width: 1024px) 480px, 90vw"
              fetchPriority="high"
              loading="eager"
              className="object-cover"
            />
          </div>
          <div className="absolute right-2 bottom-1 flex items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-4 shadow-sm sm:-right-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft">
              <Heart className="size-5 text-emphasis" aria-hidden="true" />
            </span>
            <span className="text-sm">
              <strong className="block font-semibold">For the moments that matter.</strong>
              <span className="text-foreground-muted">And the wonderfully ordinary ones.</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
