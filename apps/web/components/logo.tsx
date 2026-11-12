import Image from 'next/image';

/** The approved Little Romper wordmark, with a monochrome option for dark surfaces. */
export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Image
      src="/brand/bambino-little-romper.webp"
      alt="Bambino"
      width={1080}
      height={220}
      unoptimized
      className={`block h-auto w-[8.25rem] sm:w-44${inverse ? ' brightness-0 invert' : ''}`}
    />
  );
}
