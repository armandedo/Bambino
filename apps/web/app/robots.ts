import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Private areas are never crawled. Until launch (SITE_INDEXING=true) nothing is. */
export default function robots(): MetadataRoute.Robots {
  const launched = process.env.SITE_INDEXING === 'true';
  return {
    rules: launched
      ? { userAgent: '*', allow: '/', disallow: ['/account', '/checkout', '/cart', '/preview'] }
      : { userAgent: '*', disallow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
