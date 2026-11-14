'use client';

import { cn } from '@bambino/ui';
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useTransition,
} from 'react';

export interface ShopTab {
  key: string;
  href: string;
  label: string;
  /** A second, quieter line, such as the ages a group covers. */
  detail?: string;
}

interface ShopTabsProps {
  /** Names the navigation for screen readers, such as "Age groups". */
  label: string;
  tabs: ShopTab[];
  activeKey: string;
  /** `underline` for the age row, `pill` for the category chips. */
  variant: 'underline' | 'pill';
  className?: string;
}

const SLIDE = { type: 'spring', stiffness: 520, damping: 42, mass: 0.9 } as const;
const ROW = 'no-scrollbar -mx-[var(--gutter)] flex overflow-x-auto px-[var(--gutter)]';
const TAB =
  'relative flex min-h-12 shrink-0 flex-col justify-center border-b-2 border-transparent px-3 py-1.5 leading-tight whitespace-nowrap';
const CHIP =
  'relative inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors';

/**
 * A row of shop links (ages or categories) with a selection marker that slides to the chosen one. They stay real
 * links, so the choice lives in the address, opens in a new tab, and works without JavaScript. With JavaScript
 * the marker moves at once while the products load, the row scrolls sideways on small screens to keep the chosen
 * link in view, and the arrow keys move between links.
 */
export function ShopTabs({ label, tabs, activeKey, variant, className }: ShopTabsProps) {
  const router = useRouter();
  const groupId = useId();
  const reduced = useReducedMotion();
  const row = useRef<HTMLUListElement>(null);
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useOptimistic(activeKey);

  // Keep the chosen link visible in the sideways-scrolling row without moving the page itself.
  useEffect(() => {
    const scroller = row.current;
    const link = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!scroller || !link) return;
    const frame = scroller.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    const margin = 24;
    const delta =
      item.left < frame.left + margin
        ? item.left - frame.left - margin
        : item.right > frame.right - margin
          ? item.right - frame.right + margin
          : 0;
    if (delta) scroller.scrollBy({ left: delta, behavior: reduced ? 'instant' : 'smooth' });
  }, [current, reduced]);

  function choose(event: MouseEvent<HTMLAnchorElement>, tab: ShopTab) {
    // Leave new-tab and new-window clicks to the browser.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    startTransition(() => {
      setCurrent(tab.key);
      if (variant === 'pill') router.push(tab.href, { scroll: false });
      else router.push(tab.href);
    });
  }

  function moveFocus(event: KeyboardEvent<HTMLUListElement>) {
    const links = Array.from(row.current?.querySelectorAll<HTMLAnchorElement>('a') ?? []);
    const index = links.findIndex((link) => link === document.activeElement);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? links[(index + 1) % links.length]
        : event.key === 'ArrowLeft'
          ? links[(index - 1 + links.length) % links.length]
          : event.key === 'Home'
            ? links[0]
            : event.key === 'End'
              ? links[links.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    next.focus();
  }

  const pill = variant === 'pill';
  return (
    <nav aria-label={label} className={className}>
      <LayoutGroup id={groupId}>
        <motion.ul
          ref={row}
          layoutScroll
          onKeyDown={moveFocus}
          className={cn(ROW, pill ? 'gap-1.5 py-0.5' : undefined)}
        >
          {tabs.map((tab) => {
            const active = tab.key === current;
            const marker = active ? (
              <motion.span
                aria-hidden="true"
                layoutId="marker"
                transition={reduced ? { duration: 0 } : SLIDE}
                className={
                  pill
                    ? '-inset-px absolute rounded-full bg-primary'
                    : '-bottom-0.5 absolute inset-x-0 h-0.5 bg-primary'
                }
              />
            ) : null;
            return (
              <li key={tab.key} className={pill ? 'flex' : '-mb-px flex'}>
                <NextLink
                  href={tab.href}
                  {...(pill ? { scroll: false } : {})}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => choose(event, tab)}
                  className={
                    pill
                      ? cn(
                          CHIP,
                          active
                            ? 'border-transparent font-semibold text-primary-foreground'
                            : 'border-border bg-surface font-medium hover:border-border-strong',
                        )
                      : cn(TAB, active ? 'font-semibold' : 'font-medium hover:border-border-strong')
                  }
                >
                  {marker}
                  {pill ? (
                    <span className="relative">{tab.label}</span>
                  ) : (
                    <>
                      <span className="text-[15px]">{tab.label}</span>
                      {tab.detail ? (
                        <span className="text-xs font-normal text-foreground-muted">{tab.detail}</span>
                      ) : null}
                    </>
                  )}
                </NextLink>
              </li>
            );
          })}
        </motion.ul>
      </LayoutGroup>
    </nav>
  );
}
