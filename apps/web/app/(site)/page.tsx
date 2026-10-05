import { CatalogueFiltersQuery, ProductsQuery, SubscriptionPlansQuery } from '@bambino/api-client';
import { EmptyState, buttonClasses } from '@bambino/ui';
import { ArrowRight, MapPin, PackageCheck, Ruler, ShieldCheck, Smartphone, Tag } from 'lucide-react';
import NextLink from 'next/link';
import { ApiErrorState } from '@/components/api-error';
import { ExchangeSequence } from '@/components/exchange/exchange-sequence';
import { GrowthSlider } from '@/components/hero/growth-slider';
import { Hero } from '@/components/hero/hero';
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives';
import { PlanCard } from '@/components/plan-card';
import { ProductCard } from '@/components/product-card';
import { SectionHeading } from '@/components/sections';
import { HowItWorksStory } from '@/components/story/how-it-works';
import { LifecycleLoop } from '@/components/story/lifecycle-loop';
import { load } from '@/lib/api';
import { PHOTOS, type StockPhoto, photoSrcSet, photoUrl } from '@/lib/stock-photos';

export const revalidate = 60;

const FIT_STEPS = [
  'Name and date of birth',
  'Height',
  'Weight',
  'How you like clothes to fit',
  'Your size, with reasons',
];

const TRUST = [
  {
    icon: MapPin,
    title: 'Designed in Kigali',
    body: 'Made for East African families, climates and budgets.',
  },
  {
    icon: Smartphone,
    title: 'Mobile money first',
    body: 'Built around MTN MoMo and Airtel Money, approved on your phone.',
  },
  {
    icon: PackageCheck,
    title: 'Delivered in Kigali',
    body: 'Standard and same-day delivery options at checkout.',
  },
  {
    icon: Tag,
    title: 'Every piece tracked',
    body: 'Each garment is tagged, so its whole life is on record.',
  },
];

