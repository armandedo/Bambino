import { cn } from '@bambino/ui';

/** A simple bodysuit drawing. Colour comes from `fill-*` (body) and `text-*` (outline) classes. */
export function Garment({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 130" aria-hidden="true" className={cn('w-full', className)}>
      <path
        d="M42 14h36l7 9 22 11-9 20-13-6v62a6 6 0 0 1-6 6H41a6 6 0 0 1-6-6V48l-13 6-9-20 22-11 7-9Z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M47 14c2 7 7 11 13 11s11-4 13-11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M48 116c4-6 8-9 12-9s8 3 12 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[52, 66, 80].map((y) => (
        <circle key={y} cx="60" cy={y} r="2.6" fill="currentColor" />
      ))}
    </svg>
  );
}
