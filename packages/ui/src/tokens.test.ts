// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { generateThemeCss } from './theme-css';
import { type ColorToken, colors } from './tokens';

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

/** Text pairs need 4.5:1 (WCAG 1.4.3); UI component boundaries and focus need 3:1 (1.4.11). */
const TEXT_PAIRS: readonly [ColorToken, ColorToken][] = [
  ['foreground', 'background'],
  ['foreground', 'surface'],
  ['foreground', 'surface-muted'],
  ['foreground', 'surface-sunken'],
  ['foreground-muted', 'background'],
  ['foreground-muted', 'surface'],
  ['foreground-muted', 'surface-muted'],
  ['link', 'surface'],
  ['link', 'background'],
  ['primary', 'surface'],
  ['primary-foreground', 'primary'],
  ['primary-foreground', 'primary-hover'],
  ['primary-soft-foreground', 'primary-soft'],
  ['accent', 'surface'],
  ['accent-foreground', 'accent'],
  ['accent-foreground', 'accent-hover'],
  ['accent-soft-foreground', 'accent-soft'],
  ['success-foreground', 'success-soft'],
  ['warning-foreground', 'warning-soft'],
  ['danger-foreground', 'danger-soft'],
  ['danger', 'surface'],
  ['primary-foreground', 'danger'],
  ['primary-foreground', 'danger-hover'],
  ['info-foreground', 'info-soft'],
];

const NON_TEXT_PAIRS: readonly [ColorToken, ColorToken][] = [
  ['border-strong', 'surface'],
  ['border-strong', 'background'],
  ['focus', 'surface'],
  ['focus', 'background'],
  ['primary', 'background'],
];

describe('colour tokens meet WCAG AA', () => {
  it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s against %s reaches 3:1', (fg, bg) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('theme.css', () => {
  it('is up to date with tokens.ts (run `pnpm --filter @bambino/ui tokens`)', () => {
    const onDisk = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
    expect(onDisk.replaceAll('\r\n', '\n')).toBe(generateThemeCss());
  });
});
