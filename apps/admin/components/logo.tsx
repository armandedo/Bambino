/** Placeholder wordmark until the brand assets are supplied. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8">
        <circle cx="16" cy="16" r="16" className="fill-primary" />
        <path
          d="M10 13.5c0-3.3 2.7-6 6-6s6 2.7 6 6M9 15h14l-1.2 7.4a3 3 0 0 1-3 2.6h-5.6a3 3 0 0 1-3-2.6L9 15Z"
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          className="stroke-primary-foreground"
        />
      </svg>
      <span className="font-display text-lg font-extrabold tracking-tight text-foreground">
        bambino <span className="font-sans text-sm font-semibold text-foreground-muted">admin</span>
      </span>
    </span>
  );
}
