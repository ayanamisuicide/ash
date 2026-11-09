import type {
  CommunitySettings,
  GuildMetaChannel,
  GuildMetaResponse,
  GuildMetaRole,
  GuildSummary,
  LogCategoryKey,
  LogConfig,
  SettingsBundleResponse,
  SettingsCatalog,
} from '@/api/types';

const guildId = 'demo-nightfall';

const textChannel = (id: string, name: string, position: number): GuildMetaChannel => ({
  id,
  name,
  type: 0,
  parentId: null,
  position,
  isText: true,
  isVoice: false,
  isCategory: false,
});

const voiceChannel = (id: string, name: string, position: number): GuildMetaChannel => ({
  id,
  name,
  type: 2,
  parentId: null,
  position,
  isText: false,
  isVoice: true,
  isCategory: false,
});

const category = (id: string, name: string, position: number): GuildMetaChannel => ({
  id,
  name,
  type: 4,
  parentId: null,
  position,
  isText: false,
  isVoice: false,
  isCategory: true,
});

const role = (
  id: string,
  name: string,
  position: number,
  color: number,
  managed = false,
): GuildMetaRole => ({
  id,
  name,
  color,
  position,
  managed,
  isEveryone: false,
});

const channels: GuildMetaChannel[] = [
  textChannel('100000000000000001', 'general', 1),
  textChannel('100000000000000002', 'welcome', 2),
  textChannel('100000000000000003', 'logs', 3),
  textChannel('100000000000000004', 'support', 4),
  category('100000000000000010', 'Информация', 5),
  category('100000000000000011', 'Тикеты', 6),
  voiceChannel('100000000000000020', 'Войс', 7),
  voiceChannel('100000000000000021', 'Создать комнату', 8),
];

const roles: GuildMetaRole[] = [
  role('100000000000000101', 'Администратор', 10, 0xff5f6d),
  role('100000000000000102', 'Модератор', 8, 0x6673ff),
  role('100000000000000103', 'Support', 6, 0x54b8ff),
  role('100000000000000104', 'Muted', 2, 0x8d97ac),
  role('100000000000000105', 'Участник', 1, 0x3dd68c),
  {
    id: '100000000000000100',
    name: '@everyone',
    color: 0,
    position: 0,
    managed: false,
    isEveryone: true,
  },
];

export const DEMO_ROLES = roles;

const event = (categoryKey: LogCategoryKey, label: string) => ({ category: categoryKey, label });

const logEvents = {
  messageDelete: event('messages', 'Удаление сообщения'),
  messageUpdate: event('messages', 'Редактирование сообщения'),
  messageBulkDelete: event('messages', 'Массовое удаление сообщений'),
  memberAdd: event('members', 'Участник зашёл'),
  memberRemove: event('members', 'Участник вышел / кикнут'),
  banAdd: event('members', 'Бан'),
  banRemove: event('members', 'Разбан'),
  warnAdd: event('members', 'Выдано предупреждение'),
  warnRemove: event('members', 'Снято предупреждение'),
  warnEscalation: event('members', 'Автонаказание по варнам'),
  moderationExpire: event('members', 'Истекло временное наказание'),
  noteAdd: event('members', 'Добавлена заметка'),
  noteRemove: event('members', 'Удалена заметка'),
  appealUpdate: event('members', 'Апелляция рассмотрена'),
  channelCreate: event('channels', 'Создание канала'),
  channelDelete: event('channels', 'Удаление канала'),
  channelUpdate: event('channels', 'Изменение канала'),
  roleCreate: event('roles', 'Создание роли'),
  roleDelete: event('roles', 'Удаление роли'),
  roleUpdate: event('roles', 'Изменение роли'),
  voiceStateUpdate: event('voice', 'Голосовое состояние'),
  guildUpdate: event('server', 'Изменение сервера'),
  inviteCreate: event('invites', 'Создание приглашения'),
  inviteDelete: event('invites', 'Удаление приглашения'),
  automodExecution: event('automod', 'Срабатывание автомодерации'),
  raidAlert: event('security', 'Антирейд: тревога'),
  raidAction: event('security', 'Антирейд: действие'),
  nukeAlert: event('security', 'Анти-нак: тревога'),
  nukeAction: event('security', 'Анти-нак: действие'),
} as SettingsCatalog['logEvents'];

