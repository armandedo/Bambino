/**
 * Design tokens: the single source for colour, type, spacing, radius and shadow.
 *
 * `theme.css` (Tailwind v4 `@theme`) is generated from this file by `pnpm --filter @bambino/ui tokens`,
 * and a test fails if the two drift. The mobile app (Phase 7) reads the same values for NativeWind.
 */

/**
 * Raw palette, from Bambino's visual identity: Forest #283618, Olive #606C38, Cream #FEFAE0, Warm Gold #DDA15E and
 * Terracotta #BC6C25. Target balance: about 70% cream and neutral, 15% forest, 8% olive, 5% gold, 2% terracotta.
 * Components never use these directly; they use the semantic colours below.
 */
export const palette = {
  /** Forest (800) and olive (500): primary actions, headings, navigation. */
  brand: {
    50: '#f4f5ea',
    100: '#e6e9d2',
    200: '#cdd3a8',
    300: '#aab47a',
    400: '#848f52',
    500: '#606c38',
    600: '#4a5629',
    700: '#36421f',
    800: '#283618',
    900: '#1b250f',
  },
  /** Warm gold (400) and terracotta (600): highlights, premium accents, limited emphasis. */
  accent: {
    50: '#fdf6ec',
    100: '#faeacf',
    200: '#f3d3a3',
    300: '#eab97a',
    400: '#dda15e',
    500: '#c98443',
    600: '#bc6c25',
    700: '#94531b',
    800: '#714014',
    900: '#57300f',
  },
  /** Cream neutrals: backgrounds, surfaces, borders and body text. */
  sand: {
    0: '#fffdf5',
    50: '#fefae0',
    100: '#f7f1d4',
    200: '#ebe3c3',
    300: '#d6cda9',
    400: '#aba485',
    500: '#787258',
    600: '#5b5745',
    700: '#434033',
    800: '#2e2c22',
    900: '#1f1e16',
  },
  success: { 50: '#eef5e6', 200: '#bcd6a0', 700: '#3f6212', 800: '#33500f' },
  warning: { 50: '#fdf3df', 200: '#f0cf8a', 700: '#7a4f00', 800: '#5f3d00' },
  danger: { 50: '#fbefeb', 200: '#efb9a8', 600: '#a8361b', 700: '#8c2c15', 800: '#702410' },
  info: { 50: '#eef3f6', 200: '#b7cbd6', 700: '#2f5468', 800: '#244353' },
} as const;

/** Semantic colours: what components use. Every text/background pair is contrast-tested to WCAG AA. */
export const colors = {
  background: palette.sand[50],
  surface: palette.sand[0],
  'surface-muted': palette.sand[100],
  'surface-sunken': palette.sand[200],
  foreground: palette.brand[900],
  'foreground-muted': palette.sand[600],
  border: palette.sand[200],
  /** Borders of form controls must reach 3:1 against the surface (WCAG 1.4.11). */
  'border-strong': palette.sand[500],
  primary: palette.brand[800],
  'primary-hover': palette.brand[900],
  'primary-foreground': palette.sand[50],
  'primary-soft': palette.brand[50],
  'primary-soft-foreground': palette.brand[800],
  /** Gold is a fill colour (buttons, highlights) with forest text on it; it is too light for text on cream. */
  accent: palette.accent[400],
  'accent-hover': palette.accent[300],
  'accent-foreground': palette.brand[900],
  'accent-soft': palette.accent[50],
  'accent-soft-foreground': palette.accent[800],
  /** Terracotta dark enough for text, for limited emphasis. */
  emphasis: palette.accent[700],
  link: palette.brand[600],
  focus: palette.brand[500],
  'success-soft': palette.success[50],
  'success-border': palette.success[200],
  'success-foreground': palette.success[800],
  'warning-soft': palette.warning[50],
  'warning-border': palette.warning[200],
  'warning-foreground': palette.warning[800],
  'danger-soft': palette.danger[50],
  'danger-border': palette.danger[200],
  'danger-foreground': palette.danger[800],
  danger: palette.danger[600],
  'danger-hover': palette.danger[700],
  'info-soft': palette.info[50],
  'info-border': palette.info[200],
  'info-foreground': palette.info[800],
} as const;

export type ColorToken = keyof typeof colors;

export const fonts = {
  /** Confident editorial headings. Loaded by each app (next/font on web); the stack is the fallback. */
  display: '"Manrope", "DM Sans", ui-sans-serif, "Segoe UI", system-ui, sans-serif',
  sans: '"Inter", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

/** Type scale: [font-size, line-height]. Body text is 16px so mobile browsers never zoom inputs. */
export const fontSizes = {
  xs: ['0.75rem', '1rem'],
  sm: ['0.875rem', '1.25rem'],
  base: ['1rem', '1.5rem'],
  lg: ['1.125rem', '1.75rem'],
  xl: ['1.25rem', '1.75rem'],
  '2xl': ['1.5rem', '2rem'],
  '3xl': ['1.875rem', '2.25rem'],
  '4xl': ['2.25rem', '2.5rem'],
  '5xl': ['3rem', '1.1'],
  '6xl': ['3.75rem', '1.05'],
  '7xl': ['4.5rem', '1'],
} as const;

/** Tailwind's 4px spacing unit is kept; this is the base it multiplies. */
export const spacingUnit = '0.25rem';

export const radii = {
  sm: '0.375rem',
  md: '0.625rem',
  lg: '0.875rem',
  xl: '1.25rem',
  '2xl': '1.75rem',
  full: '9999px',
} as const;

export const shadows = {
  xs: '0 1px 2px rgb(30 27 24 / 0.06)',
  sm: '0 1px 3px rgb(30 27 24 / 0.08), 0 1px 2px rgb(30 27 24 / 0.04)',
  md: '0 4px 12px rgb(30 27 24 / 0.08), 0 2px 4px rgb(30 27 24 / 0.04)',
  lg: '0 12px 32px rgb(30 27 24 / 0.12), 0 4px 8px rgb(30 27 24 / 0.04)',
} as const;

/** Minimum touch target (WCAG 2.5.8 asks for 24px; 44px follows the platform guidelines). */
export const minTouchTarget = '2.75rem';

/**
 * Motion tokens. Animation communicates origin, state change, interaction or the next action; it is never decorative
 * looping. Smooth, non-bouncy easing; transform and opacity only; reduced motion is always respected.
 */
export const motionTokens = {
  duration: { instant: 0.15, fast: 0.25, normal: 0.4, slow: 0.7, cinematic: 1.2 },
  ease: [0.22, 1, 0.36, 1] as const,
} as const;
