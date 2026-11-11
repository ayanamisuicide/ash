import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, type Variants } from 'framer-motion';
import { AlertTriangle, Inbox, RefreshCw, Shield, ShieldAlert, Users } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getErrorMessage } from '@/api/client';
import { getAnalytics } from '@/api/endpoints';
import type { ModerationAnalyticsResponse } from '@/api/types';
import { StatCard } from '@/components/dashboard/StatCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { usePageTitle } from '@/hooks/usePageTitle';
import { EASE_OUT_SOFT } from '@/lib/constants';
import { createDemoAnalytics, isDemoGuildId } from '@/lib/demo-data';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

const pageVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT_SOFT } },
};

const BAR_COLORS = ['#6673ff', '#54b8ff', '#3dd68c', '#ffb020', '#ff5f6d', '#b388ff'];

function shortDate(value: string): string {
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
}

function RankList({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: ModerationAnalyticsResponse['topModerators'];
  empty: string;
  tone: 'accent' | 'danger';
}) {
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'grid h-7 w-7 place-items-center rounded-lg border text-[11px]',
            tone === 'accent'
              ? 'border-accent/20 bg-accent/10 text-accent'
              : 'border-danger/20 bg-danger/10 text-danger',
          )}
        >
          {tone === 'accent' ? (
            <Shield className="h-3.5 w-3.5" />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5" />
          )}
        </span>
        <h3 className="text-xs font-semibold">{title}</h3>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {items.map((item, index) => (
            <div key={`${item.id}-${index}`}>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground/90">
                  {index + 1}. {item.name ? `@${item.name}` : item.id}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{item.count}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={cn(
                    'h-full rounded-full',
                    tone === 'accent'
                      ? 'bg-gradient-to-r from-accent/70 to-info/70'
                      : 'bg-gradient-to-r from-danger/70 to-warning/70',
                  )}
                  style={{ width: `${Math.max(6, (item.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function AnalyticsPage() {
  usePageTitle('Аналитика');

  const activeGuildId = useAuthStore((state) => state.activeGuildId);
  const isDemo = isDemoGuildId(activeGuildId);
  const [days, setDays] = useState(30);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['guild', activeGuildId, 'analytics', days, isDemo ? 'demo' : 'live'],
    queryFn: ({ signal }) => {
      if (isDemo) return Promise.resolve(createDemoAnalytics(days));
      return getAnalytics(activeGuildId ?? '', days, signal);
    },
    enabled: Boolean(activeGuildId),
    meta: { silent: true },
  });

  const hasData =
    Boolean(data) &&
    ((data?.totals.cases ?? 0) > 0 ||
      (data?.appeals.pending ?? 0) + (data?.appeals.approved ?? 0) + (data?.appeals.rejected ?? 0) >
        0);

  const tooltipStyle = {
    background: '#14151d',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    fontSize: 12,
    color: '#e8ebf2',
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
            NEXUS / АНАЛИТИКА
          </p>
          <h1 className="mt-2 text-gradient text-2xl font-bold tracking-[-0.03em] sm:text-3xl">
            Аналитика модерации
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Динамика наказаний, нагрузка на модераторов и повторные нарушители.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFetching && data ? (
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
              <Spinner className="h-3 w-3" />
              Обновление…
            </span>
          ) : null}

          <Select
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value))}
            aria-label="Период аналитики"
            className="w-[130px]"
          >
            <option value="7">7 дней</option>
            <option value="30">30 дней</option>
            <option value="90">90 дней</option>
          </Select>

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

      {!activeGuildId ? (
        <EmptyState
          icon={Users}
          title="Сервер не выбран"
          description="Выберите сервер в меню слева, чтобы увидеть его аналитику."
          tone="muted"
        />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-card p-4">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton mt-3 h-8 w-16" />
              <div className="skeleton mt-2 h-2.5 w-32" />
            </div>
          ))}
        </div>
      ) : isError && !data ? (
        <EmptyState
          icon={AlertTriangle}
          title="Не удалось загрузить аналитику"
          description={getErrorMessage(error)}
          tone="danger"
          action={
            <Button type="button" onClick={() => void refetch()}>
              <RefreshCw />
              Повторить
            </Button>
          }
        />
      ) : !hasData ? (
        <EmptyState
          icon={Inbox}
          title="Пока нет данных"
          description="Как только появятся кейсы и апелляции, здесь начнёт собираться статистика."
          tone="muted"
        />
      ) : (
        <>
          <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Shield}
              label="Кейсов за период"
              value={data?.totals.cases ?? 0}
              note={`за ${data?.days ?? days} дней`}
            />
            <StatCard
              icon={ShieldAlert}
              label="Активных наказаний"
              value={data?.totals.active ?? 0}
              note={`${data?.totals.bans ?? 0} банов · ${data?.totals.mutes ?? 0} мутов`}
              tone="danger"
            />
            <StatCard
              icon={AlertTriangle}
              label="Предупреждений"
              value={data?.totals.warnings ?? 0}
              note={`${formatNumber(data?.totals.messages ?? 0)} сообщений учтено`}
              tone="warn"
            />
            <StatCard
              icon={Inbox}
              label="Апелляций в ожидании"
              value={data?.appeals.pending ?? 0}
              note={`${data?.appeals.approved ?? 0} одобрено · ${data?.appeals.rejected ?? 0} отклонено`}
              tone="info"
            />
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]"
          >
            <Card className="min-w-0 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">Наказания по дням</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Кейсы, созданные за выбранный период
                  </p>
                </div>
                <span className="rounded-lg border border-accent/20 bg-accent/10 px-2 py-1 text-[11px] font-semibold text-accent">
                  {data?.totals.cases ?? 0} всего
                </span>
              </div>

              <div className="mt-4 h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.daily ?? []}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="analyticsCases" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6673ff" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#6673ff" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      tick={{ fill: '#8d97ac', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={28}
                      tick={{ fill: '#8d97ac', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(value) => `Дата: ${value}`}
                      formatter={(value) => [`${value} кейсов`, 'Наказания']}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#7c8cff"
                      strokeWidth={2}
                      fill="url(#analyticsCases)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="min-w-0 p-4">
              <h2 className="text-sm font-semibold">По типам</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Что применяют чаще всего</p>

              <div className="mt-4 h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={(data?.byType ?? []).slice(0, 6)}
                    layout="vertical"
                    margin={{ top: 0, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="label"
                      width={92}
                      tick={{ fill: '#8d97ac', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value}`, 'Кейсов']}
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                      {(data?.byType ?? []).slice(0, 6).map((entry, index) => (
                        <Cell key={entry.type} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-2">
            <RankList
              title="Топ модераторов"
              items={data?.topModerators ?? []}
              empty="За период не было действий."
              tone="accent"
            />
            <RankList
              title="Повторные нарушители"
              items={data?.topUsers ?? []}
              empty="Нарушителей за период нет."
              tone="danger"
            />
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
