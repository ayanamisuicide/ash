import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Mic,
  Plus,
  Save,
  Sparkles,
  Tag,
  Ticket,
  UserPlus,
  Users,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { updateCommunitySettings } from '@/api/endpoints';
import type {
  CommunitySettings as CommunitySettingsData,
  CommunitySettingsUpdate,
  GuildMetaChannel,
  GuildMetaRole,
  SettingsBundleResponse,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { Switch } from '@/components/ui/Switch';
import {
  FieldLabel,
  SettingsChip,
  SettingsNotice,
  SettingsSection,
  SwitchRow,
} from '@/components/settings/SettingsSection';
import { toast } from '@/store/ui';

interface CommunitySettingsProps {
  guildId: string;
  guildName: string;
  settings: CommunitySettingsData;
  channels: GuildMetaChannel[];
  roles: GuildMetaRole[];
}

type Tone = 'accent' | 'success' | 'danger' | 'warn' | 'info' | 'neutral' | 'premium';

const TONE_COLORS: Record<Tone, string> = {
  accent: '#6673ff',
  success: '#3dd68c',
  danger: '#ff5f6d',
  warn: '#ffb020',
  info: '#54b8ff',
  neutral: '#8d97ac',
  premium: '#b388ff',
};

function renderPreview(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function plainText(text: string): string {
  return text.replaceAll('**', '').replaceAll('__', '');
}

/** Число из input в допустимом диапазоне */
function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function DiscordPreview({
  tone,
  title,
  description,
  fields,
  footer,
}: {
  tone: Tone;
  title: string;
  description: string;
  fields: Array<{ label: string; value: string }>;
  footer: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#14151d] p-3 shadow-inner-top">
      <div className="border-l-[3px] pl-3" style={{ borderLeftColor: TONE_COLORS[tone] }}>
        <p className="text-[11px] font-semibold text-foreground">{title}</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
          {plainText(description) || 'Текст не задан — бот использует стандартный.'}
        </p>
        {fields.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {fields.map((field) => (
              <p key={field.label} className="text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">{field.label}:</span>{' '}
                {field.value}
              </p>
            ))}
          </div>
        ) : null}
        <p className="mt-2 border-t border-white/[0.06] pt-1.5 text-[8px] text-muted-foreground/60">
          {footer}
        </p>
      </div>
    </div>
  );
}

export function CommunitySettings({
  guildId,
  guildName,
  settings,
  channels,
  roles,
}: CommunitySettingsProps) {
  const queryClient = useQueryClient();
  const settingsKey = ['guild', guildId, 'settings'] as const;

  const [welcomeChannelId, setWelcomeChannelId] = useState(settings.welcomeChannelId ?? '');
  const [welcomeMessage, setWelcomeMessage] = useState(settings.welcomeMessage);
  const [goodbyeChannelId, setGoodbyeChannelId] = useState(settings.goodbyeChannelId ?? '');
  const [goodbyeMessage, setGoodbyeMessage] = useState(settings.goodbyeMessage);
  const [levelingEnabled, setLevelingEnabled] = useState(settings.levelingEnabled);
  const [levelupChannelId, setLevelupChannelId] = useState(settings.levelupChannelId ?? '');
  const [levelupMessage, setLevelupMessage] = useState(settings.levelupMessage);
  const [messageXp, setMessageXp] = useState(String(settings.messageXp));
  const [messageCooldownSec, setMessageCooldownSec] = useState(String(settings.messageCooldownSec));
  const [voiceXp, setVoiceXp] = useState(String(settings.voiceXp));
  const [voiceTrackingEnabled, setVoiceTrackingEnabled] = useState(settings.voiceTrackingEnabled);
  const [tempVoiceChannelId, setTempVoiceChannelId] = useState(settings.tempVoiceChannelId ?? '');
  const [ticketCategoryId, setTicketCategoryId] = useState(settings.ticketCategoryId ?? '');
  const [ticketLogChannelId, setTicketLogChannelId] = useState(settings.ticketLogChannelId ?? '');
  const [ticketSupportRoleId, setTicketSupportRoleId] = useState(
    settings.ticketSupportRoleId ?? '',
  );
  const [autoroleId, setAutoroleId] = useState('');
  const [savingArea, setSavingArea] = useState<string | null>(null);

  useEffect(() => {
    setWelcomeChannelId(settings.welcomeChannelId ?? '');
    setWelcomeMessage(settings.welcomeMessage);
    setGoodbyeChannelId(settings.goodbyeChannelId ?? '');
    setGoodbyeMessage(settings.goodbyeMessage);
    setLevelingEnabled(settings.levelingEnabled);
    setLevelupChannelId(settings.levelupChannelId ?? '');
    setLevelupMessage(settings.levelupMessage);
    setMessageXp(String(settings.messageXp));
    setMessageCooldownSec(String(settings.messageCooldownSec));
    setVoiceXp(String(settings.voiceXp));
    setVoiceTrackingEnabled(settings.voiceTrackingEnabled);
    setTempVoiceChannelId(settings.tempVoiceChannelId ?? '');
    setTicketCategoryId(settings.ticketCategoryId ?? '');
    setTicketLogChannelId(settings.ticketLogChannelId ?? '');
    setTicketSupportRoleId(settings.ticketSupportRoleId ?? '');
  }, [settings]);

  const mutation = useMutation({
    mutationFn: (input: CommunitySettingsUpdate) => updateCommunitySettings(guildId, input),
    onSuccess: (data) => {
      queryClient.setQueryData<SettingsBundleResponse>(settingsKey, (previous) =>
        previous ? { ...previous, community: data.community } : previous,
      );
      toast.success('Настройки сообщества сохранены');
      void queryClient.invalidateQueries({ queryKey: settingsKey });
    },
    onError: (error) => {
      toast.error('Не удалось сохранить настройки', getErrorMessage(error));
    },
  });

  const save = (area: string, patch: CommunitySettingsUpdate): void => {
    if (mutation.isPending) return;
    setSavingArea(area);
    mutation.mutate(patch, {
      onSettled: () => setSavingArea(null),
    });
  };

  const busy = mutation.isPending;
  const textChannels = channels.filter((channel) => channel.isText && !channel.isCategory);
  const voiceChannels = channels.filter((channel) => channel.isVoice);
  const categories = channels.filter((channel) => channel.isCategory);
  const assignableRoles = roles.filter((role) => !role.isEveryone && !role.managed);
  const channelNames = new Map(channels.map((channel) => [channel.id, channel.name]));
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const autoroles = settings.autoroleIds.filter((id) => roleNames.has(id));

  const welcomePreview = renderPreview(welcomeMessage, {
    user: '@Новый участник',
    guild: guildName,
    memberCount: '128',
  });
  const goodbyePreview = renderPreview(goodbyeMessage, {
    user: '@Участник',
    guild: guildName,
    memberCount: '128',
  });
  const levelupPreview = renderPreview(levelupMessage, {
    user: '@Участник',
    guild: guildName,
    level: '5',
    xp: '1250',
    memberCount: '128',
  });

  const handleWelcome = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save('welcome', {
      welcomeChannelId: welcomeChannelId || null,
      welcomeMessage: welcomeMessage.trim(),
    });
  };

  const handleGoodbye = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save('goodbye', {
      goodbyeChannelId: goodbyeChannelId || null,
      goodbyeMessage: goodbyeMessage.trim(),
    });
  };

  const handleLeveling = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save('leveling', {
      levelingEnabled,
      levelupChannelId: levelupChannelId || null,
      levelupMessage: levelupMessage.trim(),
      messageXp: clampInt(messageXp, 0, 100, settings.messageXp),
      messageCooldownSec: clampInt(messageCooldownSec, 0, 3_600, settings.messageCooldownSec),
      voiceXp: clampInt(voiceXp, 0, 100, settings.voiceXp),
      voiceTrackingEnabled,
    });
  };

  const handleTempVoice = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save('tempvoice', { tempVoiceChannelId: tempVoiceChannelId || null });
  };

  const handleTickets = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save('tickets', {
      ticketCategoryId: ticketCategoryId || null,
      ticketLogChannelId: ticketLogChannelId || null,
      ticketSupportRoleId: ticketSupportRoleId || null,
    });
  };

  const addAutorole = () => {
    if (!autoroleId || busy || autoroles.includes(autoroleId)) return;
    save('autoroles', { autoroleIds: [...autoroles, autoroleId] });
    setAutoroleId('');
  };

  const removeAutorole = (roleId: string) => {
    if (busy) return;
    save('autoroles', { autoroleIds: autoroles.filter((id) => id !== roleId) });
  };

  return (
    <div className="space-y-4">
      <SettingsNotice tone="info" title="Шаблоны сообщений">
        Используйте{' '}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{'{user}'}</code>,{' '}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{'{guild}'}</code> и{' '}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{'{memberCount}'}</code>.
        Для уровней доступны{' '}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{'{level}'}</code> и{' '}
        <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">{'{xp}'}</code>. Пустой
        шаблон — стандартный текст бота.
      </SettingsNotice>

      <SettingsSection
        icon={UserPlus}
        title="Приветствия и прощания"
        description="Тёплые сообщения при входе и выходе участников."
        actions={
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {welcomeChannelId ? 'вход включён' : 'вход выключен'} ·{' '}
            {goodbyeChannelId ? 'выход включён' : 'выход выключен'}
          </span>
        }
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <form
            onSubmit={handleWelcome}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-success/20 bg-success/10 text-success">
                  <UserPlus className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">Приветствие</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Отправляется в выбранный канал при входе.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground">
                {welcomeChannelId ? 'вкл' : 'выкл'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <FieldLabel htmlFor="welcome-channel">Канал</FieldLabel>
                <Select
                  id="welcome-channel"
                  value={welcomeChannelId}
                  onChange={(event) => setWelcomeChannelId(event.target.value)}
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
                <FieldLabel htmlFor="welcome-message" hint={`${welcomeMessage.length}/1000`}>
                  Текст
                </FieldLabel>
                <Textarea
                  id="welcome-message"
                  value={welcomeMessage}
                  onChange={(event) => setWelcomeMessage(event.target.value)}
                  maxLength={1000}
                  placeholder="Добро пожаловать, {user}, на {guild}!"
                  disabled={busy}
                />
              </div>
              <DiscordPreview
                tone="accent"
                title="👋 Добро пожаловать!"
                description={welcomePreview}
                fields={[
                  { label: 'Участник', value: '@Новый участник' },
                  { label: 'Сервер', value: guildName },
                  { label: 'Участников', value: '128' },
                ]}
                footer="🔖 Участник #128 · 09.11.2026, 14:32"
              />
            </div>

            <div className="mt-4 flex justify-end border-t border-white/[0.06] pt-3">
              <Button type="submit" variant="secondary" disabled={busy} className="gap-2">
                {savingArea === 'welcome' ? <Spinner /> : <Save />}
                {savingArea === 'welcome' ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>

          <form
            onSubmit={handleGoodbye}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">Прощание</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Отправляется при выходе участника.
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted-foreground">
                {goodbyeChannelId ? 'вкл' : 'выкл'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <FieldLabel htmlFor="goodbye-channel">Канал</FieldLabel>
                <Select
                  id="goodbye-channel"
                  value={goodbyeChannelId}
                  onChange={(event) => setGoodbyeChannelId(event.target.value)}
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
                <FieldLabel htmlFor="goodbye-message" hint={`${goodbyeMessage.length}/1000`}>
                  Текст
                </FieldLabel>
                <Textarea
                  id="goodbye-message"
                  value={goodbyeMessage}
                  onChange={(event) => setGoodbyeMessage(event.target.value)}
                  maxLength={1000}
                  placeholder="{user} покинул сервер {guild}."
                  disabled={busy}
                />
              </div>
              <DiscordPreview
                tone="neutral"
                title="👋 До свидания!"
                description={goodbyePreview}
                fields={[
                  { label: 'Участник', value: '@Участник' },
                  { label: 'Сервер', value: guildName },
                  { label: 'Участников', value: '128' },
                ]}
                footer="🔖 09.11.2026, 14:32"
              />
            </div>

            <div className="mt-4 flex justify-end border-t border-white/[0.06] pt-3">
              <Button type="submit" variant="secondary" disabled={busy} className="gap-2">
                {savingArea === 'goodbye' ? <Spinner /> : <Save />}
                {savingArea === 'goodbye' ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Sparkles}
        title="Автороли и уровни"
        description="Роли при входе и прогресс активности участников."
        actions={
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            автороли: {autoroles.length}
          </span>
        }
      >
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex items-start gap-2.5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
                <Tag className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-semibold">Автороли</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Выдаются автоматически при входе на сервер.
                </p>
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Select
                value={autoroleId}
                onChange={(event) => setAutoroleId(event.target.value)}
                disabled={busy || assignableRoles.length === 0}
                aria-label="Выбрать автороль"
              >
                <option value="">Выберите роль</option>
                {assignableRoles
                  .filter((role) => !autoroles.includes(role.id))
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
                onClick={addAutorole}
                disabled={!autoroleId || busy}
                aria-label="Добавить автороль"
              >
                <Plus />
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {autoroles.length > 0 ? (
                autoroles.map((roleId) => (
                  <SettingsChip
                    key={roleId}
                    icon={<Tag className="h-3 w-3 text-muted-foreground" />}
                    onRemove={() => removeAutorole(roleId)}
                    removeLabel={`Убрать ${roleNames.get(roleId) ?? roleId}`}
                    disabled={busy}
                  >
                    {roleNames.get(roleId) ?? roleId}
                  </SettingsChip>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">
                  Авторолей нет — новые участники не получают роли автоматически.
                </p>
              )}
            </div>
          </div>

          <form
            onSubmit={handleLeveling}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-premium/20 bg-premium/10 text-premium">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold">Уровни</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Оповещения о повышении уровня и XP.
                  </p>
                </div>
              </div>
              <Switch
                checked={levelingEnabled}
                onCheckedChange={setLevelingEnabled}
                disabled={busy}
                aria-label="Включить уровни"
              />
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <FieldLabel htmlFor="levelup-channel">Канал уведомлений</FieldLabel>
                <Select
                  id="levelup-channel"
                  value={levelupChannelId}
                  onChange={(event) => setLevelupChannelId(event.target.value)}
                  disabled={busy || textChannels.length === 0}
                >
                  <option value="">Текущий канал</option>
                  {textChannels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      #{channel.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <FieldLabel htmlFor="levelup-message" hint={`${levelupMessage.length}/1000`}>
                  Текст уведомления
                </FieldLabel>
                <Textarea
                  id="levelup-message"
                  value={levelupMessage}
                  onChange={(event) => setLevelupMessage(event.target.value)}
                  maxLength={1000}
                  placeholder="🎉 {user} достиг уровня {level}!"
                  disabled={busy}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <FieldLabel htmlFor="message-xp" hint="0 — без очков">
                    XP за сообщение
                  </FieldLabel>
                  <Input
                    id="message-xp"
                    type="number"
                    min={0}
                    max={100}
                    value={messageXp}
                    onChange={(event) => setMessageXp(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="message-cooldown" hint="0 — за каждое">
                    Пауза, сек
                  </FieldLabel>
                  <Input
                    id="message-cooldown"
                    type="number"
                    min={0}
                    max={3600}
                    value={messageCooldownSec}
                    onChange={(event) => setMessageCooldownSec(event.target.value)}
                    disabled={busy}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="voice-xp" hint="каждые 5 минут">
                    XP за голос
                  </FieldLabel>
                  <Input
                    id="voice-xp"
                    type="number"
                    min={0}
                    max={100}
                    value={voiceXp}
                    onChange={(event) => setVoiceXp(event.target.value)}
                    disabled={busy}
                  />
                </div>
              </div>
              <SwitchRow
                label="Считать время в голосе"
                description="AFK-канал не учитывается, статистика видна в профиле и на обзоре"
                checked={voiceTrackingEnabled}
                onCheckedChange={setVoiceTrackingEnabled}
                disabled={busy}
              />
              <DiscordPreview
                tone="premium"
                title="🎉 Новый уровень!"
                description={levelupPreview}
                fields={[
                  { label: 'Уровень', value: '5' },
                  { label: 'Всего XP', value: '1250' },
                  { label: 'До следующего', value: '350 XP' },
                ]}
                footer="🔖 Уровень 5 · 09.11.2026, 14:32"
              />
            </div>

            <div className="mt-4 flex justify-end border-t border-white/[0.06] pt-3">
              <Button type="submit" variant="secondary" disabled={busy} className="gap-2">
                {savingArea === 'leveling' ? <Spinner /> : <Save />}
                {savingArea === 'leveling' ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Mic}
        title="Временные голосовые каналы"
        description="Комната-хаб, при входе в которую создаётся личный голосовой канал."
      >
        <form onSubmit={handleTempVoice} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <FieldLabel htmlFor="tempvoice-channel" hint="голосовой канал">
              Канал-хаб
            </FieldLabel>
            <Select
              id="tempvoice-channel"
              value={tempVoiceChannelId}
              onChange={(event) => setTempVoiceChannelId(event.target.value)}
              disabled={busy || voiceChannels.length === 0}
            >
              <option value="">Не выбран</option>
              {voiceChannels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  🔊 {channel.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary" disabled={busy} className="gap-2">
            {savingArea === 'tempvoice' ? <Spinner /> : <Save />}
            {savingArea === 'tempvoice' ? 'Сохраняем…' : 'Сохранить'}
          </Button>
        </form>
      </SettingsSection>

      <SettingsSection
        icon={Ticket}
        title="Тикеты"
        description="Категория каналов, роль поддержки и журнал обращений."
        actions={
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            {ticketCategoryId ? 'настроены' : 'не настроены'}
          </span>
        }
      >
        <form onSubmit={handleTickets} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="ticket-category" hint="категория">
                Категория тикетов
              </FieldLabel>
              <Select
                id="ticket-category"
                value={ticketCategoryId}
                onChange={(event) => setTicketCategoryId(event.target.value)}
                disabled={busy || categories.length === 0}
              >
                <option value="">Не выбрана</option>
                {categories.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="ticket-log" hint="текстовый канал">
                Канал логов тикетов
              </FieldLabel>
              <Select
                id="ticket-log"
                value={ticketLogChannelId}
                onChange={(event) => setTicketLogChannelId(event.target.value)}
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
          </div>

          <div>
            <FieldLabel htmlFor="ticket-support" hint="роль">
              Роль поддержки
            </FieldLabel>
            <Select
              id="ticket-support"
              value={ticketSupportRoleId}
              onChange={(event) => setTicketSupportRoleId(event.target.value)}
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

          <SettingsNotice tone="info">
            Панель создания тикетов отправляется командой{' '}
            <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[10px]">/ticket panel</code>.
            Закрыть тикет может автор или участник с правом управления каналами.
          </SettingsNotice>

          <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
            <p className="text-xs text-muted-foreground">
              Категория: {channelNames.get(ticketCategoryId) ?? 'не выбрана'}
            </p>
            <Button type="submit" variant="secondary" disabled={busy} className="gap-2">
              {savingArea === 'tickets' ? <Spinner /> : <Save />}
              {savingArea === 'tickets' ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </div>
        </form>
      </SettingsSection>

      <div className="flex items-center justify-center gap-2 pb-2 text-[11px] uppercase tracking-[0.16em] text-white/40">
        <MessageSquare className="h-3 w-3" />
        сообщество и тикеты
      </div>
    </div>
  );
}
