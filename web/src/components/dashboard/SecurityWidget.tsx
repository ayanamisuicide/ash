import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { NukeAction, RaidAction, SecuritySettings } from '@/api/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface SecurityWidgetProps {
  security: SecuritySettings;
  canConfigure: boolean;
}

const RAID_ACTION_LABELS: Record<RaidAction, string> = {
  alert: 'Оповещение',
  kick: 'Кик',
  ban: 'Бан',
};

const NUKE_ACTION_LABELS: Record<NukeAction, string> = {
  alert: 'Оповещение',
  timeout: 'Таймаут',
  kick: 'Кик',
  ban: 'Бан',
};

interface SecurityBlockProps {
  icon: LucideIcon;
  title: string;
  description: string;
  enabled: boolean;
  threshold: string;
  action: string;
  details: string[];
}

function SecurityBlock({
  icon: Icon,
  title,
  description,
  enabled,
  threshold,
  action,
  details,
}: SecurityBlockProps) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5 transition-colors duration-200',
        enabled
          ? 'border-success/15 bg-success/[0.035] hover:border-success/25'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={cn(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl border',
              enabled
                ? 'border-success/20 bg-success/10 text-success shadow-glow-success'
                : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <p className="truncate text-[13px] font-semibold leading-tight">{title}</p>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em]',
            enabled
              ? 'border-success/20 bg-success/10 text-success'
              : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
          )}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              enabled ? 'bg-success shadow-[0_0_6px_rgba(61,214,140,0.8)]' : 'bg-muted-foreground',
            )}
          />
          {enabled ? 'Вкл' : 'Выкл'}
        </span>
      </div>

      <p className="mt-2 text-xs leading-snug text-muted-foreground">{description}</p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
          {threshold}
        </span>
        <span className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-muted-foreground">
          Действие: {action}
        </span>
        {details.map((detail) => (
          <span
            key={detail}
            className="rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            {detail}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SecurityWidget({ security, canConfigure }: SecurityWidgetProps) {
  const { raid, nuke } = security;
  const enabledCount = Number(raid.enabled) + Number(nuke.enabled);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[15px]">Защита сервера</CardTitle>
            <CardDescription className="mt-1">Антирейд и анти-нак</CardDescription>
          </div>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]',
              enabledCount > 0
                ? 'border-success/20 bg-success/10 text-success'
                : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground',
            )}
          >
            {enabledCount}/2
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <SecurityBlock
          icon={ShieldCheck}
          title="Антирейд"
          description="Массовые входы и новые аккаунты"
          enabled={raid.enabled}
          threshold={`${raid.joinThreshold} входов / ${raid.joinWindowSec} с`}
          action={RAID_ACTION_LABELS[raid.action]}
          details={[
            ...(raid.accountAgeDays > 0 ? [`Возраст < ${raid.accountAgeDays} дн.`] : []),
            ...(raid.ignoreBots ? ['Боты игнорируются'] : []),
          ]}
        />

        <SecurityBlock
          icon={ShieldAlert}
          title="Анти-нак"
          description="Массовые удаления, баны и роли"
          enabled={nuke.enabled}
          threshold={`${nuke.threshold} действий / ${nuke.windowSec} с`}
          action={NUKE_ACTION_LABELS[nuke.action]}
          details={nuke.ignoreAdmins ? ['Админы игнорируются'] : []}
        />

        {canConfigure ? (
          <Button asChild variant="ghost" size="sm" className="mt-1 w-full justify-between">
            <Link to="/settings?tab=security">
              Настроить защиту
              <ArrowUpRight />
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
