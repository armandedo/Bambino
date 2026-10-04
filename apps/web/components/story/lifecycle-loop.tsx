'use client';

import { motion } from 'motion/react';
import { DURATION, EASE } from '../motion/primitives';

/** The garment lifecycle from the business model. Each label matches a real step recorded for every tagged garment. */
const STAGES = [
  { label: 'Produced', detail: 'Made and tagged' },
  { label: 'Worn', detail: 'With a family' },
  { label: 'Returned', detail: 'Collected when outgrown' },
  { label: 'Refurbished', detail: 'Inspected and cleaned' },
  { label: 'Redistributed or recycled', detail: 'Next family, or recycled' },
] as const;

const RADIUS = 150;
const CENTER = 200;

function point(index: number) {
  const angle = (index / STAGES.length) * Math.PI * 2 - Math.PI / 2;
  return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) };
}

/**
 * The circle draws once when it scrolls into view and each stage appears in order. One pass, no looping.
 * Screen readers get the ordered list; the drawing is decorative.
 */
export function LifecycleLoop() {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2">
      <motion.svg
        viewBox="0 0 400 400"
        aria-hidden="true"
        className="mx-auto w-full max-w-md"
        initial="hidden"
        whileInView="shown"
        viewport={{ once: true, margin: '0px 0px -15% 0px' }}
      >
        <circle cx={CENTER} cy={CENTER} r={RADIUS} className="fill-none stroke-sand-200" strokeWidth="14" />
        <motion.circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          className="fill-none stroke-brand-500"
          strokeWidth="4"
          strokeLinecap="round"
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
          variants={{
            hidden: { pathLength: 0 },
            shown: { pathLength: 1, transition: { duration: DURATION.cinematic * 1.6, ease: EASE } },
          }}
        />
        <text
          x={CENTER}
          y={CENTER - 6}
          textAnchor="middle"
          className="fill-brand-800 font-display text-[26px] font-extrabold"
        >
          One garment,
        </text>
        <text
          x={CENTER}
          y={CENTER + 26}
          textAnchor="middle"
          className="fill-brand-800 font-display text-[26px] font-extrabold"
        >
          many babies
        </text>
        {STAGES.map((stage, index) => {
          const { x, y } = point(index);
          return (
            <motion.g
              key={stage.label}
              variants={{
                hidden: { opacity: 0, scale: 0.6 },
                shown: {
                  opacity: 1,
                  scale: 1,
                  transition: { duration: DURATION.normal, ease: EASE, delay: 0.3 + index * 0.35 },
                },
              }}
              style={{ transformOrigin: `${x}px ${y}px` }}
            >
              <circle cx={x} cy={y} r="26" className={index % 2 === 0 ? 'fill-primary' : 'fill-accent'} />
              <text
                x={x}
                y={y + 6}
                textAnchor="middle"
                className={
                  index % 2 === 0
                    ? 'fill-sand-50 text-[18px] font-bold'
                    : 'fill-brand-900 text-[18px] font-bold'
                }
              >
                {index + 1}
              </text>
            </motion.g>
          );
        })}
      </motion.svg>
      <ol className="flex flex-col gap-4">
        {STAGES.map((stage, index) => (
          <motion.li
            key={stage.label}
            className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4"
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: DURATION.normal, ease: EASE, delay: index * 0.1 }}
          >
            <span
              aria-hidden="true"
              className={
                index % 2 === 0
                  ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground'
                  : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-foreground'
              }
            >
              {index + 1}
            </span>
            <span>
              <span className="block font-display text-lg font-bold text-primary">{stage.label}</span>
              <span className="text-foreground-muted">{stage.detail}</span>
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
