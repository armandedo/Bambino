'use client';

import Image from 'next/image';
import { Shirt } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@bambino/ui';

/** The catalogue URL stays authoritative; Next serves responsive WebP derivatives. */
export function ProductPhoto({
  src,
  alt,
  sizes = '(min-width: 1328px) 300px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw',
  className,
  priority = false,
  fit = 'cover',
}: {
  src?: string | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        fit === 'contain' ? 'bg-surface' : 'bg-surface-muted',
        className,
      )}
    >
      {src && failedSource !== src ? (
        <Image
          src={src}
          unoptimized={src.startsWith('http:') || src.startsWith('blob:') || src.startsWith('data:')}
          alt={alt}
          fill
          sizes={sizes}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailedSource(src)}
          className={cn(
            fit === 'contain' ? 'object-contain' : 'object-cover',
            'transition-transform duration-300 ease-settle group-hover/photo:scale-[1.04]',
          )}
        />
      ) : (
        <div
          className="flex h-full min-h-24 flex-col items-center justify-center gap-2 text-foreground-muted"
          role="img"
          aria-label={`${alt}: photo coming soon`}
        >
          <Shirt className="size-10 opacity-35" aria-hidden="true" strokeWidth={1} />
          <span className="text-sm">Photo coming soon</span>
        </div>
      )}
    </div>
  );
}
