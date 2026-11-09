import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AtSign,
  Ban,
  Filter,
  Hash,
  Link2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Type,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  addAutomodWord,
  deleteWarnAction,
  removeAutomodWord,
  updateModerationSettings,
} from '@/api/endpoints';
import type {
  AutomodAction,
  AutomodSettingsUpdate,
  GuildMetaChannel,
  GuildMetaRole,
  ModerationSettings as ModerationSettingsData,
  ModerationSettingsUpdate,
  WarnActionSettings,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import { WarnActionModal } from '@/components/settings/WarnActionModal';
import { pluralizeRu } from '@/lib/format';
import {
  AUTOMOD_ACTION_LABELS,
  AUTOMOD_ACTIONS,
  WARN_ACTION_LABELS,
  automodActionNeedsDuration,
  durationToInput,
  formatDurationMs,
  parseDurationToMs,
} from '@/lib/settings';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

interface ModerationSettingsProps {
  guildId: string;
  settings: ModerationSettingsData;
  channels: GuildMetaChannel[];
  roles: GuildMetaRole[];
}

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: ReactNode;
}

function SectionHeader({ icon: Icon, title, description, children }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor?: string;
  children: string;
  hint?: string;
}) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-3">
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {children}
      </label>
      {hint ? <span className="text-[9px] text-muted-foreground/70">{hint}</span> : null}
    </div>
  );
}

function AutomodFilterCard({
  icon: Icon,
  label,
  description,
  checked,
  disabled,
  onChange,
  children,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        checked
          ? 'border-accent/20 bg-accent/[0.05]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={cn(
              'mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border',
              checked
                ? 'border-accent/25 bg-accent/10 text-accent'
                : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold">{label}</span>
            <span className="mt-0.5 block text-[10px] leading-relaxed text-muted-foreground">
              {description}
            </span>
          </span>
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={label}
        />
      </div>
      {checked && children ? (
        <div className="mt-3 border-t border-white/[0.06] pt-3">{children}</div>
      ) : null}
    </div>
  );
}

