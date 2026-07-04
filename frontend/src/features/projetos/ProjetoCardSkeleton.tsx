export function ProjetoCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-surface-1">
      <div className="aspect-video w-full animate-pulse bg-bg-800" />
      <div className="flex flex-col gap-3 p-3.5">
        <div className="space-y-2">
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-bg-800" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-bg-800" />
        </div>
        <div className="flex gap-2">
          <div className="h-3 w-10 animate-pulse rounded bg-bg-800" />
          <div className="h-3 w-10 animate-pulse rounded bg-bg-800" />
        </div>
        <div className="h-1.5 w-full animate-pulse rounded-full bg-bg-800" />
      </div>
    </div>
  );
}
