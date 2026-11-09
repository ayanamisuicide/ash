import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatNumber, pluralizeRu } from '@/lib/format';
import { cn } from '@/lib/utils';

type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

interface PaginationProps {
  /** Текущая страница, начиная с 1 */
  page: number;
  pages: number;
  total?: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

/** Окно страниц: 1 … 4 5 6 … 20 — не раздувает панель на больших списках */
function buildPageItems(page: number, pages: number): PageItem[] {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, index) => index + 1);
  }

  const start = Math.max(2, page - 1);
  const end = Math.min(pages - 1, page + 1);
  const items: PageItem[] = [1];

  if (start > 2) items.push('ellipsis-start');
  for (let current = start; current <= end; current += 1) items.push(current);
  if (end < pages - 1) items.push('ellipsis-end');

  items.push(pages);
  return items;
}

export function Pagination({
  page,
  pages,
  total,
  disabled = false,
  onPageChange,
  className,
}: PaginationProps) {
  const safePages = Math.max(1, pages);
  const safePage = Math.min(Math.max(1, page), safePages);
  const items = buildPageItems(safePage, safePages);

  return (
    <nav
      aria-label="Пагинация"
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">
        Страница <span className="font-semibold text-foreground/90">{safePage}</span> из {safePages}
        {typeof total === 'number' ? (
          <>
            <span className="mx-1.5 text-white/20">·</span>
            {formatNumber(total)} {pluralizeRu(total, 'кейс', 'кейса', 'кейсов')}
          </>
        ) : null}
      </p>

      {safePages > 1 ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(safePage - 1)}
            disabled={disabled || safePage <= 1}
            aria-label="Предыдущая страница"
            className="gap-1 px-2.5 sm:px-3"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Назад</span>
          </Button>

          {/* На узких экранах оставляем Prev/Next — номера страниц скрыты. */}
          <div className="hidden items-center gap-1 sm:flex">
            {items.map((item) =>
              typeof item === 'number' ? (
                <button
                  key={item}
                  type="button"
                  onClick={() => onPageChange(item)}
                  disabled={disabled}
                  aria-label={`Страница ${item}`}
                  aria-current={item === safePage ? 'page' : undefined}
                  className={cn(
                    'grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50',
                    item === safePage
                      ? 'border-accent/30 bg-accent/[0.16] text-accent shadow-[0_0_18px_rgba(102,115,255,0.18)]'
                      : 'border-transparent text-muted-foreground hover:border-white/[0.08] hover:bg-white/[0.05] hover:text-foreground',
                  )}
                >
                  {item}
                </button>
              ) : (
                <span
                  key={item}
                  className="grid h-8 w-8 place-items-center text-muted-foreground"
                  aria-hidden
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </span>
              ),
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onPageChange(safePage + 1)}
            disabled={disabled || safePage >= safePages}
            aria-label="Следующая страница"
            className="gap-1 px-2.5 sm:px-3"
          >
            <span className="hidden sm:inline">Вперёд</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
