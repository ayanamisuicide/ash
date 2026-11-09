import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  Hash,
  ListFilter,
  RotateCcw,
  Search,
  ScrollText,
  XCircle,
} from 'lucide-react';
import { getErrorMessage } from '@/api/client';
import { updateLogSettings } from '@/api/endpoints';
import type {
  GuildMetaChannel,
  LogCategoryKey,
  LogConfig,
  LogEventCatalogEntry,
  LogEventKey,
  LogSettingsUpdate,
  SettingsBundleResponse,
  SettingsCatalog,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import {
  FieldLabel,
  SettingsNotice,
  SettingsSection,
  SwitchRow,
} from '@/components/settings/SettingsSection';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';

interface LogsSettingsProps {
  guildId: string;
  settings: LogConfig;
  catalog: SettingsCatalog;
  channels: GuildMetaChannel[];
}

function applyLogPatch(logs: LogConfig, input: LogSettingsUpdate): LogConfig {
  if (input.reset) {
    const categories = Object.fromEntries(
      Object.keys(logs.categories).map((key) => [key, true]),
    ) as Record<LogCategoryKey, boolean>;
    const events = Object.fromEntries(
      Object.keys(logs.events).map((key) => [key, key !== 'messageCreate']),
    ) as Record<LogEventKey, boolean>;

    return { channelId: logs.channelId, categories, events };
  }

  return {
    channelId: input.channelId !== undefined ? input.channelId : logs.channelId,
    categories: { ...logs.categories, ...input.categories },
    events: { ...logs.events, ...input.events },
  };
}

export function LogsSettings({ guildId, settings, catalog, channels }: LogsSettingsProps) {
  const queryClient = useQueryClient();
  const [eventQuery, setEventQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | LogCategoryKey>('all');

  const settingsKey = ['guild', guildId, 'settings'] as const;

  const mutation = useMutation({
    mutationFn: (input: LogSettingsUpdate) => updateLogSettings(guildId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<SettingsBundleResponse>(settingsKey);
      if (previous) {
        queryClient.setQueryData<SettingsBundleResponse>(settingsKey, {
          ...previous,
          logs: applyLogPatch(previous.logs, input),
        });
      }
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(settingsKey, context.previous);
      toast.error('Не удалось обновить логи', getErrorMessage(error));
    },
    onSuccess: (data, input) => {
      queryClient.setQueryData<SettingsBundleResponse>(settingsKey, (previous) =>
        previous ? { ...previous, logs: data.logs } : previous,
      );
      toast.success(input.reset ? 'Фильтры логов сброшены' : 'Настройки логов обновлены');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKey });
    },
  });

  const busy = mutation.isPending;
  const textChannels = channels.filter((channel) => channel.isText && !channel.isCategory);
  const categoryEntries = Object.entries(catalog.logCategories) as Array<[LogCategoryKey, string]>;
  const eventEntries = Object.entries(catalog.logEvents) as Array<
    [LogEventKey, LogEventCatalogEntry]
  >;
  const categoryOrder = new Map(categoryEntries.map(([key], index) => [key, index]));

  const totalEvents = eventEntries.length;
  const enabledEvents = eventEntries.filter(
    ([key, entry]) => settings.categories[entry.category] && settings.events[key],
  ).length;
  const enabledCategories = categoryEntries.filter(([key]) => settings.categories[key]).length;

  const groupedEvents = useMemo(() => {
    const query = eventQuery.trim().toLowerCase();
    const groups = new Map<LogCategoryKey, Array<[LogEventKey, LogEventCatalogEntry]>>();

    for (const [key, entry] of eventEntries) {
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) continue;
      if (query && !`${entry.label} ${key}`.toLowerCase().includes(query)) continue;

      const list = groups.get(entry.category) ?? [];
      list.push([key, entry]);
      groups.set(entry.category, list);
    }

    return [...groups.entries()].sort(
      ([left], [right]) => (categoryOrder.get(left) ?? 99) - (categoryOrder.get(right) ?? 99),
    );
  }, [categoryFilter, categoryOrder, eventEntries, eventQuery]);

  const setAll = (enabled: boolean) => {
    const categories = Object.fromEntries(categoryEntries.map(([key]) => [key, enabled])) as Record<
      LogCategoryKey,
      boolean
    >;
    const events = Object.fromEntries(
      eventEntries.map(([key]) => [key, enabled && key !== 'messageCreate']),
    ) as Record<LogEventKey, boolean>;
    mutation.mutate({ categories, events });
  };

  return (
    <div className="space-y-4">
      <SettingsSection
        icon={ScrollText}
        title="Канал логов"
        description="Куда бот отправляет события модерации, сообщений и безопасности."
        actions={
          <>
            <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {enabledEvents}/{totalEvents} событий
            </span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-soft">
              {enabledCategories}/{categoryEntries.length} категорий
            </span>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <FieldLabel htmlFor="logs-channel" hint="текстовый канал">
                Канал логов
              </FieldLabel>
              <Select
                id="logs-channel"
                value={settings.channelId ?? ''}
                onChange={(event) => mutation.mutate({ channelId: event.target.value || null })}
                disabled={busy || textChannels.length === 0}
              >
                <option value="">Не выбран — логи отключены</option>
                {textChannels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAll(true)}
                disabled={busy}
                className="gap-2"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Включить все
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAll(false)}
                disabled={busy}
                className="gap-2"
              >
                <XCircle className="h-3.5 w-3.5" />
                Выключить все
              </Button>
            </div>
          </div>

          <SettingsNotice
            tone={settings.channelId ? 'success' : 'warn'}
            title="Как работает фильтр"
          >
            {settings.channelId
              ? 'Событие попадёт в канал, только если включены и его категория, и само событие.'
              : 'Выберите канал — без него бот не отправляет логи, даже если фильтры включены.'}
          </SettingsNotice>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              «Новое сообщение» по умолчанию выключено, чтобы не засорять канал.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => mutation.mutate({ reset: true })}
              disabled={busy}
              className="gap-2"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              Сбросить фильтры
            </Button>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        icon={ListFilter}
        title="Категории"
        description="Групповое включение событий. Отключённая категория скрывает все свои события."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {categoryEntries.map(([key, label]) => {
            const categoryEvents = eventEntries.filter(([, entry]) => entry.category === key);
            const enabledInCategory = settings.categories[key]
              ? categoryEvents.filter(([eventKey]) => settings.events[eventKey]).length
              : 0;

            return (
              <SwitchRow
                key={key}
                label={label}
                description={`${enabledInCategory} из ${categoryEvents.length} событий включено`}
                checked={settings.categories[key]}
                onCheckedChange={(checked) => mutation.mutate({ categories: { [key]: checked } })}
                disabled={busy}
              />
            );
          })}
        </div>
      </SettingsSection>

      <SettingsSection
        icon={Bell}
        title="События"
        description="Точечное управление: оставьте только то, что действительно важно."
        actions={
          <span className="rounded-full border border-white/[0.07] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            найдено: {groupedEvents.reduce((sum, [, items]) => sum + items.length, 0)}
          </span>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={eventQuery}
                onChange={(event) => setEventQuery(event.target.value)}
                placeholder="Поиск события: бан, роль, ветка…"
                className="pl-9"
                aria-label="Поиск события логов"
              />
            </div>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value as 'all' | LogCategoryKey)}
              aria-label="Фильтр по категории"
            >
              <option value="all">Все категории</option>
              {categoryEntries.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          {groupedEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.08] px-4 py-8 text-center">
              <p className="text-xs font-semibold">Ничего не найдено</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Попробуйте другой запрос или сбросьте фильтр категории.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {groupedEvents.map(([category, items]) => (
                <div
                  key={category}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {catalog.logCategories[category]}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        settings.categories[category]
                          ? 'border-success/20 bg-success/10 text-success'
                          : 'border-white/[0.07] bg-white/[0.03] text-muted-foreground',
                      )}
                    >
                      {settings.categories[category] ? 'категория включена' : 'категория выключена'}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map(([key, entry]) => (
                      <SwitchRow
                        key={key}
                        label={entry.label}
                        description={
                          settings.categories[category] ? undefined : 'Категория выключена'
                        }
                        checked={settings.events[key]}
                        onCheckedChange={(checked) =>
                          mutation.mutate({ events: { [key]: checked } })
                        }
                        disabled={busy}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
