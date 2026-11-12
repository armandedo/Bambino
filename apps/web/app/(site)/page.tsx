import { CatalogueFiltersQuery, ProductsQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { Plus } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { CategoryTiles } from '@/components/category-tiles';
import { Hero } from '@/components/hero/hero';
import { ProductCard } from '@/components/product-card';
import { load } from '@/lib/api';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

const SECTION = 'retail-container py-12 md:py-16 lg:py-20';
const HEADING = 'text-[clamp(1.75rem,3.4vw,2.5rem)] leading-[1.1] font-semibold tracking-[-0.035em]';
const TEXT_LINK = 'rounded-md py-3 font-medium underline underline-offset-[5px]';

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
      <Hero featured={productList[0]} />

      <section aria-labelledby="new" className={`${SECTION} border-t border-border`}>
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-x-6 md:mb-9">
          <h2 id="new" className={HEADING}>
            Just arrived
          </h2>
          <NextLink href="/shop" className={TEXT_LINK}>
            See everything
          </NextLink>
        </div>
        {!products.ok ? (
          <ApiErrorState error={products.error} what="products" />
        ) : productList.length === 0 ? (
          <EmptyState
            title="Nothing in stock right now"
            description="New clothes appear here as soon as they arrive."
            action={
              <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
                Shop everything
              </NextLink>
            }
          />
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:gap-x-6 lg:grid-cols-4">
            {productList.map((product) => (
              <li key={product.id} className="flex">
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
        {categories.length > 0 ? (
          <div className="mt-12 md:mt-16">
            <h2 id="browse" className="mb-4 text-xl font-semibold tracking-[-0.02em]">
              Shop by type
            </h2>
            <CategoryTiles categories={categories} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="story" className="bg-accent-soft">
        <div className="retail-container grid items-center gap-8 py-12 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-14 md:py-16 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-24 lg:py-20">
          <div className="arch-hero relative overflow-hidden bg-accent">
            <Image
              src={stockSrc(PHOTOS.circular)}
              alt={PHOTOS.circular.alt}
              fill
              sizes="(min-width: 1024px) 360px, (min-width: 768px) 300px, 92vw"
              className="object-cover"
            />
          </div>
          <div className="flex max-w-[34rem] flex-col items-start">
            <h2 id="story" className={HEADING}>
              One shop, from their first week to their last school year.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-accent-soft-foreground md:mt-5">
              Bambino brings clothes for babies, kids and teens together for families in Kigali. Not sure what
              fits? Start with their age and the size finder shows which sizes to look for.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-2">
              <NextLink
                href="/fit"
                className="pill-lift inline-flex h-[52px] items-center rounded-full bg-primary px-[26px] text-[17px] font-semibold text-primary-foreground hover:bg-primary-hover"
              >
                Find their size
              </NextLink>
              <NextLink href="/how-it-works" className={TEXT_LINK}>
                Shopping and delivery
              </NextLink>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="questions"
        className={`${SECTION} grid gap-6 lg:grid-cols-[.8fr_1.2fr] lg:gap-16`}
      >
        <h2 id="questions" className={HEADING}>
          Before you buy
        </h2>
        <div className="divide-y divide-border border-y border-border">
          {FAQS.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3 text-lg font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus
                  aria-hidden="true"
                  className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-45"
                  strokeWidth={1.8}
                />
              </summary>
              <p className="max-w-[62ch] pb-6 leading-relaxed text-foreground-muted">
                {item.answer}
                {item.question === 'How do I pay?' && process.env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true'
                  ? ' This preview uses test wallets only.'
                  : null}
              </p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
