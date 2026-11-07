import { db, ensureGuild, parseJson, toJson } from '../storage/sqlite.js';

/** Категории логов: удобно включать/выключать группами */
export const LOG_CATEGORIES = {
  messages: 'Сообщения',
  members: 'Участники',
  channels: 'Каналы',
  roles: 'Роли',
  threads: 'Ветки',
  voice: 'Голосовые каналы',
  server: 'Сервер',
  invites: 'Приглашения',
  expressions: 'Эмодзи и стикеры',
  events: 'События сервера',
  automod: 'Автомодерация',
  webhooks: 'Вебхуки',
  security: 'Безопасность',
} as const;

export type LogCategory = keyof typeof LOG_CATEGORIES;

/** Все события, которые можно логировать по отдельности */
export const LOG_EVENTS = {
  // messages
  messageCreate: { category: 'messages', label: 'Новое сообщение (может быть спамом!)' },
  messageDelete: { category: 'messages', label: 'Удаление сообщения' },
  messageUpdate: { category: 'messages', label: 'Редактирование сообщения' },
  messageBulkDelete: { category: 'messages', label: 'Массовое удаление сообщений' },
  reactionAdd: { category: 'messages', label: 'Добавлена реакция' },
  reactionRemove: { category: 'messages', label: 'Убрана реакция' },
  reactionClear: { category: 'messages', label: 'Очищены все реакции' },
  reactionEmojiClear: { category: 'messages', label: 'Убраны реакции с эмодзи' },
  pinsUpdate: { category: 'messages', label: 'Закрепление / открепление' },

  // members
  memberAdd: { category: 'members', label: 'Участник зашёл' },
  memberRemove: { category: 'members', label: 'Участник вышел / кикнут' },
  memberUpdate: { category: 'members', label: 'Изменение участника' },
  banAdd: { category: 'members', label: 'Бан' },
  banRemove: { category: 'members', label: 'Разбан' },
  warnAdd: { category: 'members', label: 'Выдано предупреждение' },
  warnRemove: { category: 'members', label: 'Снято предупреждение' },
  warnEscalation: { category: 'members', label: 'Автонаказание по варнам' },
  moderationExpire: { category: 'members', label: 'Истекло временное наказание' },
  noteAdd: { category: 'members', label: 'Добавлена заметка' },
  noteRemove: { category: 'members', label: 'Удалена заметка' },
  appealUpdate: { category: 'members', label: 'Апелляция рассмотрена' },

  // channels
  channelCreate: { category: 'channels', label: 'Создание канала' },
  channelDelete: { category: 'channels', label: 'Удаление канала' },
  channelUpdate: { category: 'channels', label: 'Изменение канала' },

  // roles
  roleCreate: { category: 'roles', label: 'Создание роли' },
  roleDelete: { category: 'roles', label: 'Удаление роли' },
  roleUpdate: { category: 'roles', label: 'Изменение роли' },

  // threads
  threadCreate: { category: 'threads', label: 'Создание ветки' },
  threadDelete: { category: 'threads', label: 'Удаление ветки' },
  threadUpdate: { category: 'threads', label: 'Изменение ветки' },

  // voice
  voiceStateUpdate: { category: 'voice', label: 'Голосовое состояние' },

  // server
  guildUpdate: { category: 'server', label: 'Изменение сервера' },
  scheduledEventCreate: { category: 'events', label: 'Создание события' },
  scheduledEventUpdate: { category: 'events', label: 'Изменение события' },
  scheduledEventDelete: { category: 'events', label: 'Удаление события' },

  // invites
  inviteCreate: { category: 'invites', label: 'Создание приглашения' },
  inviteDelete: { category: 'invites', label: 'Удаление приглашения' },

  // expressions
  emojiCreate: { category: 'expressions', label: 'Добавлен эмодзи' },
  emojiDelete: { category: 'expressions', label: 'Удалён эмодзи' },
  emojiUpdate: { category: 'expressions', label: 'Изменён эмодзи' },
  stickerCreate: { category: 'expressions', label: 'Добавлен стикер' },
  stickerDelete: { category: 'expressions', label: 'Удалён стикер' },
  stickerUpdate: { category: 'expressions', label: 'Изменён стикер' },

  // automod
  automodExecution: { category: 'automod', label: 'Срабатывание автомодерации' },

  // webhooks
  webhookUpdate: { category: 'webhooks', label: 'Изменение вебхуков в канале' },

  // security
  raidAlert: { category: 'security', label: 'Антирейд: тревога' },
  raidAction: { category: 'security', label: 'Антирейд: действие' },
  nukeAlert: { category: 'security', label: 'Анти-нак: тревога' },
  nukeAction: { category: 'security', label: 'Анти-нак: действие' },
} as const;

