/** Placeholder wordmark in the brand colours until the final logo files are supplied. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
        <circle cx="16" cy="16" r="16" className="fill-primary" />
        <path
          d="M9.5 19.5c1.6 3 3.9 4.5 6.5 4.5s4.9-1.5 6.5-4.5"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className="stroke-accent"
        />
        <circle cx="16" cy="12" r="4.5" fill="none" strokeWidth="2" className="stroke-primary-foreground" />
      </svg>
      <span className="font-display text-xl font-semibold text-primary">bambino</span>
    </span>
  );
}
