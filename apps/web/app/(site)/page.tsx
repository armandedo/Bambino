import { CatalogueFiltersQuery, ProductsQuery, SubscriptionPlansQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { ArrowRight, Check, RefreshCw, Smartphone, Truck } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { CategoryTiles } from '@/components/category-tiles';
import { Hero } from '@/components/hero/hero';
import { PlanCard } from '@/components/plan-card';
import { ProductCard } from '@/components/product-card';
import { SectionHeading } from '@/components/sections';
import { load } from '@/lib/api';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

export const revalidate = 60;

/** Three short facts in the band under the hero. */
const HIGHLIGHTS = [
  { icon: Truck, title: 'Delivered in Kigali', body: 'Standard or same-day delivery' },
  { icon: Smartphone, title: 'Pay by mobile money', body: 'MTN MoMo and Airtel Money' },
  { icon: RefreshCw, title: 'Swap as they grow', body: 'The next size, whenever you need it' },
];

const STEPS = [
  {
    title: 'Tell us about your baby',
    body: 'Age, and height and weight if you know them. We suggest a size.',
  },
  { title: 'Choose a plan', body: 'Monthly, every three months or yearly. Pause or stop any time.' },
  { title: 'Get your box', body: 'Clothes in your baby’s size, delivered to your door.' },
  { title: 'Swap when it’s small', body: 'We collect what no longer fits and bring the next size up.' },
];

const SWAP_POINTS = [
  'Book a pickup from your account',
  'We check every piece by hand',
  'Pieces in good shape earn you credit',
  'Clean pieces go on to another family',
];

/** Sections alternate paper and a pale ink tint; all share one width and rhythm. */
const SECTION = 'mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24';

export default async function HomePage() {
  const [plans, products, filters] = await Promise.all([
    load(SubscriptionPlansQuery),
    load(ProductsQuery, { first: 4, sort: 'NEWEST' }),
    load(CatalogueFiltersQuery),
  ]);
  const categories = filters.ok ? filters.data.categories : [];
  const productList = products.ok ? products.data.products.edges.map((edge) => edge.node) : [];

  return (
    <>
      <Hero />

      {/* Highlights: a quiet strip of the three facts a parent asks first. */}
      <section aria-label="Why Bambino" className="bg-surface shadow-sm">
        <ul className="mx-auto grid max-w-6xl divide-y divide-border px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-6">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="flex items-center gap-4 py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <item.icon aria-hidden="true" className="size-8 shrink-0 text-primary" strokeWidth={1.5} />
              <span className="flex flex-col">
                <span className="font-semibold text-primary">{item.title}</span>
                <span className="text-sm text-foreground-muted">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Categories */}
      {categories.length > 0 ? (
        <section aria-labelledby="browse" className={`${SECTION} pb-4 lg:pb-8`}>
          <div className="flex flex-col gap-8">
            <SectionHeading id="browse" title="Shop by category" />
            <CategoryTiles categories={categories} />
          </div>
        </section>
      ) : null}

      {/* How it works: a real sequence, so the steps are numbered; white cards. */}
      <section aria-labelledby="how" className={SECTION}>
        <div className="flex flex-col gap-10">
          <SectionHeading id="how" title="How it works" />
          <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-[1.75rem] bg-surface p-7 shadow-sm">
                <span
                  aria-hidden="true"
                  className="flex size-11 items-center justify-center rounded-full bg-accent font-display text-xl font-medium text-accent-foreground tabular-nums"
                >
                  {index + 1}
                </span>
                <h3 className="font-display text-xl font-semibold tracking-tight text-primary">
                  {step.title}
                </h3>
                <p className="text-foreground-muted">{step.body}</p>
              </li>
            ))}
          </ol>
          <NextLink
            href="/how-it-works"
            className="w-fit font-semibold text-link underline underline-offset-4 hover:decoration-2"
          >
            Read the full guide
          </NextLink>
        </div>
      </section>

      {/* Products */}
      <section aria-labelledby="new">
        <div className={SECTION}>
          <div className="flex flex-col gap-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading id="new" title="New this month" />
              <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
                View all clothes <ArrowRight aria-hidden="true" className="size-4" />
              </NextLink>
            </div>
            {!products.ok ? (
              <ApiErrorState error={products.error} what="products" />
            ) : productList.length === 0 ? (
              <EmptyState
                title="The shop is empty"
                description="Products appear here once they are published."
              />
            ) : (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {productList.slice(0, 4).map((product) => (
                  <li key={product.id} className="flex">
                    <ProductCard product={product} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Plans */}
      <section aria-labelledby="plans" className={SECTION}>
        <div className="flex flex-col gap-10">
          <SectionHeading
            id="plans"
            title="One plan per baby"
            intro="Change or pause your plan whenever you need to. Prices are placeholders until launch."
          />
          {!plans.ok ? (
            <ApiErrorState error={plans.error} what="plans" />
          ) : plans.data.subscriptionPlans.length === 0 ? (
            <EmptyState title="No plans yet" description="Plans appear here once they are published." />
          ) : (
            <div className="flex flex-col gap-4">
              {plans.data.subscriptionPlans.map((plan, index) => (
                <PlanCard key={plan.id} plan={plan} featured={index === 0} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Swapping and reuse */}
      <section aria-labelledby="swap" className="bg-surface">
        <div className={`${SECTION} grid items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-sand-100">
            <Image
              src={stockSrc(PHOTOS.circular)}
              alt={PHOTOS.circular.alt}
              fill
              sizes="(min-width: 1024px) 34rem, 100vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col gap-6">
            <SectionHeading
              id="swap"
              title="Swap for the next size when they grow"
              intro="No need to buy a new wardrobe. Send back what no longer fits and choose the next size."
            />
            <ul className="flex flex-col gap-3">
              {SWAP_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3 text-foreground">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <NextLink href="/exchange" className={buttonClasses({ className: 'w-fit' })}>
              How swapping works
            </NextLink>
          </div>
        </div>
      </section>

      {/* Three ways in: the fit finder, swapping and plans. */}
      <section aria-label="Get started" className={SECTION}>
        <ul className="grid gap-4 lg:grid-cols-3">
          {[
            {
              href: '/fit',
              title: 'Not sure of your baby’s size?',
              body: 'Answer four quick questions and we’ll suggest a size.',
              action: 'Start the fit finder',
              tone: 'bg-primary text-primary-foreground',
              bodyTone: 'text-brand-200',
              button: buttonClasses({ variant: 'accent' }),
            },
            {
              href: '/exchange',
              title: 'Outgrown it already?',
              body: 'Swap what is small for the next size and earn credit.',
              action: 'How swapping works',
              tone: 'bg-accent text-accent-foreground',
              bodyTone: 'text-accent-foreground',
              button: buttonClasses({ variant: 'primary' }),
            },
            {
              href: '/plans',
              title: 'One plan per baby',
              body: 'Monthly, every three months or yearly. Pause or stop any time.',
              action: 'See plans and prices',
              tone: 'bg-surface text-primary',
              bodyTone: 'text-foreground-muted',
              button: buttonClasses({ variant: 'outline' }),
            },
          ].map((card) => (
            <li
              key={card.href}
              className={`flex flex-col items-start gap-4 rounded-[1.75rem] p-8 shadow-sm ${card.tone}`}
            >
              <h2 className="font-display text-2xl leading-tight font-semibold tracking-tight">
                {card.title}
              </h2>
              <p className={`max-w-[34ch] ${card.bodyTone}`}>{card.body}</p>
              <NextLink href={card.href} className={`${card.button} mt-auto`}>
                {card.action} <ArrowRight aria-hidden="true" className="size-4" />
              </NextLink>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
