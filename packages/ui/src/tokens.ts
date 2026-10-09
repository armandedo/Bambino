/**
 * Design tokens: the single source for colour, type, spacing, radius and shadow.
 *
 * `theme.css` (Tailwind v4 `@theme`) is generated from this file by `pnpm --filter @bambino/ui tokens`,
 * and a test fails if the two drift. The mobile app (Phase 7) reads the same values for NativeWind.
 */

/**
 * Raw palette, "Editorial": black ink on white, vellum cream #F7F5E8 for panels, pewter greys for hairlines, and
 * one rust accent #B94E3A. Size stages keep faint tints so a size is still recognisable. Components never use
 * these directly; they use the semantic colours below.
 */
export const palette = {
  /** Sage: primary actions, headings, navigation, solid bands (800) and section tints (50). */
  brand: {
    50: '#f7f5e8',
    100: '#ece9d8',
    200: '#d6d3c4',
    300: '#b3b0a6',
    400: '#888888',
    500: '#6b6868',
    600: '#4d4a4b',
    700: '#373334',
    800: '#231f20',
    900: '#000000',
  },
  /** Pencil yellow: highlights and secondary calls to action (400 as a fill), emphasis text (700). */
  accent: {
    50: '#fbefec',
    100: '#f5d9d3',
    200: '#ebb5a9',
    300: '#d98b79',
    400: '#b94e3a',
    500: '#a14331',
    600: '#8a3829',
    700: '#7a3122',
    800: '#5f2518',
    900: '#43190f',
  },
  /** Cool canvas greys: 0 is white (cards), 50 the page canvas, 100 to 200 quiet surfaces and hairlines. */
  sand: {
    0: '#ffffff',
    50: '#ffffff',
    100: '#f7f5e8',
    200: '#e4e1d1',
    300: '#cfccbd',
    400: '#a8a59a',
    500: '#888888',
    600: '#5c5857',
    700: '#3d3839',
    800: '#231f20',
    900: '#000000',
  },
  /**
   * Size stages: the colour of a size follows the baby through the site (tags, plans, boxes). All are light fills
   * that carry ink text, never text on white.
   */
  stage: {
    newborn: '#e3ecf3',
    early: '#dcebe2',
    mid: '#f1e6b4',
    toddler: '#f0d3c8',
    big: '#e2d8ee',
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
  'surface-muted': palette.sand[100],
  'surface-sunken': palette.sand[100],
  foreground: palette.brand[900],
  'foreground-muted': palette.sand[600],
  border: palette.sand[200],
  /** Borders of form controls must reach 3:1 against the surface (WCAG 1.4.11). */
  'border-strong': palette.sand[500],
  primary: palette.brand[900],
  'primary-hover': palette.brand[700],
  'primary-foreground': palette.sand[50],
  'primary-soft': palette.brand[50],
  'primary-soft-foreground': palette.brand[800],
  /** Clay is a fill colour (buttons, highlights) with near-black text on it; it is too light for text on white. */
  accent: palette.accent[400],
  'accent-hover': palette.accent[500],
  'accent-foreground': palette.sand[0],
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
  /** One grotesque (Space Grotesk) for everything. Loaded by each app (next/font on web); the stack is the fallback. */
  display: '"Space Grotesk", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
  sans: '"Space Grotesk", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif',
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
  sm: '0.5rem',
  md: '0.625rem',
  lg: '0.9375rem',
  xl: '0.9375rem',
  '2xl': '0.9375rem',
  full: '9999px',
} as const;

export const shadows = {
  xs: 'none',
  sm: 'none',
  md: 'none',
  lg: 'none',
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
