import type { ProductCard } from '@bambino/api-client';
import { MoneyText } from '@bambino/ui';
import Image from 'next/image';
import NextLink from 'next/link';
import { ProductPhoto } from '@/components/storefront/product-photo';
import { SHOP_AGES } from '@/lib/shop-ages';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

/**
 * Home page hero: the headline and the two ways in (everything, or by size), five doors to shop by age, and the
 * photograph in its arch. The arch, the doors and the product tag arrive in one CSS sequence (see globals.css);
 * the words are still from the first paint.
 */
export function Hero({ featured }: { featured?: ProductCard | undefined }) {
  const tagImage = featured?.images[0];
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden">
      <div className="retail-container hero-grid pt-1 pb-10 md:pt-4 md:pb-14 lg:pb-16">
        <div className="hero-copy max-md:mt-5">
          <h1
            id="hero-title"
            className="text-[clamp(2.3125rem,6vw,5rem)] leading-[1.02] font-semibold tracking-[-0.05em] md:max-w-[11.5ch] md:leading-none"
          >
            Clothes for every age, newborn to seventeen.
          </h1>
          <p className="mt-2.5 max-w-[40ch] text-foreground-muted md:mt-6 md:text-xl md:leading-normal">
            Shop for babies, kids and teens in one place, right here in Kigali.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-[22px] gap-y-2 md:mt-7 md:gap-x-7">
            <NextLink
              href="/shop"
              className="pill-lift inline-flex h-[52px] items-center rounded-full bg-primary px-[26px] text-[17px] font-semibold text-primary-foreground hover:bg-primary-hover md:h-[58px] md:px-8 md:text-lg"
            >
              Shop everything
            </NextLink>
            <NextLink
              href="/fit"
              className="rounded-md py-3 font-medium underline underline-offset-[5px] md:text-[17px]"
            >
              Find their size
            </NextLink>
          </div>
        </div>

        <nav id="ages" aria-label="Shop by age" className="hero-doors mt-[18px] md:mt-10 lg:mt-11">
          <ul className="no-scrollbar -mx-[var(--gutter)] flex gap-3 overflow-x-auto px-[var(--gutter)] pb-1 md:mx-0 md:grid md:grid-cols-[repeat(5,minmax(0,116px))] md:gap-4 md:overflow-visible md:p-0">
            {SHOP_AGES.map((age) => (
              <li key={age.slug} className="hero-door w-[92px] shrink-0 md:w-auto">
                <NextLink
                  href={`/shop?age=${age.slug}`}
                  className="group flex flex-col items-center rounded-2xl text-center"
                >
                  <span className="arch-door mb-1.5 flex w-full items-end justify-center overflow-hidden border border-border bg-surface pb-2 transition-colors duration-[250ms] group-hover:bg-accent-soft group-focus-visible:bg-accent-soft md:mb-2 md:pb-3">
                    <Image
                      src={age.image.src}
                      alt=""
                      width={age.image.width}
                      height={age.image.height}
                      unoptimized
                      loading="eager"
                      className="h-auto max-h-[72%] w-auto max-w-[76%] transition-transform duration-[350ms] ease-settle group-hover:-translate-y-2 group-active:-translate-y-1"
                    />
                  </span>
                  <span className="text-[15px] leading-snug font-semibold md:text-base">{age.label}</span>
                  <span className="text-[13px] leading-snug text-foreground-muted md:text-sm">
                    {age.ages}
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hero-art">
          <div aria-hidden="true" className="hero-art-back arch-hero bg-accent" />
          <div className="hero-art-photo arch-hero relative isolate overflow-hidden bg-accent-soft">
            <Image
              src={stockSrc(PHOTOS.heroMother)}
              alt={PHOTOS.heroMother.alt}
              fill
              sizes="(min-width: 1440px) 470px, (min-width: 768px) 34vw, 92vw"
              fetchPriority="high"
              loading="eager"
              className="object-cover object-[center_30%] md:object-[center_25%]"
            />
          </div>
          {featured ? (
            <NextLink
              href={`/shop/${featured.slug}`}
              className="hero-tag absolute bottom-14 left-0 z-10 flex items-center gap-3.5 rounded-[22px] bg-surface py-2.5 pr-5 pl-2.5 shadow-lift max-lg:hidden"
            >
              <span className="relative block size-[76px] shrink-0 overflow-hidden rounded-[14px]">
                <ProductPhoto src={tagImage?.url} alt="" sizes="76px" fit="contain" />
              </span>
              <span className="flex max-w-[170px] flex-col gap-[3px]">
                <span className="sr-only">New in: </span>
                <span className="leading-tight font-semibold">{featured.name}</span>
                {featured.priceFrom ? (
                  <MoneyText value={featured.priceFrom} className="text-[15px] text-foreground-muted" />
                ) : null}
              </span>
            </NextLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