function Photo({
  photo,
  aspect,
  className,
  sizes = '(min-width: 1024px) 50vw, 100vw',
}: {
  photo: StockPhoto;
  aspect: number;
  className?: string;
  sizes?: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-sand-100 ${className ?? ''}`}>
      <img
        src={photoUrl(photo, 1080, aspect)}
        srcSet={photoSrcSet(photo, aspect)}
        sizes={sizes}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover"
      />
    </div>
  );
}

export default async function HomePage() {
  const [plans, products, filters] = await Promise.all([
    load(SubscriptionPlansQuery),
    load(ProductsQuery, { first: 12, sort: 'NEWEST' }),
    load(CatalogueFiltersQuery),
  ]);
  const productList = products.ok ? products.data.products.edges.map((edge) => edge.node) : [];

  return (
    <>
      {/* 01 Hero */}
      <Hero />

      {/* 02 Growth interaction */}
      <section aria-labelledby="grow" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-col gap-10">
          <SectionHeading
            id="grow"
            eyebrow="Grow with them"
            title="Move the slider. Watch the wardrobe keep up."
            intro="Babies change size every few months. See which size fits at each age, and when the next exchange comes."
          />
          {filters.ok && filters.data.sizes.length > 0 ? (
            <Reveal>
              <GrowthSlider chart={filters.data.sizes} products={productList} />
            </Reveal>
          ) : filters.ok ? null : (
            <ApiErrorState error={filters.error} what="the size chart" />
          )}
        </div>
      </section>

      {/* 03 How it works */}
      <section aria-labelledby="how" className="bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-16 sm:px-6 lg:py-24">
          <SectionHeading
            id="how"
            eyebrow="How Bambino works"
            title="Subscribe once. Size up as they grow."
          />
          <HowItWorksStory />
        </div>
      </section>

      {/* 04 Sizing */}
      <section aria-labelledby="fit" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid items-center gap-10 rounded-[2rem] bg-primary p-8 text-primary-foreground sm:p-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <SectionHeading
              id="fit"
              tone="inverse"
              eyebrow="Find the right fit"
              title="The right size, with the reasons behind it."
              intro="Answer a few questions and we compare your baby’s measurements with our size chart. You see exactly why we chose the size."
            />
            <Reveal delay={0.2}>
              <NextLink
                href="/fit"
                className={buttonClasses({ variant: 'accent', size: 'lg', className: 'w-fit gap-2' })}
              >
                Start the fit finder <ArrowRight aria-hidden="true" className="size-5" />
              </NextLink>
            </Reveal>
          </div>
          <Stagger as="ol" className="flex flex-col gap-3">
            {FIT_STEPS.map((step, index) => (
              <StaggerItem
                as="li"
                key={step}
                className="flex items-center gap-4 rounded-2xl bg-brand-700 px-5 py-4"
              >
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground"
                >
                  {index === FIT_STEPS.length - 1 ? <Ruler className="size-4" /> : index + 1}
                </span>
                <span className="font-medium">{step}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* 05 Product showcase */}
      <section aria-labelledby="new" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:pb-24">
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <SectionHeading id="new" eyebrow="The collection" title="Soft everyday pieces." />
            <NextLink
              href="/shop"
              className="font-semibold text-link underline underline-offset-4 hover:decoration-2"
            >
              Shop everything
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
            <Stagger as="ul" className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {productList.slice(0, 4).map((product) => (
                <StaggerItem as="li" key={product.id} className="flex">
                  <ProductCard product={product} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {/* 06 Circular lifecycle */}
      <section aria-labelledby="circular" className="bg-surface-muted">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-24">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <SectionHeading
              id="circular"
              eyebrow="Circular by design"
              title="Every piece has a next chapter."
              intro="Nothing is reused without passing inspection, and every step of a garment’s life is recorded."
            />
            <Reveal>
              <Photo photo={PHOTOS.circular} aspect={16 / 10} className="aspect-[16/10]" />
            </Reveal>
          </div>
          <LifecycleLoop />
        </div>
      </section>

      {/* 07 Subscription plans */}
      <section aria-labelledby="plans" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-col gap-10">
          <SectionHeading
            id="plans"
            eyebrow="Subscriptions"
            title="One plan per baby. Change it any time."
            intro="Prices come straight from our system and are placeholders until launch."
            align="center"
          />
          {!plans.ok ? (
            <ApiErrorState error={plans.error} what="plans" />
          ) : plans.data.subscriptionPlans.length === 0 ? (
            <EmptyState title="No plans yet" description="Plans appear here once they are published." />
          ) : (
            <Stagger className="grid gap-6 pt-3 md:grid-cols-3" gap={0.12}>
              {plans.data.subscriptionPlans.map((plan, index) => (
                <StaggerItem key={plan.id}>
                  <PlanCard plan={plan} featured={index === 0} />
                </StaggerItem>
              ))}
            </Stagger>
          )}
        </div>
      </section>

      {/* 08 Exchange */}
      <section aria-labelledby="exchange" className="bg-primary">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-16 sm:px-6 lg:py-24">
          <SectionHeading
            id="exchange"
            tone="inverse"
            eyebrow="Exchange"
            title="Outgrown? Swap it for the next size."
            intro="No starting over. Send back what’s small, earn credit for what passes inspection, and choose the next size."
          />
          <ExchangeSequence tone="inverse" />
          <Reveal>
            <NextLink
              href="/exchange"
              className={buttonClasses({ variant: 'accent', className: 'w-fit gap-2' })}
            >
              How exchanges work <ArrowRight aria-hidden="true" className="size-4" />
            </NextLink>
          </Reveal>
        </div>
      </section>

      {/* 09 Rwanda / East Africa trust */}
      <section aria-labelledby="trust" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="flex flex-col gap-10">
          <SectionHeading
            id="trust"
            eyebrow="Made for here"
            title="Built for families in Rwanda and East Africa."
          />
          <Reveal className="grid gap-4 sm:grid-cols-3">
            <Photo
              photo={PHOTOS.kigaliSkyline}
              aspect={16 / 10}
              className="aspect-[16/10] sm:col-span-2 sm:aspect-auto sm:h-full"
              sizes="(min-width: 640px) 66vw, 100vw"
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-1">
              <Photo
                photo={PHOTOS.motherCarrying}
                aspect={4 / 3}
                className="aspect-[4/3]"
                sizes="(min-width: 640px) 33vw, 50vw"
              />
              <Photo
                photo={PHOTOS.kigaliHills}
                aspect={4 / 3}
                className="aspect-[4/3]"
                sizes="(min-width: 640px) 33vw, 50vw"
              />
            </div>
          </Reveal>
          <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map((item) => {
              const Icon = item.icon;
              return (
                <StaggerItem
                  as="li"
                  key={item.title}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-6"
                >
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
                  </span>
                  <h3 className="font-display text-lg font-bold text-primary">{item.title}</h3>
                  <p className="text-sm text-foreground-muted">{item.body}</p>
                </StaggerItem>
              );
            })}
          </Stagger>
          <p className="flex items-center gap-2 text-sm text-foreground-muted">
            <ShieldCheck aria-hidden="true" className="size-4 text-brand-500" />
            Preview: mobile money is being connected; this build uses test wallets.
          </p>
        </div>
      </section>

      {/* 10 Call to action */}
      <section aria-labelledby="start" className="px-4 pb-16 sm:px-6 lg:pb-24">
        <Reveal className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-[2rem] bg-accent-50 px-6 py-14 text-center sm:px-12">
          <h2
            id="start"
            className="font-display text-3xl font-extrabold tracking-tight text-primary sm:text-5xl"
          >
            Start with the right fit.
          </h2>
          <p className="max-w-xl text-lg text-foreground-muted">
            It takes about two minutes, and you see the reasons for every recommendation.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', className: 'gap-2' })}>
              Find the right fit <ArrowRight aria-hidden="true" className="size-5" />
            </NextLink>
            <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
              Explore plans
            </NextLink>
          </div>
        </Reveal>
      </section>
    </>
  );
}
