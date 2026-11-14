'use client';

import { buttonClasses, cn } from '@bambino/ui';
import { SlidersHorizontal } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ChangeEvent, type FormEvent, useId, useState, useTransition } from 'react';
import { DEFAULT_SORT, SHOP_SORTS, type ShopState, activeFilterCount, shopHref } from '@/lib/shop-url';

function digits(value: string | undefined): string | undefined {
  const text = value?.replace(/\D/g, '').slice(0, 9);
  return text ? String(Number(text)) : undefined;
}

/**
 * Size, availability, price and sorting for the shop grid. Every choice goes into the address bar, so the page
 * can be shared and the back button undoes one choice at a time. It is a plain GET form underneath: with
 * JavaScript the dropdowns apply as soon as they change, without it the Apply button sends the form.
 */
export function FilterBar({ state, sizes }: { state: ShopState; sizes: { code: string; label: string }[] }) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const count = activeFilterCount(state);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const sort = read('sort');
    const href = shopHref(state, {
      size: read('size'),
      stock: read('stock'),
      min: digits(read('min')),
      max: digits(read('max')),
      sort: sort === DEFAULT_SORT ? undefined : sort,
    });
    startTransition(() => router.push(href, { scroll: false }));
  }

  const apply = (event: ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();

  return (
    <form
      // The fields are uncontrolled. A new address (a removed chip, the back button) gives them fresh defaults.
      key={shopHref(state)}
      action="/shop"
      method="get"
      onSubmit={submit}
      aria-label="Filter and sort"
      aria-busy={pending}
      className="flex flex-wrap items-center gap-2"
    >
      {(['q', 'age', 'category'] as const).map((name) =>
        state[name] ? <input key={name} type="hidden" name={name} value={state[name]} /> : null,
      )}

      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="shop-select !bg-none !pr-3.5 inline-flex items-center gap-2 md:hidden"
        data-on={count > 0}
      >
        <SlidersHorizontal aria-hidden="true" className="size-4" strokeWidth={2} />
        Filters{count > 0 ? ` (${count})` : ''}
      </button>

      <div
        id={panelId}
        className={cn(
          'order-last w-full flex-wrap items-center gap-2 md:order-none md:flex md:w-auto',
          open ? 'flex' : 'hidden',
        )}
      >
        <select
          name="size"
          aria-label="Size"
          defaultValue={state.size ?? ''}
          onChange={apply}
          data-on={Boolean(state.size)}
          className="shop-select"
        >
          <option value="">All sizes</option>
          {sizes.map((size) => (
            <option key={size.code} value={size.code}>
              {size.label}
            </option>
          ))}
        </select>
        <select
          name="stock"
          aria-label="Availability"
          defaultValue={state.stock ?? ''}
          onChange={apply}
          data-on={Boolean(state.stock)}
          className="shop-select"
        >
          <option value="">In stock</option>
          <option value="all">Include sold out</option>
        </select>
        <fieldset className="flex items-center gap-1.5">
          <legend className="sr-only">Price in RWF</legend>
          <input
            name="min"
            aria-label="Lowest price in RWF"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={state.min ?? ''}
            placeholder="Min RWF"
            className="shop-input !w-[6.5rem]"
          />
          <span aria-hidden="true" className="text-sm text-foreground-muted">
            to
          </span>
          <input
            name="max"
            aria-label="Highest price in RWF"
            inputMode="numeric"
            pattern="[0-9]*"
            defaultValue={state.max ?? ''}
            placeholder="Max RWF"
            className="shop-input !w-[6.5rem]"
          />
          <button
            type="submit"
            className={buttonClasses({ variant: 'outline', size: 'sm', className: 'min-h-10 rounded-full' })}
          >
            Apply
          </button>
        </fieldset>
      </div>

      <label className="ml-auto flex items-center gap-2 text-sm">
        <span className="text-foreground-muted max-sm:sr-only">Sort by</span>
        <select
          name="sort"
          defaultValue={state.sort ?? DEFAULT_SORT}
          onChange={apply}
          data-on={Boolean(state.sort)}
          className="shop-select"
        >
          {SHOP_SORTS.map((sort) => (
            <option key={sort.value} value={sort.value}>
              {sort.label}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
