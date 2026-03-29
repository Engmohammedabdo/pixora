import { Skeleton } from '@/components/ui/skeleton';

export function StudioLoading(): React.ReactElement {
  return (
    <div className="h-[calc(100vh-3.5rem)]">
      <div className="px-6 py-4 border-b">
        <Skeleton className="h-7 w-48 mb-2" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-col lg:flex-row gap-4 p-4 flex-1">
        <div className="w-full lg:w-2/5 rounded-lg border bg-[var(--color-surface)] p-4 space-y-4">
          <Skeleton className="h-24 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-2/3 rounded" />
        </div>
        <div className="w-full lg:w-3/5 rounded-lg border bg-[var(--color-surface)] p-4 flex items-center justify-center">
          <Skeleton className="h-64 w-64 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
