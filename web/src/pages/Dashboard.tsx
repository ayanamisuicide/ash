import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import {
  CalendarClock,
  ClipboardList,
  FlaskConical,
  Inbox,
  RefreshCw,
  ServerOff,
  ShieldAlert,
  TriangleAlert,
  Users,
  WifiOff,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { getMemberProfile, getOverview } from '@/api/endpoints';
import type { MemberActionType, RecentCase } from '@/api/types';
import { EditCaseModal } from '@/components/cases/EditCaseModal';
import { BotInfo } from '@/components/dashboard/BotInfo';
import { ChartCardSkeleton, DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { RecentCasesTable } from '@/components/dashboard/RecentCasesTable';
import { SecurityWidget } from '@/components/dashboard/SecurityWidget';
import { StatCard, type StatTone } from '@/components/dashboard/StatCard';
import { ActionModal } from '@/components/members/ActionModal';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useGuildMeta } from '@/hooks/useGuildAccess';
import { usePageTitle } from '@/hooks/usePageTitle';
import { createDemoOverview } from '@/lib/demo-overview';
import { formatTime } from '@/lib/format';
import { selectActiveGuild, useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

// Recharts весит много, поэтому грузим график отдельным чанком.
const ActivityChart = lazy(() =>
  import('@/components/dashboard/ActivityChart').then((module) => ({
    default: module.ActivityChart,
  })),
);

const pageVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
};

const staggerVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

interface DashboardHeaderProps {
  isFetching: boolean;
  updatedAt: number;
  isDemo: boolean;
  disabled: boolean;
  onRefresh: () => void;
}

function DashboardHeader({
  isFetching,
  updatedAt,
  isDemo,
  disabled,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <div>
        <p className="eyebrow flex items-center gap-2 text-accent">
          <span className="h-px w-5 bg-accent/70" />
          NEXUS / ОБЗОР
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">Обзор</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Ключевые метрики сервера, последние кейсы и состояние защиты.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {isDemo ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-warning">
            <FlaskConical className="h-3 w-3" />
            демо-данные
          </span>
        ) : null}

        {updatedAt > 0 ? (
          <span className="hidden text-[10px] text-muted-foreground sm:inline">
            Обновлено в {formatTime(updatedAt)}
          </span>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRefresh}
          disabled={disabled || isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
          Обновить
        </Button>
      </div>
    </motion.header>
  );
}

export function DashboardPage() {
  usePageTitle('Обзор');

  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const activeGuild = useAuthStore(selectActiveGuild);
  const setAccess = useAuthStore((state) => state.setAccess);
  const metaQuery = useGuildMeta();
  const isDemo = import.meta.env.DEV && Boolean(activeGuildId?.startsWith('demo-'));

  const [selectedCase, setSelectedCase] = useState<RecentCase | null>(null);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [action, setAction] = useState<MemberActionType | null>(null);
  const [actionOpen, setActionOpen] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['guild', activeGuildId, 'overview'],
    queryFn: ({ signal }) => {
      // Dev-only ветка для кнопки «Посмотреть демо-панель».
      if (isDemo && activeGuild) return Promise.resolve(createDemoOverview(activeGuild));
      return getOverview(activeGuildId ?? '', signal);
    },
    enabled: Boolean(activeGuildId),
  });

  useEffect(() => {
    if (data) setAccess(data.access);
  }, [data, setAccess]);

  const caseUserId = caseModalOpen && !isDemo ? (selectedCase?.userId ?? null) : null;
  const { data: profileData, isFetching: profileFetching } = useQuery({
    queryKey: ['guild', activeGuildId, 'members', caseUserId],
    queryFn: ({ signal }) => getMemberProfile(activeGuildId ?? '', caseUserId ?? '', signal),
    enabled: Boolean(activeGuildId && caseUserId && !isDemo),
    meta: { silent: true },
  });

  useEffect(() => {
    setSelectedCase(null);
    setCaseModalOpen(false);
    setAction(null);
    setActionOpen(false);
  }, [activeGuildId]);

  const handleCaseClick = (item: RecentCase) => {
    setSelectedCase(item);
    setCaseModalOpen(true);
  };

  const handleCaseAction = (next: MemberActionType) => {
    setCaseModalOpen(false);
    setAction(next);
    setActionOpen(true);
  };

  const actionTarget =
    profileData?.member ??
    (selectedCase?.userId
      ? {
          id: selectedCase.userId,
          username: selectedCase.userName ?? selectedCase.userId,
          displayName: selectedCase.userName ?? selectedCase.userId,
          avatarUrl: '',
        }
      : null);

  const stats = data
    ? [
        {
          key: 'members',
          icon: Users,
          label: 'Участники',
          value: data.stats.members,
          note: 'На сервере',
          tone: 'default' as StatTone,
        },
        {
          key: 'totalCases',
          icon: ClipboardList,
          label: 'Всего кейсов',
          value: data.stats.totalCases,
          note: 'За всё время',
          tone: 'default' as StatTone,
        },
        {
          key: 'todayCases',
          icon: CalendarClock,
          label: 'За сегодня',
          value: data.stats.todayCases,
          note: 'Новые наказания',
          tone: 'success' as StatTone,
        },
        {
          key: 'activeCases',
          icon: ShieldAlert,
          label: 'Активные',
          value: data.stats.activeCases,
          note: 'Действуют сейчас',
          tone: 'danger' as StatTone,
        },
        {
          key: 'warns',
          icon: TriangleAlert,
          label: 'Варны',
          value: data.stats.warns,
          note: 'Предупреждения',
          tone: 'warn' as StatTone,
        },
        {
          key: 'pendingAppeals',
          icon: Inbox,
          label: 'Апелляции',
          value: data.stats.pendingAppeals,
          note: `${data.stats.totalAppeals} всего`,
          tone: 'info' as StatTone,
        },
      ]
    : [];

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHeader
        isFetching={isFetching}
        updatedAt={dataUpdatedAt}
        isDemo={isDemo}
        disabled={!activeGuildId}
        onRefresh={() => void refetch()}
      />

      {!activeGuildId ? (
        <EmptyState
          icon={ServerOff}
          title="Сервер не выбран"
          description="Выберите сервер в меню слева. Если список пуст, добавьте бота на сервер и убедитесь, что у вас есть права модератора."
          tone="muted"
        />
      ) : isLoading ? (
        <DashboardSkeleton />
      ) : isError && !data ? (
        <EmptyState
          icon={WifiOff}
          title="Не удалось загрузить обзор"
          description={getErrorMessage(error)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : data ? (
        <motion.div
          variants={pageVariants}
          initial="hidden"
          animate="show"
          className="space-y-4 sm:space-y-5"
        >
          <motion.div
            variants={staggerVariants}
            className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          >
            {stats.map((stat) => (
              <motion.div key={stat.key} variants={itemVariants}>
                <StatCard
                  icon={stat.icon}
                  label={stat.label}
                  value={stat.value}
                  note={stat.note}
                  tone={stat.tone}
                />
              </motion.div>
            ))}
          </motion.div>

          <motion.div variants={staggerVariants} className="grid gap-4 xl:grid-cols-3">
            <motion.div variants={itemVariants} className="space-y-4 xl:col-span-2">
              <Suspense fallback={<ChartCardSkeleton />}>
                <ActivityChart data={data.activeByType} />
              </Suspense>
              <RecentCasesTable
                cases={data.recentCases}
                description="Свежие действия модерации. Нажмите на кейс, чтобы открыть."
                onCaseClick={handleCaseClick}
              />
            </motion.div>

            <motion.div
              variants={itemVariants}
              className="grid gap-4 md:grid-cols-2 xl:grid-cols-1"
            >
              <SecurityWidget security={data.security} canConfigure={data.access.admin} />
              <BotInfo bot={data.bot} />
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}

      <EditCaseModal
        open={caseModalOpen}
        onOpenChange={setCaseModalOpen}
        guildId={activeGuildId}
        item={selectedCase}
        canEdit={Boolean(data?.access.admin || data?.access.moderate)}
        access={data?.access ?? null}
        profile={profileData?.member ?? null}
        profileLoading={profileFetching}
        onAction={handleCaseAction}
      />

      <ActionModal
        open={actionOpen}
        onOpenChange={setActionOpen}
        guildId={activeGuildId}
        member={actionTarget}
        action={action}
        roles={metaQuery.data?.roles ?? []}
      />
    </div>
  );
}
