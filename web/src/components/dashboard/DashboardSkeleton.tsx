/** Скелетон чарта используется и в Suspense при lazy-загрузке Recharts */
export function ChartCardSkeleton() {
  return (
    <div className="glass-card p-5">
      <div className="skeleton h-4 w-44" />
      <div className="skeleton mt-2 h-2.5 w-28" />
      <div className="skeleton mt-5 h-[300px] w-full" />
    </div>
  );
}

/** Shimmer-скелетоны повторяют финальную сетку, чтобы не было layout shift */
export function DashboardSkeleton() {
  return (
    <div
      className="space-y-4"
      role="status"
      aria-label="Загрузка обзора сервера"
      aria-busy="true"
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="glass-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="skeleton h-2.5 w-20" />
                <div className="skeleton mt-3 h-7 w-24" />
                <div className="skeleton mt-2.5 h-2 w-16" />
              </div>
              <div className="skeleton h-9 w-9 shrink-0 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ChartCardSkeleton />

          <div className="glass-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="skeleton h-4 w-40" />
                <div className="skeleton mt-2 h-2.5 w-32" />
              </div>
              <div className="skeleton h-7 w-24 rounded-lg" />
            </div>
            <div className="mt-5 space-y-2.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="skeleton h-9 w-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton mt-2 h-2.5 w-28" />
            <div className="mt-5 space-y-3">
              <div className="skeleton h-[92px] w-full" />
              <div className="skeleton h-[92px] w-full" />
            </div>
          </div>

          <div className="glass-card p-5">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton mt-2 h-2.5 w-24" />
            <div className="skeleton mt-5 h-28 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
