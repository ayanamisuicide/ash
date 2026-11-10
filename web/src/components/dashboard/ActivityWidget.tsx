import { useState } from 'react';
import { Headphones, MessageSquare, Sparkles, Volume2 } from 'lucide-react';
import type { ActivityMetric, ActivityResponse } from '@/api/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatNumber, formatUptime, getInitials } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS: Array<{ key: ActivityMetric; label: string }> = [
  { key: 'xp', label: 'XP' },
  { key: 'messages', label: 'Сообщения' },
  { key: 'voice', label: 'Голос' },
];

function metricValue(
  metric: ActivityMetric,
  row: ActivityResponse['top'][ActivityMetric][number],
): string {
  if (metric === 'messages') return `${formatNumber(row.messages)} сообщ.`;
  if (metric === 'voice') return formatUptime(row.voiceSeconds);
  return `${row.level} ур. · ${formatNumber(row.xp)} XP`;
}

interface ActivityWidgetProps {
  activity: ActivityResponse | null;
}

export function ActivityWidget({ activity }: ActivityWidgetProps) {
  const [metric, setMetric] = useState<ActivityMetric>('xp');

  if (!activity) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px]">Активность</CardTitle>
          <CardDescription className="mt-1">Сообщения, голос и уровни</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">Данные ещё собираются.</p>
        </CardContent>
      </Card>
    );
  }

  const { totals, settings, live } = activity;
  const rows = activity.top[metric] ?? [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">Активность</CardTitle>
            <CardDescription className="mt-1">
              Участников в статистике: {formatNumber(totals.tracked)}
            </CardDescription>
          </div>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]',
              settings.levelingEnabled
                ? 'border-premium/20 bg-premium/10 text-premium'
                : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground',
            )}
          >
            {settings.levelingEnabled ? 'XP вкл' : 'XP выкл'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> Сообщения
            </p>
            <p className="mt-1 text-sm font-semibold">{formatNumber(totals.messages)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Headphones className="h-3 w-3" /> В голосе
            </p>
            <p className="mt-1 text-sm font-semibold">{formatUptime(totals.voiceSeconds)}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> XP
            </p>
            <p className="mt-1 text-sm font-semibold">{formatNumber(totals.xp)}</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMetric(tab.key)}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors',
                metric === tab.key
                  ? 'bg-accent/15 text-accent-soft'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Пока нет данных.{' '}
            {metric === 'voice' && !settings.voiceTrackingEnabled
              ? 'Учёт времени в голосе выключен в настройках.'
              : null}
          </p>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((row, index) => (
              <li key={row.userId} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <Avatar className="h-7 w-7">
                  {row.avatarUrl ? (
                    <AvatarImage src={row.avatarUrl} alt={row.name ?? row.userId} />
                  ) : null}
                  <AvatarFallback>{getInitials(row.name ?? row.userId)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium">{row.name ?? row.userId}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {metricValue(metric, row)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <Volume2 className="h-3 w-3" /> Сейчас в голосе · {live.length}
          </p>
          {live.length === 0 ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {settings.voiceTrackingEnabled
                ? 'Голосовые каналы пусты.'
                : 'Учёт голоса выключен в настройках.'}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {live.slice(0, 5).map((session) => (
                <li
                  key={session.userId}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate font-medium">{session.name ?? session.userId}</span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {formatUptime(session.seconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
