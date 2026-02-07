export function CardSkeleton() {
  return (
    <div className="rounded-xl bg-[#2a2a2a] border border-[#404040] overflow-hidden animate-pulse">
      <div className="aspect-video bg-[#333333]" />
      <div className="p-4 space-y-3">
        <div className="h-4 bg-[#333333] rounded w-3/4" />
        <div className="h-3 bg-[#333333] rounded w-1/2" />
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function UsageCardSkeleton() {
  return (
    <div className="mt-8 rounded-xl bg-[#2a2a2a] border border-[#404040] p-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 bg-[#333333] rounded w-24" />
          <div className="h-8 bg-[#333333] rounded w-32" />
          <div className="h-3 bg-[#333333] rounded w-20" />
        </div>
        <div className="h-6 bg-[#333333] rounded-full w-20" />
      </div>
      <div className="mt-4 h-2 bg-[#333333] rounded-full" />
    </div>
  );
}
