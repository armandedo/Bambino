import { ProductsQuery, SubscriptionPlansQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { ArrowRight, Check } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { Hero } from '@/components/hero/hero';
import { PlanCard } from '@/components/plan-card';
import { ProductCard } from '@/components/product-card';
import { SectionHeading } from '@/components/sections';
import { load } from '@/lib/api';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

export const revalidate = 60;

/** Three short facts in the band under the hero. */
const HIGHLIGHTS = [
  { title: 'Delivered in Kigali', body: 'Standard or same-day delivery' },
  { title: 'Pay by mobile money', body: 'MTN MoMo and Airtel Money' },
  { title: 'Swap as they grow', body: 'The next size, whenever you need it' },
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

/** Sections alternate white and a light tint, like the reference design; all share one width and rhythm. */
const SECTION = 'mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24';

export default async function HomePage() {
  const [plans, products] = await Promise.all([
    load(SubscriptionPlansQuery),
    load(ProductsQuery, { first: 4, sort: 'NEWEST' }),
  ]);
  const productList = products.ok ? products.data.products.edges.map((edge) => edge.node) : [];

  return (
    <>
      <Hero />

      {/* Highlights */}
      <section aria-label="Why Bambino" className="bg-primary text-primary-foreground">
        <ul className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-center sm:grid-cols-3 sm:px-6">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="flex flex-col gap-1">
              <span className="font-display text-xl font-semibold">{item.title}</span>
              <span className="text-sm text-brand-100">{item.body}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className={SECTION}>
        <div className="flex flex-col gap-10">
          <SectionHeading id="how" eyebrow="How it works" title="Four simple steps" />
          <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-7"
              >
                <span
                  aria-hidden="true"
                  className="flex size-10 items-center justify-center rounded-full bg-surface-muted font-semibold text-primary"
                >
                  {index + 1}
                </span>
                <h3 className="font-display text-lg font-semibold text-foreground">{step.title}</h3>
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
      <section aria-labelledby="new" className="bg-surface-muted">
        <div className={SECTION}>
          <div className="flex flex-col gap-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHeading id="new" eyebrow="The clothes" title="Soft everyday basics" />
              <NextLink href="/shop" className={buttonClasses({ variant: 'outline' })}>
                Shop all clothes
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
            eyebrow="Plans"
            title="One simple plan per baby"
            intro="Change or pause your plan whenever you need to. Prices are placeholders until launch."
          />
          {!plans.ok ? (
            <ApiErrorState error={plans.error} what="plans" />
          ) : plans.data.subscriptionPlans.length === 0 ? (
            <EmptyState title="No plans yet" description="Plans appear here once they are published." />
          ) : (
            <div className="grid gap-6 pt-3 md:grid-cols-3">
              {plans.data.subscriptionPlans.map((plan, index) => (
                <PlanCard key={plan.id} plan={plan} featured={index === 0} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Swapping and reuse */}
      <section aria-labelledby="swap" className="bg-surface-muted">
        <div className={`${SECTION} grid items-center gap-10 lg:grid-cols-2 lg:gap-16`}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-sand-100">
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
              eyebrow="When clothes get small"
              title="Swap them for the next size"
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

      {/* Call to action */}
      <section aria-labelledby="start" className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-16 text-center sm:px-6 lg:py-20">
          <h2 id="start" className="font-display text-3xl font-semibold sm:text-[2.5rem]">
            Not sure of your baby&rsquo;s size?
          </h2>
          <p className="max-w-xl text-lg text-brand-100">
            Answer four quick questions and we&rsquo;ll suggest a size. It takes about two minutes.
          </p>
          <NextLink href="/fit" className={buttonClasses({ variant: 'accent', size: 'lg' })}>
            Start the fit finder <ArrowRight aria-hidden="true" className="size-4" />
          </NextLink>
        </div>
      </section>
    </>
  );
}
