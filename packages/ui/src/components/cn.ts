/** Joins class names, skipping falsy values. Components append the caller's `className` last. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