export function ModerationSettings({
  guildId,
  settings,
  channels,
  roles,
}: ModerationSettingsProps) {
  const queryClient = useQueryClient();
  const [mentions, setMentions] = useState(String(settings.automod.mentions));
  const [warnExpiry, setWarnExpiry] = useState(String(settings.warnExpiryDays));
  const [word, setWord] = useState('');
  const [warnActionOpen, setWarnActionOpen] = useState(false);

  const [automodAction, setAutomodAction] = useState<AutomodAction>(settings.automod.action);
  const [automodDuration, setAutomodDuration] = useState(
    durationToInput(settings.automod.durationMs),
  );
  const [deleteMessage, setDeleteMessage] = useState(settings.automod.deleteMessage);
  const [capsPercent, setCapsPercent] = useState(String(settings.automod.capsPercent));
  const [capsMinLength, setCapsMinLength] = useState(String(settings.automod.capsMinLength));
  const [spamCount, setSpamCount] = useState(String(settings.automod.spamCount));
  const [spamWindowSec, setSpamWindowSec] = useState(String(settings.automod.spamWindowSec));
  const [spamDuplicateCount, setSpamDuplicateCount] = useState(
    String(settings.automod.spamDuplicateCount),
  );
  const [ignoredChannelId, setIgnoredChannelId] = useState('');
  const [ignoredRoleId, setIgnoredRoleId] = useState('');
  const [immunityRoleId, setImmunityRoleId] = useState('');

  // Синхронизация с сервером, если значение изменили в другом месте.
  useEffect(() => {
    setMentions(String(settings.automod.mentions));
    setAutomodAction(settings.automod.action);
    setAutomodDuration(durationToInput(settings.automod.durationMs));
    setDeleteMessage(settings.automod.deleteMessage);
    setCapsPercent(String(settings.automod.capsPercent));
    setCapsMinLength(String(settings.automod.capsMinLength));
    setSpamCount(String(settings.automod.spamCount));
    setSpamWindowSec(String(settings.automod.spamWindowSec));
    setSpamDuplicateCount(String(settings.automod.spamDuplicateCount));
  }, [settings.automod]);

  useEffect(() => {
    setWarnExpiry(String(settings.warnExpiryDays));
  }, [settings.warnExpiryDays]);

  const invalidateSettings = () => {
    void queryClient.invalidateQueries({ queryKey: ['guild', guildId, 'settings'] });
  };

  const patchMutation = useMutation({
    mutationFn: (input: ModerationSettingsUpdate) => updateModerationSettings(guildId, input),
    onSuccess: (_data, variables) => {
      if (variables.automod) toast.success('Автомодерация обновлена');
      else if (variables.warnExpiryDays !== undefined) toast.success('Срок жизни варнов обновлён');
      else toast.success('Настройки модерации обновлены');
      invalidateSettings();
    },
  });

  const addWordMutation = useMutation({
    mutationFn: (value: string) => addAutomodWord(guildId, value),
    onSuccess: () => {
      toast.success('Стоп-слово добавлено');
      setWord('');
      invalidateSettings();
    },
  });

  const removeWordMutation = useMutation({
    mutationFn: (value: string) => removeAutomodWord(guildId, value),
    onSuccess: () => {
      toast.success('Стоп-слово удалено');
      invalidateSettings();
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteWarnAction(guildId, id),
    onSuccess: () => {
      toast.success('Правило удалено');
      invalidateSettings();
    },
  });

  type AutomodBooleanKey = 'enabled' | 'invites' | 'links' | 'caps' | 'spam' | 'deleteMessage';

  const updateAutomodBoolean = (key: AutomodBooleanKey, value: boolean) => {
    patchMutation.mutate({ automod: { [key]: value } as AutomodSettingsUpdate });
  };

  const handleSaveAutomodBehavior = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const needsDuration = automodActionNeedsDuration(automodAction);

    patchMutation.mutate({
      automod: {
        action: automodAction,
        duration: needsDuration && automodDuration.trim() ? automodDuration.trim() : null,
        deleteMessage: automodAction === 'delete' ? true : deleteMessage,
      },
    });
  };

  const saveAutomodThresholds = () => {
    if (busy) return;
    if (!mentionsValid || !capsPercentValid || !capsMinLengthValid || !spamCountValid) return;
    if (!spamWindowValid || !spamDuplicateValid) return;

    patchMutation.mutate({
      automod: {
        mentions: mentionsNumber,
        capsPercent: Number(capsPercent),
        capsMinLength: Number(capsMinLength),
        spamCount: Number(spamCount),
        spamWindowSec: Number(spamWindowSec),
        spamDuplicateCount: Number(spamDuplicateCount),
      },
    });
  };

  const addIgnoredChannel = () => {
    if (!ignoredChannelId || busy) return;
    if (settings.automod.ignoredChannels.includes(ignoredChannelId)) return;
    patchMutation.mutate({
      automod: { ignoredChannels: [...settings.automod.ignoredChannels, ignoredChannelId] },
    });
    setIgnoredChannelId('');
  };

  const removeIgnoredChannel = (channelId: string) => {
    if (busy) return;
    patchMutation.mutate({
      automod: {
        ignoredChannels: settings.automod.ignoredChannels.filter((id) => id !== channelId),
      },
    });
  };

  const addIgnoredRole = () => {
    if (!ignoredRoleId || busy) return;
    if (settings.automod.ignoredRoles.includes(ignoredRoleId)) return;
    patchMutation.mutate({
      automod: { ignoredRoles: [...settings.automod.ignoredRoles, ignoredRoleId] },
    });
    setIgnoredRoleId('');
  };

  const removeIgnoredRole = (roleId: string) => {
    if (busy) return;
    patchMutation.mutate({
      automod: {
        ignoredRoles: settings.automod.ignoredRoles.filter((id) => id !== roleId),
      },
    });
  };

  const addImmunityRole = () => {
    if (!immunityRoleId || busy) return;
    if (settings.immunityRoles.includes(immunityRoleId)) return;
    patchMutation.mutate({
      immunityRoles: [...settings.immunityRoles, immunityRoleId],
    });
    setImmunityRoleId('');
  };

  const removeImmunityRole = (roleId: string) => {
    if (busy) return;
    patchMutation.mutate({
      immunityRoles: settings.immunityRoles.filter((id) => id !== roleId),
    });
  };

  const updateChannel = (
    field: 'reportChannelId' | 'appealChannelId' | 'muteRoleId',
    value: string,
  ) => {
    const next = value || null;
    if (field === 'reportChannelId') patchMutation.mutate({ reportChannelId: next });
    if (field === 'appealChannelId') patchMutation.mutate({ appealChannelId: next });
    if (field === 'muteRoleId') patchMutation.mutate({ muteRoleId: next });
  };

  const mentionsNumber = Number(mentions);
  const mentionsValid =
    mentions.trim() !== '' &&
    Number.isInteger(mentionsNumber) &&
    mentionsNumber >= 0 &&
    mentionsNumber <= 100;

  const capsPercentNumber = Number(capsPercent);
  const capsPercentValid =
    capsPercent.trim() !== '' &&
    Number.isInteger(capsPercentNumber) &&
    capsPercentNumber >= 10 &&
    capsPercentNumber <= 100;

  const capsMinLengthNumber = Number(capsMinLength);
  const capsMinLengthValid =
    capsMinLength.trim() !== '' &&
    Number.isInteger(capsMinLengthNumber) &&
    capsMinLengthNumber >= 1 &&
    capsMinLengthNumber <= 2_000;

  const spamCountNumber = Number(spamCount);
  const spamCountValid =
    spamCount.trim() !== '' &&
    Number.isInteger(spamCountNumber) &&
    spamCountNumber >= 2 &&
    spamCountNumber <= 100;

  const spamWindowNumber = Number(spamWindowSec);
  const spamWindowValid =
    spamWindowSec.trim() !== '' &&
    Number.isInteger(spamWindowNumber) &&
    spamWindowNumber >= 1 &&
    spamWindowNumber <= 300;

  const spamDuplicateNumber = Number(spamDuplicateCount);
  const spamDuplicateValid =
    spamDuplicateCount.trim() !== '' &&
    Number.isInteger(spamDuplicateNumber) &&
    spamDuplicateNumber >= 2 &&
    spamDuplicateNumber <= 100;

  const automodDurationMs = automodDuration.trim() ? parseDurationToMs(automodDuration) : null;
  const automodDurationValid = !automodDuration.trim() || automodDurationMs !== null;
  const automodDurationLimit = automodAction === 'timeout' ? 28 * 86_400_000 : 365 * 86_400_000;
  const automodDurationInRange = !automodDurationMs || automodDurationMs <= automodDurationLimit;

  const warnExpiryNumber = Number(warnExpiry);
  const warnExpiryValid =
    warnExpiry.trim() !== '' &&
    Number.isInteger(warnExpiryNumber) &&
    warnExpiryNumber >= 0 &&
    warnExpiryNumber <= 365;

  const savingAutomodBehavior =
    patchMutation.isPending && patchMutation.variables?.automod?.action !== undefined;
  const savingAutomodThresholds =
    patchMutation.isPending && patchMutation.variables?.automod?.spamCount !== undefined;
  const savingWarnExpiry =
    patchMutation.isPending && patchMutation.variables?.warnExpiryDays !== undefined;
  const removingWord = removeWordMutation.isPending ? removeWordMutation.variables : undefined;
  const deletingRule = deleteRuleMutation.isPending ? deleteRuleMutation.variables : undefined;
  const busy =
    patchMutation.isPending ||
    addWordMutation.isPending ||
    removeWordMutation.isPending ||
    deleteRuleMutation.isPending;

  const textChannels = channels.filter((channel) => channel.isText && !channel.isCategory);
  const assignableRoles = roles.filter((role) => !role.isEveryone && !role.managed);
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));

  const handleAddWord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = word.trim();
    if (!value || busy) return;
    addWordMutation.mutate(value);
  };

  const handleSaveWarnExpiry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!warnExpiryValid || busy) return;
    if (warnExpiryNumber === settings.warnExpiryDays) return;
    patchMutation.mutate({ warnExpiryDays: warnExpiryNumber });
  };

  return (
    <div className="space-y-4">
      <section className="glass-card overflow-hidden">
        <SectionHeader
          icon={ShieldCheck}
          title="Автомодерация"
          description="Фильтры, пороги и наказания за нарушения."
        >
          <span className="text-[10px] text-muted-foreground">
            {settings.automod.enabled ? 'включена' : 'выключена'}
          </span>
          <Switch
            checked={settings.automod.enabled}
            onCheckedChange={(checked) => updateAutomodBoolean('enabled', checked)}
            disabled={busy}
            aria-label="Включить автомодерацию"
          />
        </SectionHeader>

        <div className="space-y-5 p-5">
          <form
            onSubmit={handleSaveAutomodBehavior}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger/10 text-danger">
                <Ban className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-semibold">Что делать при нарушении</h3>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  Сообщение можно удалить, а к нарушителю — применить наказание.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="automod-action">Действие</FieldLabel>
                <Select
                  id="automod-action"
                  value={automodAction}
                  onChange={(event) => setAutomodAction(event.target.value as AutomodAction)}
                  disabled={busy}
                >
                  {AUTOMOD_ACTIONS.map((value) => (
                    <option key={value} value={value}>
                      {AUTOMOD_ACTION_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel htmlFor="automod-duration" hint="пусто — 10 минут">
                  Длительность
                </FieldLabel>
                <Input
                  id="automod-duration"
                  value={automodDuration}
                  onChange={(event) => setAutomodDuration(event.target.value)}
                  placeholder="10m, 1h, 7d"
                  disabled={busy || !automodActionNeedsDuration(automodAction)}
                  aria-invalid={!automodDurationValid || !automodDurationInRange}
                />
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {['10m', '1h', '1d', '7d'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAutomodDuration(preset)}
                      disabled={busy || !automodActionNeedsDuration(automodAction)}
                      className={cn(
                        'rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50',
                        automodDuration === preset
                          ? 'border-accent/30 bg-accent/[0.14] text-accent'
                          : 'border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-white/[0.14] hover:text-foreground',
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {!automodDurationValid || !automodDurationInRange ? (
              <p className="mt-2 text-[10px] text-warning">
                {!automodDurationValid
                  ? 'Неверный формат длительности. Пример: 10m, 1h, 7d.'
                  : automodAction === 'timeout'
                    ? 'Максимальный таймаут — 28 дней.'
                    : 'Максимальная длительность — 365 дней.'}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={automodAction === 'delete' || deleteMessage}
                  onCheckedChange={setDeleteMessage}
                  disabled={busy || automodAction === 'delete'}
                  aria-label="Удалять сообщение с нарушением"
                />
                Удалять сообщение с нарушением
              </label>
              <Button
                type="submit"
                variant="secondary"
                disabled={busy || !automodDurationValid || !automodDurationInRange}
                className="gap-2"
              >
                {savingAutomodBehavior ? <Spinner /> : <Save />}
                {savingAutomodBehavior ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Фильтры
              </h3>
              <span className="text-[10px] text-muted-foreground">
                проверок включено:{' '}
                {
                  [
                    settings.automod.invites,
                    settings.automod.links,
                    settings.automod.caps,
                    settings.automod.spam,
                    settings.automod.mentions > 0,
                  ].filter(Boolean).length
                }
              </span>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <AutomodFilterCard
                icon={Mail}
                label="Приглашения"
                description="Ссылки на другие серверы"
                checked={settings.automod.invites}
                disabled={busy}
                onChange={(checked) => updateAutomodBoolean('invites', checked)}
              />

              <AutomodFilterCard
                icon={Link2}
                label="Ссылки"
                description="Любые внешние ссылки"
                checked={settings.automod.links}
                disabled={busy}
                onChange={(checked) => updateAutomodBoolean('links', checked)}
              />

              <AutomodFilterCard
                icon={Type}
                label="CAPS"
                description="Сообщения заглавными буквами"
                checked={settings.automod.caps}
                disabled={busy}
                onChange={(checked) => updateAutomodBoolean('caps', checked)}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel htmlFor="automod-caps-percent" hint="10–100">
                      Заглавных, %
                    </FieldLabel>
                    <Input
                      id="automod-caps-percent"
                      type="number"
                      min={10}
                      max={100}
                      value={capsPercent}
                      onChange={(event) => setCapsPercent(event.target.value)}
                      disabled={busy}
                      aria-invalid={!capsPercentValid}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="automod-caps-min" hint="1–2000">
                      Мин. длина
                    </FieldLabel>
                    <Input
                      id="automod-caps-min"
                      type="number"
                      min={1}
                      max={2000}
                      value={capsMinLength}
                      onChange={(event) => setCapsMinLength(event.target.value)}
                      disabled={busy}
                      aria-invalid={!capsMinLengthValid}
                    />
                  </div>
                </div>
                {!capsPercentValid || !capsMinLengthValid ? (
                  <p className="mt-2 text-[10px] text-warning">
                    Укажите процент от 10 до 100 и длину от 1 до 2000.
                  </p>
                ) : null}
              </AutomodFilterCard>

              <AutomodFilterCard
                icon={MessageSquare}
                label="Спам"
                description="Флуд и повторяющиеся сообщения"
                checked={settings.automod.spam}
                disabled={busy}
                onChange={(checked) => updateAutomodBoolean('spam', checked)}
              >
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <FieldLabel htmlFor="automod-spam-count" hint="2–100">
                      Сообщений
                    </FieldLabel>
                    <Input
                      id="automod-spam-count"
                      type="number"
                      min={2}
                      max={100}
                      value={spamCount}
                      onChange={(event) => setSpamCount(event.target.value)}
                      disabled={busy}
                      aria-invalid={!spamCountValid}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="automod-spam-window" hint="1–300 с">
                      За, сек
                    </FieldLabel>
                    <Input
                      id="automod-spam-window"
                      type="number"
                      min={1}
                      max={300}
                      value={spamWindowSec}
                      onChange={(event) => setSpamWindowSec(event.target.value)}
                      disabled={busy}
                      aria-invalid={!spamWindowValid}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor="automod-spam-dup" hint="2–100">
                      Повторов
                    </FieldLabel>
                    <Input
                      id="automod-spam-dup"
                      type="number"
                      min={2}
                      max={100}
                      value={spamDuplicateCount}
                      onChange={(event) => setSpamDuplicateCount(event.target.value)}
                      disabled={busy}
                      aria-invalid={!spamDuplicateValid}
                    />
                  </div>
                </div>
                {!spamCountValid || !spamWindowValid || !spamDuplicateValid ? (
                  <p className="mt-2 text-[10px] text-warning">
                    Сообщений и повторов — от 2 до 100, окно — от 1 до 300 секунд.
                  </p>
                ) : null}
              </AutomodFilterCard>

              <AutomodFilterCard
                icon={AtSign}
                label="Упоминания"
                description="Массовые упоминания в одном сообщении"
                checked={settings.automod.mentions > 0}
                disabled={busy}
                onChange={(checked) =>
                  patchMutation.mutate({
                    automod: { mentions: checked ? settings.automod.mentions || 5 : 0 },
                  })
                }
              >
                <FieldLabel htmlFor="automod-mentions" hint="0 — выключено">
                  Лимит упоминаний
                </FieldLabel>
                <Input
                  id="automod-mentions"
                  type="number"
                  min={0}
                  max={100}
                  value={mentions}
                  onChange={(event) => setMentions(event.target.value)}
                  disabled={busy}
                  aria-invalid={!mentionsValid}
                />
                {!mentionsValid ? (
                  <p className="mt-2 text-[10px] text-warning">Введите целое число от 0 до 100.</p>
                ) : null}
              </AutomodFilterCard>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] text-muted-foreground">
                Пороги CAPS, спама и упоминаний сохраняются вместе.
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={saveAutomodThresholds}
                disabled={
                  busy ||
                  !mentionsValid ||
                  !capsPercentValid ||
                  !capsMinLengthValid ||
                  !spamCountValid ||
                  !spamWindowValid ||
                  !spamDuplicateValid
                }
                className="gap-2"
              >
                {savingAutomodThresholds ? <Spinner /> : <Save />}
                {savingAutomodThresholds ? 'Сохраняем…' : 'Сохранить пороги'}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                <Ban className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-semibold">Исключения</h3>
                <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                  В этих каналах и для участников с этими ролями автомод не срабатывает.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="automod-ignore-channel">Каналы</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    id="automod-ignore-channel"
                    value={ignoredChannelId}
                    onChange={(event) => setIgnoredChannelId(event.target.value)}
                    disabled={busy || textChannels.length === 0}
                  >
                    <option value="">Выберите канал</option>
                    {textChannels
                      .filter((channel) => !settings.automod.ignoredChannels.includes(channel.id))
                      .map((channel) => (
                        <option key={channel.id} value={channel.id}>
                          #{channel.name}
                        </option>
                      ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={addIgnoredChannel}
                    disabled={!ignoredChannelId || busy}
                    aria-label="Добавить канал в исключения"
                  >
                    <Plus />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {settings.automod.ignoredChannels.length > 0 ? (
                    settings.automod.ignoredChannels.map((channelId) => (
                      <span
                        key={channelId}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-1 text-[11px] text-foreground/85"
                      >
                        <Hash className="h-3 w-3 text-muted-foreground" />
                        {channelNames.get(channelId) ?? channelId}
                        <button
                          type="button"
                          onClick={() => removeIgnoredChannel(channelId)}
                          disabled={busy}
                          aria-label="Убрать канал из исключений"
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Исключений нет — проверяются все каналы.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <FieldLabel htmlFor="automod-ignore-role">Роли</FieldLabel>
                <div className="flex gap-2">
                  <Select
                    id="automod-ignore-role"
                    value={ignoredRoleId}
                    onChange={(event) => setIgnoredRoleId(event.target.value)}
                    disabled={busy || assignableRoles.length === 0}
                  >
                    <option value="">Выберите роль</option>
                    {assignableRoles
                      .filter((role) => !settings.automod.ignoredRoles.includes(role.id))
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    onClick={addIgnoredRole}
                    disabled={!ignoredRoleId || busy}
                    aria-label="Добавить роль в исключения"
                  >
                    <Plus />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {settings.automod.ignoredRoles.length > 0 ? (
                    settings.automod.ignoredRoles.map((roleId) => (
                      <span
                        key={roleId}
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-1 text-[11px] text-foreground/85"
                      >
                        <UserRound className="h-3 w-3 text-muted-foreground" />
                        {roleNames.get(roleId) ?? roleId}
                        <button
                          type="button"
                          onClick={() => removeIgnoredRole(roleId)}
                          disabled={busy}
                          aria-label="Убрать роль из исключений"
                          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Исключений нет — проверяются все участники без прав модератора.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <SectionHeader
          icon={Filter}
          title="Стоп-слова"
          description="Сообщения с этими словами будут удаляться автоматически."
        >
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {settings.automod.words.length}
          </span>
        </SectionHeader>

        <div className="space-y-4 p-5">
          <form onSubmit={handleAddWord} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={word}
              onChange={(event) => setWord(event.target.value)}
              placeholder="Например, нежелательное слово"
              maxLength={100}
              disabled={busy}
              aria-label="Новое стоп-слово"
            />
            <Button type="submit" disabled={!word.trim() || busy} className="shrink-0 gap-2">
              {addWordMutation.isPending ? <Spinner /> : <Plus />}
              {addWordMutation.isPending ? 'Добавляем…' : 'Добавить'}
            </Button>
          </form>

          {settings.automod.words.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {settings.automod.words.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-1 text-[11px] text-foreground/85"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeWordMutation.mutate(item)}
                    disabled={busy}
                    aria-label={`Удалить стоп-слово ${item}`}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                  >
                    {removingWord === item ? (
                      <Spinner className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-white/[0.08] px-4 py-6 text-center text-[11px] text-muted-foreground">
              Стоп-слов пока нет. Добавьте первое слово в поле выше.
            </p>
          )}
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <SectionHeader
          icon={TriangleAlert}
          title="Автонаказания по варнам"
          description="Правила эскалации: сколько варнов и какое действие применить."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setWarnActionOpen(true)}
            disabled={busy}
            className="gap-2"
          >
            <Plus className="h-3.5 w-3.5" />
            Добавить правило
          </Button>
        </SectionHeader>

        <div className="p-5">
          {settings.warnActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center">
              <p className="text-xs font-semibold">Правил пока нет</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Добавьте правило, чтобы бот автоматически наказывал за серию варнов.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {settings.warnActions.map((rule: WarnActionSettings) => (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-warning/20 bg-warning/10 text-warning">
                    <TriangleAlert className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">
                      {rule.count} {pluralizeRu(rule.count, 'варн', 'варна', 'варнов')} за{' '}
                      {rule.windowDays} {pluralizeRu(rule.windowDays, 'день', 'дня', 'дней')}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {WARN_ACTION_LABELS[rule.action]}
                      {rule.durationMs ? ` · ${formatDurationMs(rule.durationMs)}` : ''}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteRuleMutation.mutate(rule.id)}
                    disabled={busy}
                    aria-label="Удалить правило"
                    title="Удалить правило"
                    className="shrink-0 text-muted-foreground hover:bg-danger/10 hover:text-danger"
                  >
                    {deletingRule === rule.id ? <Spinner /> : <Trash2 />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <SectionHeader
          icon={Settings2}
          title="Каналы и роли"
          description="Куда отправлять жалобы и апелляции, какую роль выдавать при муте."
        />

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="report-channel"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Канал жалоб
            </label>
            <Select
              id="report-channel"
              value={settings.reportChannelId ?? ''}
              onChange={(event) => updateChannel('reportChannelId', event.target.value)}
              disabled={busy || textChannels.length === 0}
            >
              <option value="">Не выбран</option>
              {textChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label
              htmlFor="appeal-channel"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Канал апелляций
            </label>
            <Select
              id="appeal-channel"
              value={settings.appealChannelId ?? ''}
              onChange={(event) => updateChannel('appealChannelId', event.target.value)}
              disabled={busy || textChannels.length === 0}
            >
              <option value="">Не выбран</option>
              {textChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  #{channel.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label
              htmlFor="mute-role"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Роль мута
            </label>
            <Select
              id="mute-role"
              value={settings.muteRoleId ?? ''}
              onChange={(event) => updateChannel('muteRoleId', event.target.value)}
              disabled={busy || assignableRoles.length === 0}
            >
              <option value="">Не выбрана</option>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>

          <form onSubmit={handleSaveWarnExpiry}>
            <label
              htmlFor="warn-expiry"
              className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              Срок жизни варнов
            </label>
            <div className="flex gap-2">
              <Input
                id="warn-expiry"
                type="number"
                min={0}
                max={365}
                value={warnExpiry}
                onChange={(event) => setWarnExpiry(event.target.value)}
                disabled={busy}
                aria-invalid={!warnExpiryValid}
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!warnExpiryValid || warnExpiryNumber === settings.warnExpiryDays || busy}
                className="shrink-0 gap-2"
              >
                {savingWarnExpiry ? <Spinner /> : <Save />}
                {savingWarnExpiry ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              0 — варны не истекают. Максимум 365 дней.
            </p>
            {!warnExpiryValid ? (
              <p className="mt-1 text-[10px] text-warning">Введите целое число от 0 до 365.</p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="glass-card overflow-hidden">
        <SectionHeader
          icon={ShieldCheck}
          title="Иммунитет"
          description="Участников с этими ролями нельзя наказать через бота."
        >
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
            ролей: {settings.immunityRoles.length}
          </span>
        </SectionHeader>

        <div className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={immunityRoleId}
              onChange={(event) => setImmunityRoleId(event.target.value)}
              disabled={busy || assignableRoles.length === 0}
              aria-label="Выбрать роль иммунитета"
            >
              <option value="">Выберите роль</option>
              {assignableRoles
                .filter((role) => !settings.immunityRoles.includes(role.id))
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              onClick={addImmunityRole}
              disabled={!immunityRoleId || busy}
              className="shrink-0 gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {settings.immunityRoles.length > 0 ? (
              settings.immunityRoles.map((roleId) => (
                <span
                  key={roleId}
                  className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] py-1 pl-2.5 pr-1 text-[11px] text-foreground/85"
                >
                  <UserRound className="h-3 w-3 text-muted-foreground" />
                  {roleNames.get(roleId) ?? roleId}
                  <button
                    type="button"
                    onClick={() => removeImmunityRole(roleId)}
                    disabled={busy}
                    aria-label="Убрать роль из иммунитета"
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            ) : (
              <p className="text-[10px] text-muted-foreground">
                Иммунитета нет — бот может наказать любого участника ниже своей роли.
              </p>
            )}
          </div>
        </div>
      </section>

      <WarnActionModal open={warnActionOpen} onOpenChange={setWarnActionOpen} guildId={guildId} />
    </div>
  );
}
