import { Check, Clock3, Gavel, UserRound, X } from 'lucide-react';
import type { Appeal, AppealStatus } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { caseTypeBadgeClasses, caseTypeLabel } from '@/lib/cases';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_META: Record<AppealStatus, { label: string; className: string }> = {
  pending: {
    label: 'Ожидает',
    className: 'border-warning/20 bg-warning/10 text-warning',
  },
  approved: {
    label: 'Одобрена',
    className: 'border-success/20 bg-success/10 text-success',
  },
  rejected: {
    label: 'Отклонена',
    className: 'border-danger/25 bg-danger/10 text-danger',
  },
};

interface AppealCardProps {
  appeal: Appeal;
  canReview: boolean;
  disabled?: boolean;
  demo?: boolean;
  onReview: (appeal: Appeal, approve: boolean) => void;
}

export function AppealCard({
  appeal,
  canReview,
  disabled = false,
  demo = false,
  onReview,
}: AppealCardProps) {
  const status = STATUS_META[appeal.status];
  const requiresBan =
    !appeal.caseId ||
    appeal.caseType === 'ban' ||
    appeal.caseType === 'tempban' ||
    appeal.caseType === 'softban';

  return (
    <Card className="flex h-full flex-col overflow-hidden p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] text-muted-foreground">Апелляция #{appeal.id}</p>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <UserRound className="h-3 w-3 shrink-0" />
            <span className="truncate font-mono" title={appeal.userId}>
              {appeal.userId}
            </span>
          </div>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
            status.className,
          )}
        >
          <span className="h-1 w-1 rounded-full bg-current" />
          {status.label}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock3 className="h-3 w-3 shrink-0" />
        <span title={formatDateTime(appeal.createdAt)}>
          {formatDateTime(appeal.createdAt)} · {formatRelativeTime(appeal.createdAt)}
        </span>
      </div>

      {appeal.caseId ? (
        <div
          className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"
          title={appeal.caseReason ?? undefined}
        >
          <Gavel className="h-3 w-3 shrink-0" />
          <span className="font-mono">#{appeal.caseId}</span>
          {appeal.caseType ? (
            <span
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[11px] font-semibold',
                caseTypeBadgeClasses(appeal.caseType),
              )}
            >
              {caseTypeLabel(appeal.caseType)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex-1 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Причина
        </p>
        <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
          {appeal.reason}
        </p>
      </div>

      {appeal.status === 'pending' && canReview ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => onReview(appeal, false)}
            disabled={disabled}
            className="gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Отклонить
          </Button>
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={() => onReview(appeal, true)}
            disabled={disabled}
            className="gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            Одобрить
          </Button>
        </div>
      ) : appeal.status === 'pending' ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {demo
            ? 'Демо-режим: решения по апелляциям отключены.'
            : requiresBan
              ? 'Для решения нужно право «Банить участников» или «Управление сервером».'
              : 'Для решения нужно право «Заглушать участников» или «Управление сервером».'}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>Рассмотрел: {appeal.reviewedBy ?? '—'}</span>
          {appeal.reviewedAt ? (
            <>
              <span className="text-white/40">·</span>
              <span title={formatDateTime(appeal.reviewedAt)}>
                {formatRelativeTime(appeal.reviewedAt)}
              </span>
            </>
          ) : null}
        </div>
      )}
    </Card>
  );
}
