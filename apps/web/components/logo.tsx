import Image from 'next/image';

/** The Little Romper wordmark, sized for the compact shop header. */
export function Logo() {
  return (
    <Image
      src="/brand/bambino-little-romper.webp"
      alt="Bambino"
      width={1080}
      height={220}
      unoptimized
      loading="eager"
      className="block h-auto w-[7.25rem] sm:w-36"
    />
  );
}
