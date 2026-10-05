import { cn } from '@bambino/ui';
import type { ReactNode } from 'react';

/**
 * Entrance for headlines, intros and calls to action above the fold. A CSS animation of `transform` only (the
 * `.entrance` class in globals.css): never hidden, needs no JavaScript, and still for reduced motion. Use `Reveal`
 * for content further down, where a fade on scroll is fine.
 */
export function Entrance({
  children,
  className,
  delay = 0,
  as: Component = 'div',
  id,
}: {
  children: ReactNode;
  className?: string;
  /** Seconds, like the motion primitives. */
  delay?: number;
  as?: 'div' | 'p' | 'h1';
  id?: string;
}) {
  return (
    <Component
      id={id}
      className={cn('entrance', className)}
      style={delay ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </Component>
  );
}
