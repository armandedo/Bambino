import { buttonClasses, cn } from '@bambino/ui';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import NextLink from 'next/link';
import { PHOTOS, stockSrc } from '@/lib/stock-photos';

/**
 * The sizes a baby moves through, drawn as marks on a doorframe. Each stage has its own colour, which follows the
 * baby through tags, plans and boxes. Placeholder ranges until the size chart from the API is wired in here.
 */
const STAGES = [
  { label: 'Newborn', range: '0–3 months', tag: 'bg-stage-newborn', mark: 'w-10' },
  { label: 'Early', range: '3–6 months', tag: 'bg-stage-early', mark: 'w-14' },
  { label: 'Mid', range: '6–12 months', tag: 'bg-stage-mid', mark: 'w-20' },
  { label: 'Toddler', range: '12–18 months', tag: 'bg-stage-toddler', mark: 'w-28' },
  { label: 'Big', range: '18–24 months', tag: 'bg-stage-big', mark: 'w-36' },
] as const;

/**
 * The home page's opening: the headline, one main action, and a growth ruler that shows the stages a baby moves
 * through. Server-rendered; the ruler marks draw in once (transform only) and are readable without JavaScript.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden bg-background">
      <div className="mx-auto grid max-w-6xl gap-x-12 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:py-20">
        <div className="flex flex-col gap-8">
          <h1
            id="hero-title"
            className="max-w-[12ch] font-display text-[2.75rem] leading-[0.98] font-bold tracking-[-0.02em] text-primary uppercase sm:text-7xl lg:text-[5.25rem]"
          >
            The right size, every month.
          </h1>
          <p className="max-w-[46ch] text-lg leading-relaxed text-foreground-muted sm:text-xl">
            Babies outgrow clothes every few months. We bring clothes in your baby&rsquo;s size to your door
            in Kigali, collect them when they get small, and bring the next size up.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <NextLink href="/fit" className={buttonClasses({ size: 'lg', variant: 'accent' })}>
              Find my baby&rsquo;s size <ArrowRight aria-hidden="true" className="size-4" />
            </NextLink>
            <NextLink href="/plans" className={buttonClasses({ size: 'lg', variant: 'outline' })}>
              See plans and prices
            </NextLink>
          </div>

          {/* The ruler: oldest stage at the top, like marks on a doorframe. */}
          <ol
            aria-label="Baby sizes from newborn to 24 months"
            className="mt-2 flex flex-col-reverse border-l-2 border-primary pl-0"
          >
            {STAGES.map((stage, index) => (
              <li key={stage.label} className="group relative flex items-center gap-4 py-2">
                <span
                  aria-hidden="true"
                  className={cn('ruler-mark h-0.5 bg-primary', stage.mark)}
                  style={{ animationDelay: `${0.15 + index * 0.12}s` }}
                />
                <span
                  className={cn('rounded-md px-2.5 py-1 text-sm font-semibold text-foreground', stage.tag)}
                >
                  {stage.label}
                </span>
                <span className="text-sm text-foreground-muted">{stage.range}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* A doorway on large screens: the arch frames the one photo. A wide band below the ruler on small ones. */}
        <div className="relative lg:mx-auto lg:w-full lg:max-w-[17rem]">
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-sand-100 lg:aspect-auto lg:h-full lg:min-h-[30rem] lg:rounded-t-[999px] lg:rounded-b-none">
            {/* The page's largest paint: fetched early, never lazy. */}
            <Image
              src={stockSrc(PHOTOS.heroMother)}
              alt={PHOTOS.heroMother.alt}
              fill
              sizes="(min-width: 1024px) 17rem, 100vw"
              fetchPriority="high"
              loading="eager"
              className="object-cover"
            />
          </div>
          {/* The one stamp on the photo: the span of sizes Bambino covers. */}
          <p className="absolute -bottom-4 left-4 flex size-24 flex-col items-center justify-center rounded-full bg-primary text-center leading-tight text-primary-foreground shadow-md sm:-left-6 lg:-left-10 lg:size-28">
            <span className="text-xs">Sizes for</span>
            <span className="font-display text-xl font-bold text-accent">0–24</span>
            <span className="text-xs">months</span>
          </p>
        </div>
      </div>
    </section>
  );
}
