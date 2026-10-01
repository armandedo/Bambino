import { cn } from '@bambino/ui';

const BACKGROUNDS = ['bg-brand-100', 'bg-accent-100', 'bg-sand-200', 'bg-brand-50', 'bg-accent-50'] as const;
const INKS = [
  'text-brand-600',
  'text-accent-600',
  'text-sand-600',
  'text-brand-500',
  'text-accent-500',
] as const;

function hash(text: string): number {
  let value = 0;
  for (const char of text) value = (value * 31 + char.charCodeAt(0)) >>> 0;
  return value;
}

/**
 * Drawn placeholder shown while a product has no photos (the seed catalogue has none).
 * Decorative only: the product name next to it carries the meaning.
 */
export function ProductArt({ seed, className }: { seed: string; className?: string }) {
  const index = hash(seed) % BACKGROUNDS.length;
  return (
    <div
      aria-hidden="true"
      className={cn('flex w-full items-center justify-center', BACKGROUNDS[index], className)}
    >
      <svg
        viewBox="0 0 120 120"
        className={cn('w-1/2', INKS[index])}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      >
        <path
          d="M44 18h32l6 8 20 10-8 18-12-6v52H38V48l-12 6-8-18 20-10 6-8Z"
          fill="currentColor"
          fillOpacity="0.12"
        />
        <path d="M48 18c2 6 7 9 12 9s10-3 12-9" />
        <circle cx="60" cy="56" r="2.5" fill="currentColor" />
        <circle cx="60" cy="68" r="2.5" fill="currentColor" />
        <circle cx="60" cy="80" r="2.5" fill="currentColor" />
      </svg>
    </div>
  );
}
