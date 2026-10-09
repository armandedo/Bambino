import { buttonClasses, cn } from '@bambino/ui';
import { ArrowRight, Ruler } from 'lucide-react';
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
      <div className="mx-auto grid max-w-6xl gap-x-14 gap-y-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:py-20">
        <div className="flex flex-col gap-8">
          <h1
            id="hero-title"
            className="max-w-[11ch] font-display text-[3rem] leading-[0.96] font-medium tracking-[-0.045em] text-primary sm:text-7xl lg:text-[5.75rem]"
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
            className="mt-2 flex flex-col-reverse border-l-2 border-primary"
          >
            {STAGES.map((stage, index) => (
              <li key={stage.label} className="relative flex items-center gap-4 py-1.5">
                <span
                  aria-hidden="true"
                  className={cn('ruler-mark h-0.5 bg-primary', stage.mark)}
                  style={{ animationDelay: `${0.15 + index * 0.12}s` }}
                />
                <span
                  className={cn(
                    'rounded-full px-3.5 py-1 text-sm font-medium text-foreground shadow-xs',
                    stage.tag,
                  )}
                >
                  {stage.label}
                </span>
                <span className="text-sm text-foreground-muted">{stage.range}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* The one photo, framed like a card: white margin, softly rounded inside. */}
        <div className="relative lg:self-start">
          <div className="rounded-[1.75rem] bg-surface p-2 shadow-md">
            <div className="relative aspect-[4/5] overflow-hidden rounded-[1.25rem] bg-sand-100">
              {/* The page's largest paint: fetched early, never lazy. */}
              <Image
                src={stockSrc(PHOTOS.heroMother)}
                alt={PHOTOS.heroMother.alt}
                fill
                sizes="(min-width: 1024px) 24rem, 100vw"
                fetchPriority="high"
                loading="eager"
                className="object-cover"
              />
            </div>
          </div>
          <p className="absolute bottom-6 left-6 flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-medium text-primary shadow-lg">
            <Ruler aria-hidden="true" className="size-4" />
            Sizes for 0–24 months
          </p>
        </div>
      </div>
    </section>
  );
}
