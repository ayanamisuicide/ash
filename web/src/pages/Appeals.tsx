import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  Check,
  Clock3,
  Gavel,
  History,
  Inbox,
  RefreshCw,
  ServerOff,
  ShieldAlert,
  ShieldCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { getAppeals, reviewAppeal } from '@/api/endpoints';
import type { Appeal } from '@/api/types';
import { AppealCard } from '@/components/appeals/AppealCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useGuildAccess } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { caseTypeLabel } from '@/lib/cases';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoAppeals, isDemoGuildId } from '@/lib/demo-data';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

type AppealTab = 'pending' | 'all';

interface ReviewTarget {
  appeal: Appeal;
  approve: boolean;
}

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

const TABS: Array<{ key: AppealTab; label: string; icon: typeof Clock3 }> = [
  { key: 'pending', label: 'Ожидают', icon: Clock3 },
  { key: 'all', label: 'Все', icon: History },
];

function approvalWarning(appeal: Appeal): string {
  switch (appeal.caseType) {
    case 'ban':
    case 'tempban':
      return 'Бот попытается снять бан и мут с пользователя. Если Discord отклонит действие, апелляция останется в очереди.';
    case 'mute':
      return 'Бот попытается снять мут с пользователя.';
    case 'timeout':
      return 'Бот попытается снять таймаут с пользователя.';
    case 'warn':
      return 'Бот снимет указанное предупреждение.';
    case 'temprole':
      return 'Бот снимет временную роль, если она ещё действует.';
    case 'kick':
    case 'softban':
      return 'Наказание уже завершено — апелляция будет закрыта с одобрением.';
    default:
      return appeal.caseId
        ? 'Бот попытается отменить указанное наказание.'
        : 'Бот попытается снять бан и мут с пользователя.';
  }
}

function approveActionLabel(appeal: Appeal | null): string {
  if (!appeal) return 'Одобрить апелляцию';
  switch (appeal.caseType) {
    case 'ban':
    case 'tempban':
      return 'Одобрить и разбанить';
    case 'mute':
      return 'Одобрить и снять мут';
    case 'timeout':
      return 'Одобрить и снять таймаут';
    case 'warn':
      return 'Одобрить и снять варн';
    case 'temprole':
      return 'Одобрить и снять роль';
    default:
      return 'Одобрить апелляцию';
  }
}

function AppealsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
          <div className="skeleton mt-3 h-3 w-36" />
          <div className="skeleton mt-3 h-24 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AppealsPage() {
  usePageTitle('Апелляции');

  const queryClient = useQueryClient();
  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const isDemo = isDemoGuildId(activeGuildId);
  const access = useGuildAccess();
  const canReviewAny = Boolean(access?.admin || access?.ban || access?.moderate);

  const canReviewAppeal = (appeal: Appeal) => {
    if (!access) return false;
    if (access.admin) return true;

    const requiresBan =
      !appeal.caseId ||
      appeal.caseType === 'ban' ||
      appeal.caseType === 'tempban' ||
      appeal.caseType === 'softban';

    return requiresBan ? access.ban : access.moderate;
  };

  const [tab, setTab] = useState<AppealTab>('pending');
  const [confirm, setConfirm] = useState<ReviewTarget | null>(null);

  useEffect(() => {
    setConfirm(null);
  }, [activeGuildId]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['guild', activeGuildId, 'appeals', tab, isDemo ? 'demo' : 'live'],
    queryFn: ({ signal }) => {
      if (isDemo && activeGuild) {
        return Promise.resolve(createDemoAppeals(activeGuild.id, tab));
      }
      return getAppeals(activeGuildId ?? '', tab, signal);
    },
    enabled: Boolean(activeGuildId),
    meta: { silent: true },
  });

  const reviewMutation = useMutation({
    mutationFn: (target: ReviewTarget) => {
      if (!activeGuildId) throw new Error('Сервер не выбран.');
      return reviewAppeal(activeGuildId, target.appeal.id, target.approve);
    },
    onSuccess: (result) => {
      if (!result.ok) {
        toast.error('Апелляция не рассмотрена', result.message);
        return;
      }
      toast.success('Апелляция рассмотрена', result.message);
      void queryClient.invalidateQueries({ queryKey: ['guild', activeGuildId] });
      setConfirm(null);
    },
  });

  const appeals = data?.items ?? [];
  const confirmingApprove = confirm?.approve ?? false;
  const inlineError = reviewMutation.isError ? getErrorMessage(reviewMutation.error) : null;

  const requestReview = (appeal: Appeal, approve: boolean) => {
    // Не показываем ошибку предыдущего рассмотрения в новом окне.
    reviewMutation.reset();
    setConfirm({ appeal, approve });
  };

  const closeConfirm = () => {
    if (reviewMutation.isPending) return;
    setConfirm(null);
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="show"
      className="space-y-5 sm:space-y-6"
    >
      <motion.header
        variants={itemVariants}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="eyebrow flex items-center gap-2 text-accent">
            <span className="h-px w-5 bg-accent/70" />
            NEXUS / АПЕЛЛЯЦИИ
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Апелляции</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Очередь обращений и решения по разбанам.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {access && !canReviewAny ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-warning">
              <ShieldAlert className="h-3 w-3" />
              только просмотр
            </span>
          ) : null}

          {isFetching && data ? (
            <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground sm:inline-flex">
              <Spinner className="h-3 w-3" />
              Обновление…
            </span>
          ) : null}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void refetch()}
            disabled={!activeGuildId || isFetching}
            className="gap-2"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Обновить
          </Button>
        </div>
      </motion.header>

      <motion.div
        variants={itemVariants}
        className="flex w-fit gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1"
        role="tablist"
        aria-label="Фильтр апелляций"
      >
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                active
                  ? 'bg-accent/[0.14] text-accent'
                  : 'text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </motion.div>

      {!activeGuildId ? (
        <EmptyState
          icon={ServerOff}
          title="Сервер не выбран"
          description="Выберите сервер в меню слева. Если список пуст, добавьте бота на сервер и убедитесь, что у вас есть права модератора."
          tone="muted"
        />
      ) : isLoading ? (
        <AppealsSkeleton />
      ) : isError && !data ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось загрузить апелляции"
          description={getErrorMessage(error)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : appeals.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === 'pending' ? 'Ожидающих апелляций нет' : 'Апелляций пока нет'}
          description={
            tab === 'pending'
              ? 'Как только пользователь подаст апелляцию, она появится здесь.'
              : 'История обращений на этом сервере будет собираться здесь.'
          }
          tone="muted"
        />
      ) : (
        <motion.div variants={itemVariants} className="space-y-3">
          {isError ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-4 py-2.5 text-xs text-danger">
              <span>Не удалось обновить список: {getErrorMessage(error)}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                Повторить
              </button>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {appeals.map((appeal) => (
              <motion.div key={appeal.id} variants={itemVariants} className="h-full">
                <AppealCard
                  appeal={appeal}
                  canReview={!isDemo && canReviewAppeal(appeal)}
                  disabled={reviewMutation.isPending}
                  demo={isDemo}
                  onReview={requestReview}
                />
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      <Modal
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
        title={
          confirm ? (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-lg border',
                  confirmingApprove
                    ? 'border-success/20 bg-success/10 text-success'
                    : 'border-danger/20 bg-danger/10 text-danger',
                )}
              >
                {confirmingApprove ? (
                  <ShieldCheck className="h-4 w-4" />
                ) : (
                  <ShieldAlert className="h-4 w-4" />
                )}
              </span>
              {confirmingApprove ? 'Одобрить апелляцию?' : 'Отклонить апелляцию?'}
            </span>
          ) : (
            'Рассмотрение апелляции'
          )
        }
        description={
          confirm
            ? `Апелляция #${confirm.appeal.id} · пользователь ${confirm.appeal.userId}`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeConfirm}
              disabled={reviewMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant={confirmingApprove ? 'success' : 'destructive'}
              onClick={() => {
                if (confirm) reviewMutation.mutate(confirm);
              }}
              disabled={reviewMutation.isPending}
              className="gap-2"
            >
              {reviewMutation.isPending ? <Spinner /> : confirmingApprove ? <Check /> : <X />}
              {reviewMutation.isPending
                ? 'Отправляем…'
                : confirmingApprove
                  ? approveActionLabel(confirm?.appeal ?? null)
                  : 'Отклонить апелляцию'}
            </Button>
          </>
        }
      >
        {confirm ? (
          <div className="space-y-4">
            <div
              className={cn(
                'flex items-start gap-2.5 rounded-xl border px-3.5 py-3',
                confirmingApprove
                  ? 'border-success/20 bg-success/[0.06]'
                  : 'border-danger/20 bg-danger/[0.06]',
              )}
            >
              {confirmingApprove ? (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              ) : (
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              )}
              <p
                className={cn(
                  'text-xs leading-relaxed',
                  confirmingApprove ? 'text-success/90' : 'text-danger/90',
                )}
              >
                {confirmingApprove
                  ? confirm
                    ? approvalWarning(confirm.appeal)
                    : 'Бот попытается снять наказание.'
                  : 'Апелляция будет закрыта без снятия наказаний. Пользователь получит уведомление об отказе.'}
              </p>
            </div>

            {confirm.appeal.caseId ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-[11px] text-muted-foreground">
                <Gavel className="h-3.5 w-3.5 text-accent" />
                <span>
                  Обжалуется кейс{' '}
                  <span className="font-mono text-foreground/85">#{confirm.appeal.caseId}</span>
                  {confirm.appeal.caseType ? ` · ${caseTypeLabel(confirm.appeal.caseType)}` : ''}
                </span>
                {confirm.appeal.caseReason ? (
                  <span className="w-full text-[10px] text-muted-foreground/80">
                    Причина наказания: {confirm.appeal.caseReason}
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-3">
              <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Причина обращения
              </p>
              <p className="mt-1.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground/90">
                {confirm.appeal.reason}
              </p>
              <p className="mt-2 text-[9px] text-muted-foreground">
                Подана {formatDateTime(confirm.appeal.createdAt)}
              </p>
            </div>

            {inlineError ? (
              <p className="rounded-lg border border-danger/20 bg-danger/[0.07] px-3 py-2 text-xs text-danger">
                {inlineError}
              </p>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </motion.div>
  );
}
