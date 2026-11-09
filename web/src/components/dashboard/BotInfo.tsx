import { Activity, Bot, Server, Timer } from 'lucide-react';
import type { BotInfo as BotInfoData } from '@/api/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatNumber, formatUptime, pingTone } from '@/lib/format';
import { cn } from '@/lib/utils';

interface BotInfoProps {
  bot: BotInfoData;
}

const pingToneClasses = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

export function BotInfo({ bot }: BotInfoProps) {
  const tone = pingTone(bot.ping);
  const statusText =
    tone === 'success'
      ? 'Работает стабильно'
      : tone === 'warning'
        ? 'Повышенный пинг'
        : 'Нестабильное соединение';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px]">Состояние бота</CardTitle>
        <CardDescription>Discord.js 14 · WebSocket</CardDescription>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="flex items-center gap-3">
          <div className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-gradient shadow-button ring-1 ring-inset ring-white/20">
            <Bot className="h-5 w-5 text-white" strokeWidth={1.8} />
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 animate-pulse-soft rounded-full border-2 border-panel bg-success shadow-[0_0_8px_rgba(61,214,140,0.8)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {bot.tag ?? 'Discord bot'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{statusText}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_6px_rgba(61,214,140,0.8)]" />
            онлайн
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2.5 text-center transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]">
            <Activity className="mx-auto h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
            <p className={cn('mt-1.5 font-mono text-[12px] font-semibold', pingToneClasses[tone])}>
              {bot.ping} ms
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Пинг
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2.5 text-center transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]">
            <Timer className="mx-auto h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
            <p className="mt-1.5 truncate font-mono text-[12px] font-semibold text-foreground/90">
              {formatUptime(bot.uptime)}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Аптайм
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] px-2 py-2.5 text-center transition-colors duration-200 hover:border-white/[0.1] hover:bg-white/[0.04]">
            <Server className="mx-auto h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.8} />
            <p className="mt-1.5 font-mono text-[12px] font-semibold text-foreground/90">
              {formatNumber(bot.guilds)}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Серверы
            </p>
          </div>
        </div>

        <p className="mt-3 truncate text-center font-mono text-[11px] text-white/40">
          ID {bot.id ?? '—'}
        </p>
      </CardContent>
    </Card>
  );
}
