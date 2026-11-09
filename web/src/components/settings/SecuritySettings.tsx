import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Clock3,
  Gauge,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  Zap,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { updateSecuritySettings } from '@/api/endpoints';
import type {
  NukeAction,
  RaidAction,
  SecuritySettings as SecuritySettingsData,
  SecuritySettingsUpdate,
  SettingsBundleResponse,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { FieldLabel, SettingsNotice, SettingsSection } from '@/components/settings/SettingsSection';
import { toast } from '@/store/ui';

interface SecuritySettingsProps {
  guildId: string;
  settings: SecuritySettingsData;
}

const RAID_ACTION_LABELS: Record<RaidAction, string> = {
  alert: 'Только оповестить',
  kick: 'Кикнуть',
  ban: 'Забанить',
};

const NUKE_ACTION_LABELS: Record<NukeAction, string> = {
  alert: 'Только оповестить',
  timeout: 'Таймаут на 1 час',
  kick: 'Кикнуть',
  ban: 'Забанить',
};

function intInRange(value: string, min: number, max: number): boolean {
  if (!value.trim()) return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

export function SecuritySettings({ guildId, settings }: SecuritySettingsProps) {
  const queryClient = useQueryClient();
  const settingsKey = ['guild', guildId, 'settings'] as const;

  const [raidEnabled, setRaidEnabled] = useState(settings.raid.enabled);
  const [raidThreshold, setRaidThreshold] = useState(String(settings.raid.joinThreshold));
  const [raidWindow, setRaidWindow] = useState(String(settings.raid.joinWindowSec));
  const [raidAge, setRaidAge] = useState(String(settings.raid.accountAgeDays));
  const [raidAction, setRaidAction] = useState<RaidAction>(settings.raid.action);
  const [raidDuration, setRaidDuration] = useState(String(settings.raid.durationSec));
  const [raidIgnoreBots, setRaidIgnoreBots] = useState(settings.raid.ignoreBots);
  const [raidDirty, setRaidDirty] = useState(false);

  const [nukeEnabled, setNukeEnabled] = useState(settings.nuke.enabled);
  const [nukeThreshold, setNukeThreshold] = useState(String(settings.nuke.threshold));
  const [nukeWindow, setNukeWindow] = useState(String(settings.nuke.windowSec));
  const [nukeAction, setNukeAction] = useState<NukeAction>(settings.nuke.action);
  const [nukeIgnoreAdmins, setNukeIgnoreAdmins] = useState(settings.nuke.ignoreAdmins);
  const [nukeDirty, setNukeDirty] = useState(false);
  const [savingArea, setSavingArea] = useState<'raid' | 'nuke' | null>(null);

  useEffect(() => {
    setRaidEnabled(settings.raid.enabled);
    setRaidThreshold(String(settings.raid.joinThreshold));
    setRaidWindow(String(settings.raid.joinWindowSec));
    setRaidAge(String(settings.raid.accountAgeDays));
    setRaidAction(settings.raid.action);
    setRaidDuration(String(settings.raid.durationSec));
    setRaidIgnoreBots(settings.raid.ignoreBots);
    setRaidDirty(false);

    setNukeEnabled(settings.nuke.enabled);
    setNukeThreshold(String(settings.nuke.threshold));
    setNukeWindow(String(settings.nuke.windowSec));
    setNukeAction(settings.nuke.action);
    setNukeIgnoreAdmins(settings.nuke.ignoreAdmins);
    setNukeDirty(false);
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (input: SecuritySettingsUpdate) => updateSecuritySettings(guildId, input),
    onSuccess: (data) => {
      queryClient.setQueryData<SettingsBundleResponse>(settingsKey, (previous) =>
        previous ? { ...previous, security: data.security } : previous,
      );
      toast.success('Настройки защиты сохранены');
      void queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (error) => {
      toast.error('Не удалось сохранить защиту', getErrorMessage(error));
    },
  });

  const raidValid =
    intInRange(raidThreshold, 1, 1_000) &&
    intInRange(raidWindow, 5, 3_600) &&
    intInRange(raidAge, 0, 365) &&
    intInRange(raidDuration, 30, 86_400);

  const nukeValid = intInRange(nukeThreshold, 1, 100) && intInRange(nukeWindow, 5, 3_600);

  const submitRaid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!raidValid || mutation.isPending) return;

    setSavingArea('raid');
    mutation.mutate(
      {
        raid: {
          enabled: raidEnabled,
          joinThreshold: Number(raidThreshold),
          joinWindowSec: Number(raidWindow),
          accountAgeDays: Number(raidAge),
          action: raidAction,
          durationSec: Number(raidDuration),
          ignoreBots: raidIgnoreBots,
        },
      },
      {
        onSuccess: () => setRaidDirty(false),
        onSettled: () => setSavingArea(null),
      },
    );
  };

  const submitNuke = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nukeValid || mutation.isPending) return;

    setSavingArea('nuke');
    mutation.mutate(
      {
        nuke: {
          enabled: nukeEnabled,
          threshold: Number(nukeThreshold),
          windowSec: Number(nukeWindow),
          action: nukeAction,
          ignoreAdmins: nukeIgnoreAdmins,
        },
      },
      {
        onSuccess: () => setNukeDirty(false),
        onSettled: () => setSavingArea(null),
      },
    );
  };

  const enabledCount = Number(raidEnabled) + Number(nukeEnabled);

  return (
    <div className="space-y-4">
      <SettingsNotice tone="info" title="Защита работает автоматически">
        Антирейд следит за массовыми входами и молодыми аккаунтами, анти-нак — за массовыми
        удалениями каналов, ролей, банами и другими опасными действиями. Уведомления приходят в
        канал логов.
      </SettingsNotice>

      <SettingsSection
        icon={ShieldCheck}
        title="Антирейд"
        description="Реакция на волну регистраций и подозрительно новые аккаунты."
        badge={
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {enabledCount}/2 включено
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {raidEnabled ? 'включён' : 'выключен'}
            </span>
            <Switch
              checked={raidEnabled}
              onCheckedChange={(checked) => {
                setRaidEnabled(checked);
                setRaidDirty(true);
              }}
              disabled={mutation.isPending}
              aria-label="Включить антирейд"
            />
          </div>
        }
        contentClassName="p-5"
      >
        <form onSubmit={submitRaid} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="raid-threshold" hint="1–1000">
                Входов за окно
              </FieldLabel>
              <Input
                id="raid-threshold"
                type="number"
                min={1}
                max={1000}
                value={raidThreshold}
                onChange={(event) => {
                  setRaidThreshold(event.target.value);
                  setRaidDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(raidThreshold, 1, 1000)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="raid-window" hint="5–3600 с">
                Окно, секунд
              </FieldLabel>
              <Input
                id="raid-window"
                type="number"
                min={5}
                max={3600}
                value={raidWindow}
                onChange={(event) => {
                  setRaidWindow(event.target.value);
                  setRaidDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(raidWindow, 5, 3600)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="raid-age" hint="0 — не проверять">
                Возраст аккаунта, дней
              </FieldLabel>
              <Input
                id="raid-age"
                type="number"
                min={0}
                max={365}
                value={raidAge}
                onChange={(event) => {
                  setRaidAge(event.target.value);
                  setRaidDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(raidAge, 0, 365)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="raid-duration" hint="30–86400 с">
                Длительность режима, секунд
              </FieldLabel>
              <Input
                id="raid-duration"
                type="number"
                min={30}
                max={86400}
                value={raidDuration}
                onChange={(event) => {
                  setRaidDuration(event.target.value);
                  setRaidDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(raidDuration, 30, 86400)}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="raid-action">Что делать при тревоге</FieldLabel>
            <Select
              id="raid-action"
              value={raidAction}
              onChange={(event) => {
                setRaidAction(event.target.value as RaidAction);
                setRaidDirty(true);
              }}
              disabled={mutation.isPending}
            >
              {(Object.entries(RAID_ACTION_LABELS) as Array<[RaidAction, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <Bot className="h-3.5 w-3.5" />
              Игнорировать входы ботов
            </span>
            <Switch
              checked={raidIgnoreBots}
              onCheckedChange={(checked) => {
                setRaidIgnoreBots(checked);
                setRaidDirty(true);
              }}
              disabled={mutation.isPending}
              aria-label="Игнорировать ботов"
            />
          </label>

          {!raidValid ? (
            <p className="text-[10px] text-warning">
              Проверьте диапазоны: входы 1–1000, окно 5–3600, возраст 0–365, длительность 30–86400.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-[10px] text-muted-foreground">
              {raidDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
            </span>
            <Button
              type="submit"
              variant="secondary"
              disabled={!raidValid || !raidDirty || mutation.isPending}
              className="gap-2"
            >
              {savingArea === 'raid' ? <Spinner /> : <Save />}
              {savingArea === 'raid' ? 'Сохраняем…' : 'Сохранить антирейд'}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        icon={ShieldAlert}
        title="Анти-нак"
        description="Обнаружение массовых опасных действий одного участника."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground">
              {nukeEnabled ? 'включён' : 'выключен'}
            </span>
            <Switch
              checked={nukeEnabled}
              onCheckedChange={(checked) => {
                setNukeEnabled(checked);
                setNukeDirty(true);
              }}
              disabled={mutation.isPending}
              aria-label="Включить анти-нак"
            />
          </div>
        }
      >
        <form onSubmit={submitNuke} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="nuke-threshold" hint="1–100">
                Действий за окно
              </FieldLabel>
              <Input
                id="nuke-threshold"
                type="number"
                min={1}
                max={100}
                value={nukeThreshold}
                onChange={(event) => {
                  setNukeThreshold(event.target.value);
                  setNukeDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(nukeThreshold, 1, 100)}
              />
            </div>
            <div>
              <FieldLabel htmlFor="nuke-window" hint="5–3600 с">
                Окно, секунд
              </FieldLabel>
              <Input
                id="nuke-window"
                type="number"
                min={5}
                max={3600}
                value={nukeWindow}
                onChange={(event) => {
                  setNukeWindow(event.target.value);
                  setNukeDirty(true);
                }}
                disabled={mutation.isPending}
                aria-invalid={!intInRange(nukeWindow, 5, 3600)}
              />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="nuke-action">Что делать с нарушителем</FieldLabel>
            <Select
              id="nuke-action"
              value={nukeAction}
              onChange={(event) => {
                setNukeAction(event.target.value as NukeAction);
                setNukeDirty(true);
              }}
              disabled={mutation.isPending}
            >
              {(Object.entries(NUKE_ACTION_LABELS) as Array<[NukeAction, string]>).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </Select>
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-2">
              <UserX className="h-3.5 w-3.5" />
              Игнорировать администраторов
            </span>
            <Switch
              checked={nukeIgnoreAdmins}
              onCheckedChange={(checked) => {
                setNukeIgnoreAdmins(checked);
                setNukeDirty(true);
              }}
              disabled={mutation.isPending}
              aria-label="Игнорировать администраторов"
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <Gauge className="h-4 w-4 text-accent" />
              <p className="mt-2 text-[11px] font-semibold">Порог</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {nukeThreshold || '—'} действий за {nukeWindow || '—'} с
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <Zap className="h-4 w-4 text-warning" />
              <p className="mt-2 text-[11px] font-semibold">Реакция</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {NUKE_ACTION_LABELS[nukeAction]}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <Clock3 className="h-4 w-4 text-info" />
              <p className="mt-2 text-[11px] font-semibold">Уведомление</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">в канал логов</p>
            </div>
          </div>

          {!nukeValid ? (
            <p className="text-[10px] text-warning">
              Порог — от 1 до 100, окно — от 5 до 3600 секунд.
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <span className="text-[10px] text-muted-foreground">
              {nukeDirty ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
            </span>
            <Button
              type="submit"
              variant="secondary"
              disabled={!nukeValid || !nukeDirty || mutation.isPending}
              className="gap-2"
            >
              {savingArea === 'nuke' ? <Spinner /> : <Save />}
              {savingArea === 'nuke' ? 'Сохраняем…' : 'Сохранить анти-нак'}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <div className="flex items-center justify-center gap-2 pb-2 text-[9px] uppercase tracking-[0.16em] text-white/20">
        <Shield className="h-3 w-3" />
        защита применяется сразу после сохранения
      </div>
    </div>
  );
}
