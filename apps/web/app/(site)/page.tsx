import { CatalogueFiltersQuery, ProductsQuery } from '@bambino/api-client';
import { AGE_GROUPS } from '@bambino/config';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { ArrowRight, Heart, Ruler, ShoppingBag, Truck } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { CategoryTiles } from '@/components/category-tiles';
import { Hero } from '@/components/hero/hero';
import { ProductCard } from '@/components/product-card';
import { SectionHeading } from '@/components/sections';
import { load } from '@/lib/api';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

const SECTION = 'mx-auto max-w-6xl px-5 py-14 sm:px-6 lg:py-20';
const AGE_COLOURS = [
  'bg-stage-newborn',
  'bg-stage-early',
  'bg-stage-mid',
  'bg-stage-toddler',
  'bg-stage-big',
];
const AGE_NAMES = [
  'Hello, little one',
  'Growing every day',
  'On the move',
  'First little steps',
  'Big little adventures',
  'Ready for play',
  'Everyday discoveries',
  'Growing into themselves',
  'Their own kind of style',
];
const FAQS = [
  {
    question: 'How do I choose the right size?',
    answer:
      'Start with your child’s age, then check the available sizes and garment measurements. Ages are a guide; fit varies by brand and style. Our size finder explains the guidance available for each age.',
  },
  {
    question: 'Where do you deliver?',
    answer:
      'Delivery options depend on your address. Add your delivery details at checkout to see the available service, fee and estimated timing before you place your order.',
  },
  {
    question: 'How do I pay?',
    answer:
      'Your available payment options are shown at checkout. Review your order and delivery total before confirming.',
  },
];

export default async function HomePage() {
  const [products, filters] = await Promise.all([
    load(ProductsQuery, { first: 4, sort: 'NEWEST', filter: { oneTimeEligible: true, inStockOnly: true } }),
    load(CatalogueFiltersQuery),
  ]);
  const categories = filters.ok ? filters.data.categories : [];
  const productList = products.ok ? products.data.products.edges.map(({ node }) => node) : [];
  return (
    <>
      <Hero />
      <section aria-label="A little easier for parents" className="border-y border-border bg-surface">
        <ul className="mx-auto grid max-w-6xl gap-6 px-5 py-6 sm:grid-cols-3 sm:px-6">
          {[
            {
              icon: Heart,
              title: 'Pick what you love',
              body: 'Buy the pieces you need, whenever you need them.',
            },
            {
              icon: Ruler,
              title: 'A size for every little stage',
              body: 'Shop newborns, kids and teens through age 17.',
            },
            {
              icon: Truck,
              title: 'Delivery, made clear',
              body: 'See delivery options and costs at checkout.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon aria-hidden="true" className="mt-1 size-6 shrink-0 text-emphasis" strokeWidth={1.5} />
              <div>
                <h2 className="text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-foreground-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="new" className={SECTION}>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <SectionHeading
            id="new"
            eyebrow="A fresh little wardrobe"
            title="Meet their next favourites"
            intro="Bedtime, playtime, out-the-door time. Start with something lovely."
          />
          <NextLink
            href="/shop"
            className="flex items-center gap-2 py-3 text-sm font-semibold underline underline-offset-4"
          >
            Explore the shop <ArrowRight aria-hidden="true" className="size-4" />
          </NextLink>
        </div>
        {!products.ok ? (
          <ApiErrorState error={products.error} what="products" />
        ) : productList.length === 0 ? (
          <EmptyState
            title="A little something is on its way"
            description="Our next pieces will appear here as they arrive. Come back soon."
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-6 lg:grid-cols-4">
            {productList.map((product) => (
              <li key={product.id} className="flex">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="ages" className="bg-surface-muted">
        <div className={SECTION}>
          <SectionHeading
            id="ages"
            eyebrow="Small people. Big changes."
            title="What stage are they at?"
            intro="Find their little corner of the shop. Age is a starting point; check each piece’s size before ordering."
          />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {AGE_GROUPS.map((group, index) => (
              <li key={group.slug}>
                <NextLink
                  href={`/shop?age=${group.slug}`}
                  className={`group flex h-full min-h-44 flex-col rounded-[1.5rem] border border-primary/10 p-5 transition-transform hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-focus ${AGE_COLOURS[index % AGE_COLOURS.length]}`}
                >
                  <span className="text-xs text-primary/75">{AGE_NAMES[index]}</span>
                  <span className="mt-auto pt-5 font-display text-2xl font-semibold tracking-tight">
                    {group.ages}
                  </span>
                  <span className="mt-3 flex items-center justify-between text-sm font-medium">
                    Shop this stage <ArrowRight className="size-4" aria-hidden="true" />
                  </span>
                </NextLink>
              </li>
            ))}
          </ul>
        </div>
      </section>
      {categories.length > 0 ? (
        <section aria-labelledby="browse" className={SECTION}>
          <SectionHeading
            id="browse"
            title="A little of everything they need"
            intro="Cosy nights, busy mornings and everything in between."
          />
          <div className="mt-7">
            <CategoryTiles categories={categories} />
          </div>
        </section>
      ) : null}
      <section
        aria-labelledby="story"
        className={`${SECTION} grid items-center gap-8 lg:grid-cols-2 lg:gap-16`}
      >
        <div className="relative aspect-[5/4] overflow-hidden rounded-[2rem] bg-sand-100">
          <Image
            src={stockSrc(PHOTOS.circular)}
            alt={PHOTOS.circular.alt}
            fill
            sizes="(min-width: 1024px) 520px, 90vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col items-start gap-6">
          <SectionHeading
            id="story"
            eyebrow="Hello from Bambino"
            title="Their world is growing. Let’s dress them for it."
            intro="Some days are for big adventures. Most are for cuddles, crumbs and another change of clothes. Bambino brings clothes for babies, kids and teens together in one easy-to-browse shop for families in Kigali."
          />
          <p className="text-foreground-muted">
            Choose a piece, find their size, and make it part of their everyday.
          </p>
          <NextLink href="/shop" className={buttonClasses()}>
            Find something for your little one <ArrowRight className="size-4" aria-hidden="true" />
          </NextLink>
        </div>
      </section>
      <section aria-labelledby="questions" className="border-t border-border bg-surface">
        <div className={`${SECTION} grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:gap-16`}>
          <SectionHeading
            id="questions"
            eyebrow="A little help"
            title="Questions before you shop?"
            intro="Here are a few things you might be wondering."
          />
          <div className="divide-y divide-border">
            {FAQS.map((item) => (
              <details key={item.question} className="group py-5">
                <summary className="flex min-h-8 cursor-pointer items-center justify-between gap-4 font-medium">
                  {item.question}
                  <span aria-hidden="true" className="text-xl group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="pt-4 text-sm leading-relaxed text-foreground-muted">
                  {item.answer}
                  {item.question === 'How do I pay?' && process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true'
                    ? ' This preview uses test wallets only.'
                    : null}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-accent-soft">
        <div className={`${SECTION} flex flex-col items-center gap-5 text-center`}>
          <ShoppingBag aria-hidden="true" className="size-8 text-emphasis" strokeWidth={1.4} />
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Something small. A whole lot of love.
          </h2>
          <p className="max-w-lg text-foreground-muted">
            Discover their next outfit, bedtime favourite or everyday layer.
          </p>
          <NextLink href="/shop" className={buttonClasses({ size: 'lg' })}>
            Let’s find their favourites <ArrowRight className="size-4" aria-hidden="true" />
          </NextLink>
        </div>
      </section>
    </>
  );
}
