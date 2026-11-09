/** Скелетон контента при lazy-загрузке страницы: layout остаётся на месте. */
export function PageFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Загрузка страницы">
      <div className="skeleton h-9 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
