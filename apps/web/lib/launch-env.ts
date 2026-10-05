/**
 * Launch switches for the website, checked when `next build` makes a production build (see next.config.ts).
 * Kept free of Next imports so next.config.ts and the tests can load it directly.
 */

type Env = Record<string, string | undefined>;

/** The preview banner, and the only way to make a production build that is not ready for launch. */
export function isPreview(env: Env): boolean {
  return env.NEXT_PUBLIC_PREVIEW_BANNER === 'true';
}

function isHttps(url: string | undefined): boolean {
  try {
    return new URL(url ?? '').protocol === 'https:';
  } catch {
    return false;
  }
}

/** What stops this environment from being launched. Empty when it is ready. */
export function launchProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.NEXT_PUBLIC_MOCK_PAYMENTS === 'true') {
    problems.push('NEXT_PUBLIC_MOCK_PAYMENTS is true: the test wallets would be offered at checkout');
  }
  if (!isHttps(env.NEXT_PUBLIC_SITE_URL)) {
    problems.push(`NEXT_PUBLIC_SITE_URL must be an https URL (got "${env.NEXT_PUBLIC_SITE_URL ?? ''}")`);
  }
  if (!isHttps(env.NEXT_PUBLIC_API_URL)) {
    problems.push(`NEXT_PUBLIC_API_URL must be an https URL (got "${env.NEXT_PUBLIC_API_URL ?? ''}")`);
  }
  return problems;
}

/**
 * Refuses a production build with launch problems, unless it is marked as a preview (NEXT_PUBLIC_PREVIEW_BANNER),
 * in which case every page says so. Returns the problems a preview build carries, for the build log.
 */
export function assertLaunchReady(env: Env): string[] {
  const problems = launchProblems(env);
  if (problems.length > 0 && !isPreview(env)) {
    throw new Error(
      `This production build is not ready for launch:\n- ${problems.join('\n- ')}\n` +
        'Fix these, or set NEXT_PUBLIC_PREVIEW_BANNER=true to build a preview that says so on every page.',
    );
  }
  return problems;
}