const catalog: SettingsCatalog = {
  logCategories: {
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
  },
  logEvents,
};

const logCategories = Object.fromEntries(
  Object.keys(catalog.logCategories).map((key) => [key, key !== 'webhooks']),
) as LogConfig['categories'];

const logEventMap = Object.fromEntries(
  Object.keys(logEvents).map((key) => [key, key !== 'messageUpdate']),
) as LogConfig['events'];

const logs: LogConfig = {
  channelId: '100000000000000003',
  categories: logCategories,
  events: logEventMap,
};

const community: CommunitySettings = {
  welcomeChannelId: '100000000000000002',
  welcomeMessage: 'Добро пожаловать, {user}, на сервер {guild}! Ты {memberCount}-й участник.',
  goodbyeChannelId: '100000000000000002',
  goodbyeMessage: '{user} покинул сервер {guild}. Надеемся увидеться снова!',
  autoroleIds: ['100000000000000105'],
  levelingEnabled: true,
  levelupChannelId: '100000000000000001',
  levelupMessage: '🎉 {user} достиг уровня {level}! Всего XP: {xp}.',
  tempVoiceChannelId: '100000000000000021',
  ticketCategoryId: '100000000000000011',
  ticketLogChannelId: '100000000000000003',
  ticketSupportRoleId: '100000000000000103',
};

const demoSettings: SettingsBundleResponse = {
  ok: true,
  moderation: {
    immunityRoles: ['100000000000000101'],
    reportChannelId: '100000000000000004',
    appealChannelId: '100000000000000004',
    muteRoleId: '100000000000000104',
    warnExpiryDays: 30,
    warnActions: [
      {
        id: 'demo-warn-1',
        count: 3,
        windowDays: 7,
        action: 'timeout',
        durationMs: 60 * 60 * 1_000,
      },
      {
        id: 'demo-warn-2',
        count: 5,
        windowDays: 30,
        action: 'ban',
        durationMs: null,
      },
    ],
    automod: {
      enabled: true,
      invites: true,
      links: false,
      caps: true,
      spam: true,
      words: ['промокод', 'бесплатные нитро'],
      mentions: 5,
      action: 'timeout',
      durationMs: 10 * 60 * 1_000,
      deleteMessage: true,
      capsMinLength: 10,
      capsPercent: 70,
      spamCount: 8,
      spamWindowSec: 10,
      spamDuplicateCount: 5,
      ignoredChannels: ['100000000000000003'],
      ignoredRoles: ['100000000000000102'],
    },
  },
  logs,
  security: {
    raid: {
      enabled: true,
      joinThreshold: 10,
      joinWindowSec: 60,
      accountAgeDays: 7,
      action: 'alert',
      durationSec: 300,
      ignoreBots: true,
    },
    nuke: {
      enabled: true,
      threshold: 3,
      windowSec: 60,
      action: 'timeout',
      ignoreAdmins: true,
    },
  },
  community,
  catalog,
};

export function createDemoMeta(guild: GuildSummary): GuildMetaResponse {
  return {
    ok: true,
    guild: {
      id: guild.id,
      name: guild.name,
      iconUrl: guild.iconUrl,
      memberCount: guild.memberCount,
      ownerId: 'demo-owner',
    },
    access: {
      admin: guild.level === 'admin',
      moderate: true,
      kick: true,
      ban: guild.level === 'admin',
      manageMessages: true,
      manageRoles: true,
    },
    channels,
    roles,
    bot: {
      tag: 'Nexus#0001',
      id: 'demo-bot',
      ping: 42,
      uptime: 98_765,
      guilds: 2,
      nickname: 'Nexus',
    },
  };
}

export function createDemoSettings(_guild: GuildSummary): SettingsBundleResponse {
  return demoSettings;
}

/** Идентификатор демо-сервера нужен только для наглядности данных. */
export const DEMO_SETTINGS_GUILD_ID = guildId;
