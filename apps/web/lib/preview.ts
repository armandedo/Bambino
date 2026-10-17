import { isPreview } from './launch-env';

/**
 * True only in a preview build (NEXT_PUBLIC_PREVIEW_BANNER=true). Production builds must be launch-ready or they
 * fail (see launch-env.ts), so anything gated on this can never reach customers by accident.
 *
 * The variable is read as a plain property so Next inlines it at build time, in server and client code alike.
 */
export const PREVIEW_BUILD = isPreview({
  NEXT_PUBLIC_PREVIEW_BANNER: process.env.NEXT_PUBLIC_PREVIEW_BANNER,
});

/** The design gallery and the admin mock-up exist for development and previews, never for customers. */
export const INTERNAL_PAGES_VISIBLE = process.env.NODE_ENV !== 'production' || PREVIEW_BUILD;
