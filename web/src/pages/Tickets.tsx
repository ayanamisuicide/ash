import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  Check,
  Clock3,
  FileText,
  History,
  Inbox,
  RefreshCw,
  ServerOff,
  ShieldAlert,
  Ticket as TicketIcon,
  WifiOff,
  X,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { closeTicket, getTickets, ticketTranscriptUrl } from '@/api/endpoints';
import type { Ticket } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { useGuildAccess } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoTickets, isDemoGuildId } from '@/lib/demo-data';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

type TicketTab = 'open' | 'all';

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

const TABS: Array<{ key: TicketTab; label: string; icon: typeof Clock3 }> = [
  { key: 'open', label: 'Открытые', icon: Clock3 },
  { key: 'all', label: 'Все', icon: History },
];

function TicketsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="glass-card p-4">
          <div className="flex items-center justify-between">
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-5 w-20 rounded-full" />
          </div>
          <div className="skeleton mt-3 h-3 w-40" />
          <div className="skeleton mt-3 h-14 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="skeleton h-8 w-full" />
            <div className="skeleton h-8 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function statusMeta(status: Ticket['status']) {
  return status === 'open'
    ? {
        label: 'Открыт',
        className: 'border-success/20 bg-success/10 text-success',
        dot: 'bg-success',
      }
    : {
        label: 'Закрыт',
        className: 'border-white/[0.1] bg-white/[0.04] text-muted-foreground',
        dot: 'bg-muted-foreground/60',
      };
}

