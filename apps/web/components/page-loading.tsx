import { Skeleton, Spinner } from '@bambino/ui';

/** Announces the loading state once; the skeletons below it are decorative. */
export function LoadingStatus({ label }: { label: string }) {
  return <Spinner label={label} size="sm" className="text-foreground-muted" />;
}

/** Shop grid while products load: the same rows and columns as the real one, so nothing jumps. */
export function ShopLoading() {
  return (
    <div aria-busy="true" className="retail-container flex flex-col gap-3 pt-3 pb-10">
      <LoadingStatus label="Loading products" />
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-9 w-full max-w-md rounded-full" />
      <div className="grid grid-cols-2 gap-x-2.5 gap-y-5 pt-2 md:grid-cols-4 md:gap-x-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full rounded-md" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Product page while it loads. */
export function ProductLoading() {
  return (
    <div aria-busy="true" className="retail-container flex flex-col gap-4 pt-3 pb-10 md:pt-4">
      <LoadingStatus label="Loading product" />
      <div className="grid gap-5 md:grid-cols-2 md:gap-8 lg:gap-12">
        <Skeleton className="aspect-square w-full rounded-md" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

/** Dashboard cards while the account loads. */
export function DashboardLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <LoadingStatus label="Loading your account" />
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
