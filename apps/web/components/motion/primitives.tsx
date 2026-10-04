'use client';

import { motionTokens } from '@bambino/ui/tokens';
import { MotionConfig, motion } from 'motion/react';
import type { ReactNode } from 'react';

export const EASE = motionTokens.ease;
export const DURATION = motionTokens.duration;

/**
 * Site-wide motion settings: brand easing and timing, and `reducedMotion="user"`, so visitors who ask their system
 * for reduced motion get instant changes (opacity only, no movement) everywhere without per-component checks.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: DURATION.normal, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

const OFFSET: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: 24 },
  down: { x: 0, y: -24 },
  left: { x: 24, y: 0 },
  right: { x: -24, y: 0 },
  none: { x: 0, y: 0 },
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Where the content comes from: movement shows origin, it is not decoration. */
  from?: Direction;
  delay?: number;
  duration?: keyof typeof DURATION;
  as?: 'div' | 'section' | 'li' | 'p' | 'span' | 'h1' | 'h2';
  /** Animate on mount (above the fold) instead of when scrolled into view. */
  immediate?: boolean;
}

/** Fades and slides content in once, when it scrolls into view (or on mount for the hero). */
export function Reveal({
  children,
  className,
  from = 'up',
  delay = 0,
  duration = 'slow',
  as = 'div',
  immediate = false,
}: RevealProps) {
  const Component = motion[as];
  const hidden = { opacity: 0, ...OFFSET[from] };
  const shown = { opacity: 1, x: 0, y: 0, transition: { duration: DURATION[duration], ease: EASE, delay } };
  return (
    <Component
      className={className}
      initial={hidden}
      {...(immediate
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, margin: '0px 0px -10% 0px' } })}
    >
      {children}
    </Component>
  );
}

/** A list whose children appear one after another as it scrolls into view. */
export function Stagger({
  children,
  className,
  gap = 0.08,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  as?: 'div' | 'ul' | 'ol';
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </Component>
  );
}

export function StaggerItem({
  children,
  className,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Component = motion[as];
  return (
    <Component
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        shown: { opacity: 1, y: 0, transition: { duration: DURATION.slow, ease: EASE } },
      }}
    >
      {children}
    </Component>
  );
}
