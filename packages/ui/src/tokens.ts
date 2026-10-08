/**
 * Design tokens: the single source for colour, type, spacing, radius and shadow.
 *
 * `theme.css` (Tailwind v4 `@theme`) is generated from this file by `pnpm --filter @bambino/ui tokens`,
 * and a test fails if the two drift. The mobile app (Phase 7) reads the same values for NativeWind.
 */

/**
 * Raw palette, "Sage & Clay": deep sage #2F5D50 for primary actions and bands, a light sage tint #EEF4F0 for
 * alternating sections, clay #E07A5F as a fill accent (dark text on it) and a darker clay for small emphasis text.
 * Neutrals are soft warm greys on white. Components never use these directly; they use the semantic colours below.
 */
export const palette = {
  /** Sage: primary actions, headings, navigation, solid bands (800) and section tints (50). */
  brand: {
    50: '#eef4f0',
    100: '#dde9e2',
    200: '#c3dbd1',
    300: '#9ec2b4',
    400: '#7aa898',
    500: '#5b8f7f',
    600: '#4a7f70',
    700: '#3b6e60',
    800: '#2f5d50',
    900: '#1f3f36',
  },
  /** Clay: highlights and secondary calls to action (400 as a fill), emphasis text (600 to 700). */
  accent: {
    50: '#fdf2ee',
    100: '#fbe2d9',
    200: '#f6c6b5',
    300: '#eda08a',
    400: '#e07a5f',
    500: '#cf6447',
    600: '#b5543a',
    700: '#96432d',
    800: '#763524',
    900: '#5a281c',
  },
  /** Warm greys: surfaces, borders and body text. 0 is the white page. */
  sand: {
    0: '#ffffff',
    50: '#faf9f6',
    100: '#f3f1ec',
    200: '#e6e3dc',
    300: '#cfcbc2',
    400: '#a39e94',
    500: '#77726a',
    600: '#57534c',
    700: '#403d38',
    800: '#2b2926',
    900: '#1c1b19',
  },
  /**
   * Size stages: the colour of a size follows the baby through the site (tags, plans, boxes). All are light fills
   * that carry ink text, never text on white.
   */
  stage: {
    newborn: '#a9d3f5',
    early: '#93d9bd',
    mid: '#f2d14b',
    toddler: '#f5a07e',
    big: '#c9b0ec',
  },
  success: { 50: '#eef5e6', 200: '#bcd6a0', 700: '#3f6212', 800: '#33500f' },
  warning: { 50: '#fdf3df', 200: '#f0cf8a', 700: '#7a4f00', 800: '#5f3d00' },
  danger: { 50: '#fbefeb', 200: '#efb9a8', 600: '#a8361b', 700: '#8c2c15', 800: '#702410' },
  info: { 50: '#eef3f6', 200: '#b7cbd6', 700: '#2f5468', 800: '#244353' },
} as const;

/** Semantic colours: what components use. Every text/background pair is contrast-tested to WCAG AA. */
export const colors = {
  /** Clean white pages, with a light olive tint for alternating sections. */
  background: palette.sand[0],
  surface: palette.sand[0],
  'surface-muted': palette.brand[50],
  'surface-sunken': palette.sand[100],
  foreground: palette.sand[900],
  'foreground-muted': palette.sand[600],
  border: palette.brand[100],
  /** Borders of form controls must reach 3:1 against the surface (WCAG 1.4.11). */
  'border-strong': palette.sand[500],
  primary: palette.brand[800],
  'primary-hover': palette.brand[900],
  'primary-foreground': palette.sand[50],
  'primary-soft': palette.brand[50],
  'primary-soft-foreground': palette.brand[800],
  /** Clay is a fill colour (buttons, highlights) with near-black text on it; it is too light for text on white. */
  accent: palette.accent[400],
  'accent-hover': palette.accent[300],
  'accent-foreground': palette.sand[900],
  'stage-newborn': palette.stage.newborn,
  'stage-early': palette.stage.early,
  'stage-mid': palette.stage.mid,
  'stage-toddler': palette.stage.toddler,
  'stage-big': palette.stage.big,
  'accent-soft': palette.accent[50],
  'accent-soft-foreground': palette.accent[800],
  /** Clay dark enough for text, for limited emphasis. */
  emphasis: palette.accent[700],
  link: palette.brand[700],
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
  /** One characterful grotesque (Bricolage Grotesque) for everything. Loaded by each app (next/font on web); the stack is the fallback. */
  display: '"Bricolage Grotesque", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  sans: '"Bricolage Grotesque", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
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
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '0.875rem',
  '2xl': '1.125rem',
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