export type LogEventKey = keyof typeof LOG_EVENTS;

export type LogCategoryMap = Record<LogCategory, boolean>;
export type LogEventMap = Record<LogEventKey, boolean>;

export interface LogConfig {
  channelId: string | null;
  categories: LogCategoryMap;
  events: LogEventMap;
}

interface StoredLogConfig {
  channelId?: string | null;
  categories?: Partial<LogCategoryMap>;
  events?: Partial<LogEventMap>;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

const LOG_CACHE_TTL_MS = (() => {
  const raw = Number(process.env.SETTINGS_CACHE_TTL_MS ?? 5_000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5_000;
})();

const logConfigCache = new Map<string, CacheEntry<LogConfig>>();

function invalidateLogCache(guildId: string): void {
  logConfigCache.delete(guildId);
}

function defaults(): { categories: LogCategoryMap; events: LogEventMap } {
  const categories = Object.fromEntries(
    Object.keys(LOG_CATEGORIES).map((key) => [key, true]),
  ) as LogCategoryMap;

  const events = Object.fromEntries(
    Object.keys(LOG_EVENTS).map((key) => [key, key !== 'messageCreate']),
  ) as LogEventMap;

  return { categories, events };
}

export function getLogChannelId(guildId: string): string | null {
  return getLogConfig(guildId).channelId;
}

function read(guildId: string): StoredLogConfig {
  const row = db
    .prepare('SELECT categories, events, channel_id FROM guild_logs WHERE guild_id = ?')
    .get(guildId) as { categories: string; events: string; channel_id: string | null } | undefined;

  if (!row) return {};
  return {
    channelId: row.channel_id,
    categories: parseJson(row.categories, {}),
    events: parseJson(row.events, {}),
  };
}

/** Полная конфигурация с учётом значений по умолчанию (всё включено) */
export function getLogConfig(guildId: string): LogConfig {
  if (LOG_CACHE_TTL_MS > 0) {
    const cached = logConfigCache.get(guildId);
    if (cached && Date.now() - cached.at <= LOG_CACHE_TTL_MS) {
      return cached.value;
    }
  }

  const stored = read(guildId);
  const base = defaults();

  const result: LogConfig = {
    channelId: stored.channelId ?? null,
    categories: { ...base.categories, ...stored.categories },
    events: { ...base.events, ...stored.events },
  };

  if (LOG_CACHE_TTL_MS > 0) {
    logConfigCache.set(guildId, { at: Date.now(), value: result });
  }

  return result;
}

export function setLogChannel(guildId: string, channelId: string | null): void {
  ensureGuild(guildId);
  db.prepare(
    `
    INSERT INTO guild_logs (guild_id, channel_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id
  `,
  ).run(guildId, channelId);
  invalidateLogCache(guildId);
}

export function setLogCategory(guildId: string, category: LogCategory, enabled: boolean): void {
  ensureGuild(guildId);
  const categories = { ...(read(guildId).categories ?? {}), [category]: enabled };
  db.prepare(
    `
    INSERT INTO guild_logs (guild_id, categories) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET categories = excluded.categories
  `,
  ).run(guildId, toJson(categories));
  invalidateLogCache(guildId);
}

export function setLogEvent(guildId: string, event: LogEventKey, enabled: boolean): void {
  ensureGuild(guildId);
  const events = { ...(read(guildId).events ?? {}), [event]: enabled };
  db.prepare(
    `
    INSERT INTO guild_logs (guild_id, events) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET events = excluded.events
  `,
  ).run(guildId, toJson(events));
  invalidateLogCache(guildId);
}

/** Сбрасывает все фильтры к значениям по умолчанию (канал остаётся) */
export function resetLogFilters(guildId: string): void {
  ensureGuild(guildId);
  db.prepare(
    `
    INSERT INTO guild_logs (guild_id, categories, events) VALUES (?, '{}', '{}')
    ON CONFLICT(guild_id) DO UPDATE SET categories = '{}', events = '{}'
  `,
  ).run(guildId);
  invalidateLogCache(guildId);
}

/** Включает/выключает сразу все категории и события */
export function setAllLogs(guildId: string, enabled: boolean): void {
  for (const category of Object.keys(LOG_CATEGORIES) as LogCategory[]) {
    setLogCategory(guildId, category, enabled);
  }
  for (const event of Object.keys(LOG_EVENTS) as LogEventKey[]) {
    setLogEvent(guildId, event, enabled);
  }
}

/** Проверка: нужно ли отправлять конкретное событие в лог */
export function isLogEventEnabled(guildId: string, event: LogEventKey): boolean {
  const config = getLogConfig(guildId);
  if (!config.channelId) return false;

  const category = LOG_EVENTS[event].category as LogCategory;
  return config.categories[category] && config.events[event];
}
