import type { ReactNode } from 'react';
import { ArrowRight, ChevronRight, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RecentCase } from '@/api/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { caseTypeBadgeClasses, caseTypeLabel } from '@/lib/cases';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface RecentCasesTableProps {
  cases: RecentCase[];
  title?: string;
  description?: string;
  showAllLink?: boolean;
  /** Делает строки кликабельными и добавляет affordance «открыть» */
  onCaseClick?: (item: RecentCase) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  /** Слот под таблицей — например, пагинация */
  footer?: ReactNode;
  className?: string;
}

function personLabel(name: string | null, id: string | null): string {
  if (name) return name;
  if (id) return `ID ${id}`;
  return '—';
}

export function RecentCasesTable({
  cases,
  title = 'Последние кейсы',
  description = 'Свежие действия модерации',
  showAllLink = true,
  onCaseClick,
  emptyTitle = 'Кейсов пока нет',
  emptyDescription = 'Первое наказание появится здесь автоматически — история ведётся общей службой модерации.',
  emptyAction,
  footer,
  className,
}: RecentCasesTableProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-[15px]">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        {showAllLink ? (
          <Button asChild variant="ghost" size="sm" className="shrink-0 text-muted-foreground">
            <Link to="/cases">
              Все кейсы
              <ArrowRight />
            </Link>
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="p-0">
        {cases.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
            tone="muted"
            size="table"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left xl:min-w-[600px] 2xl:min-w-[780px]">
              <thead>
                <tr className="border-y border-white/[0.06] bg-white/[0.015]">
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Кейс
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Тип
                  </th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Участник
                  </th>
                  <th className="hidden px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground 2xl:table-cell">
                    Модератор
                  </th>
                  <th className="hidden px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground 2xl:table-cell">
                    Причина
                  </th>
                  <th className="hidden px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground xl:table-cell">
                    Когда
                  </th>
                  <th className="px-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Статус
                  </th>
                </tr>
              </thead>
              <tbody>
                {cases.map((item) => (
                  <tr
                    key={item.id}
                    onClick={onCaseClick ? () => onCaseClick(item) : undefined}
                    onKeyDown={
                      onCaseClick
                        ? (event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            onCaseClick(item);
                          }
                        : undefined
                    }
                    tabIndex={onCaseClick ? 0 : undefined}
                    aria-label={onCaseClick ? `Открыть кейс #${item.id}` : undefined}
                    className={cn(
                      'group border-b border-white/[0.04] transition-colors duration-150 last:border-0 hover:bg-white/[0.025]',
                      onCaseClick &&
                        'cursor-pointer focus-visible:bg-accent/[0.06] focus-visible:outline-none',
                    )}
                  >
                    <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">
                      #{item.id}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[10px] font-semibold',
                          caseTypeBadgeClasses(item.type),
                        )}
                      >
                        <span className="h-1 w-1 rounded-full bg-current" />
                        {caseTypeLabel(item.type)}
                      </span>
                    </td>
                    <td className="max-w-[150px] px-3 py-3">
                      <p
                        className="truncate text-[12px] font-medium text-foreground/90"
                        title={item.userId ?? undefined}
                      >
                        {personLabel(item.userName, item.userId)}
                      </p>
                      <p
                        className="mt-0.5 text-[11px] text-muted-foreground xl:hidden"
                        title={formatDateTime(item.createdAt)}
                      >
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </td>
                    <td className="hidden max-w-[140px] px-3 py-3 2xl:table-cell">
                      <p
                        className="truncate text-[11px] text-muted-foreground"
                        title={item.moderatorId}
                      >
                        {personLabel(item.moderatorName, item.moderatorId)}
                      </p>
                    </td>
                    <td className="hidden max-w-[220px] px-3 py-3 2xl:table-cell">
                      <p
                        className="truncate text-[11px] text-muted-foreground"
                        title={item.reason || undefined}
                      >
                        {item.reason || 'Без причины'}
                      </p>
                    </td>
                    <td
                      className="hidden whitespace-nowrap px-3 py-3 text-[11px] text-muted-foreground xl:table-cell"
                      title={formatDateTime(item.createdAt)}
                    >
                      {formatRelativeTime(item.createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
                            item.active
                              ? 'border-success/20 bg-success/10 text-success'
                              : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
                          )}
                        >
                          <span
                            className={cn(
                              'h-1 w-1 rounded-full',
                              item.active ? 'bg-success' : 'bg-muted-foreground',
                            )}
                          />
                          {item.active ? 'Активен' : 'Закрыт'}
                        </span>
                        {onCaseClick ? (
                          <ChevronRight
                            className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-70"
                            aria-hidden
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {footer ? <div className="border-t border-white/[0.06] px-5 py-3.5">{footer}</div> : null}
    </Card>
  );
}
