import { Skeleton, Spinner } from '@bambino/ui';

/** Announces the loading state once; the skeletons below it are decorative. */
export function LoadingStatus({ label }: { label: string }) {
  return <Spinner label={label} size="sm" className="text-foreground-muted" />;
}

/** Shop grid while products load. */
export function ShopLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12">
      <LoadingStatus label="Loading products" />
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-9 w-full max-w-lg" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[4/5] w-full rounded-2xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Product page while it loads. */
export function ProductLoading() {
  return (
    <div aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <LoadingStatus label="Loading product" />
      <div className="grid gap-10 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-48" />
        </div>
      </div>
    </div>
  );
}

/** Dashboard cards while the account loads. */
export function DashboardLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <LoadingStatus label="Loading your account" />
      <Skeleton className="h-10 w-56" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-44 rounded-[1.5rem]" />
        ))}
      </div>
    </div>
  );
}
