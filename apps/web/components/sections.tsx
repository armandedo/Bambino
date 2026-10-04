import { cn } from '@bambino/ui';
import type { ReactNode } from 'react';
import { Reveal } from './motion/primitives';

/** Eyebrow, editorial heading and intro used to open each landing section. */
export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  align = 'left',
  tone = 'default',
}: {
  id: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: 'left' | 'center';
  tone?: 'default' | 'inverse';
}) {
  return (
    <Reveal
      className={cn(
        'flex max-w-3xl flex-col gap-4',
        align === 'center' && 'mx-auto items-center text-center',
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'text-sm font-bold tracking-[0.14em] uppercase',
            tone === 'inverse' ? 'text-accent-200' : 'text-emphasis',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        id={id}
        className={cn(
          'font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl',
          tone === 'inverse' ? 'text-primary-foreground' : 'text-primary',
        )}
      >
        {title}
      </h2>
      {intro ? (
        <p className={cn('text-lg', tone === 'inverse' ? 'text-brand-100' : 'text-foreground-muted')}>
          {intro}
        </p>
      ) : null}
    </Reveal>
  );
}