export function TicketsPage() {
  usePageTitle('Тикеты');

  const queryClient = useQueryClient();
  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const isDemo = isDemoGuildId(activeGuildId);
  const access = useGuildAccess();
  const canClose = !isDemo && Boolean(access?.admin || access?.moderate);

  const [tab, setTab] = useState<TicketTab>('open');
  const [confirm, setConfirm] = useState<Ticket | null>(null);

  useEffect(() => {
    setConfirm(null);
  }, [activeGuildId]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['guild', activeGuildId, 'tickets', tab, isDemo ? 'demo' : 'live'],
    queryFn: ({ signal }) => {
      if (isDemo) return Promise.resolve(createDemoTickets(tab === 'open' ? 'open' : 'all'));
      return getTickets(activeGuildId ?? '', tab === 'open' ? 'open' : undefined, signal);
    },
    enabled: Boolean(activeGuildId),
    meta: { silent: true },
  });

  const closeMutation = useMutation({
    mutationFn: (ticket: Ticket) => {
      if (!activeGuildId) throw new Error('Сервер не выбран.');
      return closeTicket(activeGuildId, ticket.channelId);
    },
    onSuccess: (result) => {
      toast.success(
        'Тикет закрыт',
        result.transcript ? 'Транскрипт сохранён.' : 'Канал будет удалён через несколько секунд.',
      );
      void queryClient.invalidateQueries({ queryKey: ['guild', activeGuildId] });
      setConfirm(null);
    },
  });

  const tickets = data?.items ?? [];
  const inlineError = closeMutation.isError ? getErrorMessage(closeMutation.error) : null;

  const closeConfirm = () => {
    if (closeMutation.isPending) return;
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
            NEXUS / ТИКЕТЫ
          </p>
          <h1 className="mt-2 text-gradient text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
            Тикеты
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Обращения в поддержку: кто открыл, сколько висит и что было в переписке.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {access && !canClose ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-warning">
              <ShieldAlert className="h-3 w-3" />
              только просмотр
            </span>
          ) : null}

          {isFetching && data ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
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

      <motion.div variants={itemVariants} className="w-fit">
        <Tabs value={tab} onValueChange={(value) => setTab(value as TicketTab)}>
          <TabsList aria-label="Фильтр тикетов">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger key={item.key} value={item.key}>
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      </motion.div>

      <div key={tab} className="animate-tab-in">
        {!activeGuildId ? (
          <EmptyState
            icon={ServerOff}
            title="Сервер не выбран"
            description="Выберите сервер в меню слева, чтобы увидеть его тикеты."
            tone="muted"
          />
        ) : isLoading ? (
          <TicketsSkeleton />
        ) : isError && !data ? (
          <EmptyState
            icon={WifiOff}
            title="Не удалось загрузить тикеты"
            description={getErrorMessage(error)}
            tone="danger"
            action={
              <Button type="button" onClick={() => void refetch()}>
                <RefreshCw />
                Повторить
              </Button>
            }
          />
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={tab === 'open' ? 'Открытых тикетов нет' : 'Тикетов пока нет'}
            description={
              tab === 'open'
                ? 'Когда участник откроет обращение через панель тикетов, оно появится здесь.'
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
              {tickets.map((ticket) => {
                const status = statusMeta(ticket.status);
                return (
                  <motion.div key={ticket.channelId} variants={itemVariants} className="h-full">
                    <Card className="flex h-full flex-col overflow-hidden p-4 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-accent/20 hover:shadow-glow-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            #{ticket.channelName ?? ticket.channelId}
                          </p>
                          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <TicketIcon className="h-3 w-3 shrink-0" />
                            <span className="truncate font-mono" title={ticket.userId}>
                              {ticket.userName ? `@${ticket.userName}` : ticket.userId}
                            </span>
                          </div>
                        </div>

                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
                            status.className,
                          )}
                        >
                          <span
                            className={cn(
                              'h-1 w-1 rounded-full',
                              status.dot,
                              ticket.status === 'open' &&
                                'animate-pulse-soft shadow-[0_0_6px_currentColor]',
                            )}
                          />
                          {status.label}
                        </span>
                      </div>

                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p title={formatDateTime(ticket.createdAt)}>
                          Открыт: {formatDateTime(ticket.createdAt)} ·{' '}
                          {formatRelativeTime(ticket.createdAt)}
                        </p>
                        {ticket.closedAt ? (
                          <p title={formatDateTime(ticket.closedAt)}>
                            Закрыт: {formatDateTime(ticket.closedAt)}
                          </p>
                        ) : (
                          <p>Канал: {ticket.channelExists ? 'на месте' : 'удалён'}</p>
                        )}
                      </div>

                      <div className="mt-3 grid flex-1 grid-cols-2 items-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="gap-1.5"
                          disabled={!ticket.hasTranscript || !activeGuildId || isDemo}
                          title={
                            ticket.hasTranscript
                              ? 'Открыть HTML-транскрипт переписки'
                              : 'Транскрипт появится после закрытия тикета'
                          }
                          onClick={() => {
                            if (!activeGuildId) return;
                            window.open(
                              ticketTranscriptUrl(activeGuildId, ticket.channelId),
                              '_blank',
                              'noopener,noreferrer',
                            );
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Транскрипт
                        </Button>

                        {ticket.status === 'open' ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="gap-1.5"
                            disabled={!canClose || closeMutation.isPending}
                            onClick={() => {
                              closeMutation.reset();
                              setConfirm(ticket);
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                            Закрыть
                          </Button>
                        ) : (
                          <span className="pb-2 text-right text-[11px] text-muted-foreground">
                            {ticket.hasTranscript ? 'Транскрипт сохранён' : 'Без транскрипта'}
                          </span>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      <Modal
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) closeConfirm();
        }}
        title={
          <span className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger">
              <ShieldAlert className="h-4 w-4" />
            </span>
            Закрыть тикет?
          </span>
        }
        description={
          confirm
            ? `${confirm.channelName ? `#${confirm.channelName}` : confirm.channelId} · автор ${confirm.userName ? `@${confirm.userName}` : confirm.userId}`
            : undefined
        }
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={closeConfirm}
              disabled={closeMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (confirm) closeMutation.mutate(confirm);
              }}
              disabled={closeMutation.isPending}
              className="gap-2"
            >
              {closeMutation.isPending ? <Spinner /> : <Check />}
              {closeMutation.isPending ? 'Закрываем…' : 'Закрыть тикет'}
            </Button>
          </>
        }
      >
        {confirm ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-danger/20 bg-danger/[0.06] px-3.5 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p className="text-xs leading-relaxed text-danger/90">
                Бот сохранит HTML-транскрипт переписки и удалит канал через несколько секунд.
                Закрыть тикет можно один раз.
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
