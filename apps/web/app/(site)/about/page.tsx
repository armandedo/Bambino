import { buttonClasses } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import NextLink from 'next/link';
import { PageHero } from '@/components/page-hero';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

export const metadata: Metadata = { title: 'Our little story' };
export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="Hello from Bambino"
        title="For little people. And the people who love them."
        intro="Babywear for the wonderfully ordinary moments, from first cuddles to first adventures."
      />
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
        <div className="relative aspect-[4/5] overflow-hidden rounded-t-[45%] rounded-b-3xl bg-surface-muted">
          <Image
            src={stockSrc(PHOTOS.stepProfile)}
            alt={PHOTOS.stepProfile.alt}
            fill
            sizes="(min-width: 1024px) 500px, 90vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col items-start gap-6">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            A little less searching. A little more time together.
          </h2>
          <p className="text-lg leading-relaxed text-foreground-muted">
            Getting a little one dressed can mean a sleepy morning, a wriggly change or an outfit that was
            just right last week. We want finding their next piece to feel easier.
          </p>
          <p className="leading-relaxed text-foreground-muted">
            Bambino is a clothing shop for babies, kids and teens for families in Kigali. Browse everyday
            clothes by age, category and size, take a closer look at each piece, and choose what works for
            your family.
          </p>
          <p className="leading-relaxed text-foreground-muted">
            From newborn through age 17, we’re here for all the little stages in between.
          </p>
          <NextLink href="/shop" className={buttonClasses()}>
            Come have a look <ArrowRight className="size-4" aria-hidden="true" />
          </NextLink>
        </div>
      </section>
    </>
  );
}
