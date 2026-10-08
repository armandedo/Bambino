/** Wordmark: a growth ruler on an ink tile (each mark a size a baby reaches) beside the "bambino" name. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
        <rect width="32" height="32" rx="8" className="fill-primary" />
        <path
          d="M8 25h8M8 18h12M8 11h16"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-accent"
        />
        <path d="M25 26V6" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-brand-200" />
      </svg>
      <span className="font-display text-2xl font-bold tracking-tight text-primary">bambino</span>
    </span>
  );
}
