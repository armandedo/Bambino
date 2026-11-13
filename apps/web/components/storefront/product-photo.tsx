'use client';

import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@bambino/ui';

/**
 * How a photo is being loaded. `resized` is the small WebP copy Next makes. If that copy fails (the resizer can
 * time out on a large original), it is asked for once more, and then the photo is loaded straight from storage,
 * so a slow resize never leaves an empty tile. `missing` means the original itself could not be loaded.
 */
type Attempt = 'resized' | 'retry' | 'original' | 'missing';

const RETRY_AFTER_MS = 1200;

function alreadyDirect(src: string): boolean {
  return src.startsWith('http:') || src.startsWith('blob:') || src.startsWith('data:');
}

/** A catalogue photo that fills its parent. The catalogue URL stays authoritative. */
export function ProductPhoto({
  src,
  alt,
  sizes = '(min-width: 1280px) 20vw, (min-width: 768px) 25vw, 50vw',
  className,
  priority = false,
  fit = 'contain',
}: {
  src?: string | undefined;
  alt: string;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fit?: 'cover' | 'contain';
}) {
  const [state, setState] = useState<{ src: string | undefined; attempt: Attempt }>({
    src,
    attempt: 'resized',
  });
  // A different photo starts from the top.
  const attempt = state.src === src ? state.attempt : 'resized';
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function failed() {
    if (!src) return;
    if (alreadyDirect(src) || attempt === 'original') {
      setState({ src, attempt: 'missing' });
    } else if (attempt === 'resized') {
      // Give a busy resizer a moment before asking again.
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setState({ src, attempt: 'retry' }), RETRY_AFTER_MS);
    } else {
      setState({ src, attempt: 'original' });
    }
  }

  const frame = cn('relative h-full w-full overflow-hidden bg-surface', className);

  if (!src || attempt === 'missing') {
    return (
      <div className={frame}>
        <div
          className="flex h-full min-h-20 flex-col items-center justify-center gap-1.5 px-2 text-center text-foreground-muted"
          role="img"
          aria-label={src ? `${alt}: the photo could not be loaded` : `${alt}: no photo yet`}
        >
          <ImageOff className="size-6 opacity-50" aria-hidden="true" strokeWidth={1.5} />
          <span className="text-xs">{src ? 'Photo could not be loaded' : 'No photo yet'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <Image
        key={attempt}
        src={src}
        unoptimized={alreadyDirect(src) || attempt === 'original'}
        alt={alt}
        fill
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        onError={failed}
        className={fit === 'contain' ? 'object-contain' : 'object-cover'}
      />
    </div>
  );
}
