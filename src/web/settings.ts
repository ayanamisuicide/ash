import { ChannelType, type Guild, type GuildBasedChannel, type Role } from 'discord.js';
import {
  getCommunitySettings,
  updateCommunitySettings,
  type CommunitySettings,
} from '../lib/community.js';
import { parseDuration } from '../lib/format.js';
import {
  getLogConfig,
  LOG_CATEGORIES,
  LOG_EVENTS,
  setLogCategory,
  setLogChannel,
  setLogEvent,
  resetLogFilters,
  type LogCategory,
  type LogEventKey,
  type LogConfig,
} from '../lib/logSettings.js';
import {
  addAutomodWord,
  addImmunityRole,
  addWarnAction,
  clearImmunityRoles,
  clearWarnActions,
  getModerationSettings,
  getSecuritySettings,
  removeAutomodWord,
  removeWarnAction,
  setAppealChannel,
  setMuteRoleId,
  setReportChannel,
  setWarnExpiry,
  updateAutomod,
  updateNukeConfig,
  updateRaidConfig,
  type AutomodAction,
  type AutomodConfig,
  type ModerationSettings,
  type NukeAction,
  type NukeConfig,
  type RaidAction,
  type RaidConfig,
  type SecuritySettings,
  type WarnActionType,
} from '../lib/modSettings.js';
import { HttpError } from './http.js';

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, `${label} должен быть объектом.`);
  }
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new HttpError(400, `${label} должен быть boolean.`);
  return value;
}

function asInt(value: unknown, label: string, min: number, max: number): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    throw new HttpError(400, `${label} должен быть числом.`);
  }
  const result = Math.floor(number);
  if (result < min || result > max) {
    throw new HttpError(400, `${label}: допустимо от ${min} до ${max}.`);
  }
  return result;
}

function asText(value: unknown, label: string, max = 1_000): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} должен быть строкой.`);
  const text = value.trim();
  if (text.length > max) throw new HttpError(400, `${label} длиннее ${max} символов.`);
  return text;
}

function findChannel(guild: Guild, value: unknown, label: string): GuildBasedChannel | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) {
    throw new HttpError(400, `${label}: некорректный ID канала.`);
  }
  const channel = guild.channels.cache.get(value);
  if (!channel) throw new HttpError(400, `${label}: канал не найден на сервере.`);
  return channel;
}

function textChannelId(guild: Guild, value: unknown, label: string): string | null {
  const channel = findChannel(guild, value, label);
  if (channel && !channel.isTextBased()) {
    throw new HttpError(400, `${label}: нужен текстовый канал.`);
  }
  return channel?.id ?? null;
}

function voiceChannelId(guild: Guild, value: unknown, label: string): string | null {
  const channel = findChannel(guild, value, label);
  if (channel && !channel.isVoiceBased()) {
    throw new HttpError(400, `${label}: нужен голосовой канал.`);
  }
  return channel?.id ?? null;
}

function categoryId(guild: Guild, value: unknown, label: string): string | null {
  const channel = findChannel(guild, value, label);
  if (channel && channel.type !== ChannelType.GuildCategory) {
    throw new HttpError(400, `${label}: нужна категория.`);
  }
  return channel?.id ?? null;
}

function role(guild: Guild, value: unknown, label: string): Role | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{17,20}$/.test(value)) {
    throw new HttpError(400, `${label}: некорректный ID роли.`);
  }
  const found = guild.roles.cache.get(value);
  if (!found) throw new HttpError(400, `${label}: роль не найдена на сервере.`);
  return found;
}

function roleIds(guild: Guild, value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} должен быть массивом.`);
  if (value.length > 50) throw new HttpError(400, `${label}: максимум 50 ролей.`);

  const ids: string[] = [];
  for (const item of value) {
    const found = role(guild, item, label);
    if (!found) continue;
    if (found.id === guild.id) continue;
    if (!ids.includes(found.id)) ids.push(found.id);
  }
  return ids;
}

function channelIds(guild: Guild, value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new HttpError(400, `${label} должен быть массивом.`);
  if (value.length > 50) throw new HttpError(400, `${label}: максимум 50 каналов.`);

  const ids: string[] = [];
  for (const item of value) {
    const found = findChannel(guild, item, label);
    if (found && !ids.includes(found.id)) ids.push(found.id);
  }
  return ids;
}

export interface SettingsBundle {
  moderation: ModerationSettings;
  logs: LogConfig;
  security: SecuritySettings;
  community: CommunitySettings;
  catalog: {
    logCategories: typeof LOG_CATEGORIES;
    logEvents: typeof LOG_EVENTS;
  };
}

export function getSettingsBundle(guild: Guild): SettingsBundle {
  return {
    moderation: getModerationSettings(guild.id),
    logs: getLogConfig(guild.id),
    security: getSecuritySettings(guild.id),
    community: getCommunitySettings(guild.id),
    catalog: {
      logCategories: LOG_CATEGORIES,
      logEvents: LOG_EVENTS,
    },
  };
}

const AUTOMOD_BOOLEAN_KEYS = [
  'enabled',
  'invites',
  'links',
  'caps',
  'spam',
  'deleteMessage',
] as const;
const AUTOMOD_ACTIONS: AutomodAction[] = ['delete', 'warn', 'timeout', 'mute', 'kick', 'ban'];

export function updateModerationSettings(
  guild: Guild,
  body: Record<string, unknown>,
): ModerationSettings {
  if (body.automod !== undefined) {
    const automod = asObject(body.automod, 'automod');
    const patch: Partial<AutomodConfig> = {};

    for (const key of AUTOMOD_BOOLEAN_KEYS) {
      if (automod[key] !== undefined) patch[key] = asBoolean(automod[key], `automod.${key}`);
    }
    if (automod.mentions !== undefined) {
      patch.mentions = asInt(automod.mentions, 'automod.mentions', 0, 100);
    }
    if (automod.words !== undefined) {
      if (!Array.isArray(automod.words)) {
        throw new HttpError(400, 'automod.words должен быть массивом.');
      }
      patch.words = automod.words
        .map((word) => asText(word, 'Слово', 100))
        .filter(Boolean)
        .slice(0, 200);
    }
    if (automod.action !== undefined) {
      if (
        typeof automod.action !== 'string' ||
        !AUTOMOD_ACTIONS.includes(automod.action as AutomodAction)
      ) {
        throw new HttpError(400, 'automod.action: неверное действие.');
      }
      patch.action = automod.action as AutomodAction;
    }
    if (automod.duration !== undefined) {
      if (automod.duration === null || automod.duration === '') {
        patch.durationMs = null;
      } else {
        if (typeof automod.duration !== 'string') {
          throw new HttpError(400, 'automod.duration: неверный формат длительности.');
        }
        const durationMs = parseDuration(automod.duration);
        if (!durationMs) {
          throw new HttpError(400, 'automod.duration: неверный формат длительности.');
        }
        if (durationMs > 365 * 86_400_000) {
          throw new HttpError(400, 'automod.duration: максимум 365 дней.');
        }
        patch.durationMs = durationMs;
      }
    }
    if (automod.capsPercent !== undefined) {
      patch.capsPercent = asInt(automod.capsPercent, 'automod.capsPercent', 10, 100);
    }
    if (automod.capsMinLength !== undefined) {
      patch.capsMinLength = asInt(automod.capsMinLength, 'automod.capsMinLength', 1, 2_000);
    }
    if (automod.spamCount !== undefined) {
      patch.spamCount = asInt(automod.spamCount, 'automod.spamCount', 2, 100);
    }
    if (automod.spamWindowSec !== undefined) {
      patch.spamWindowSec = asInt(automod.spamWindowSec, 'automod.spamWindowSec', 1, 300);
    }
    if (automod.spamDuplicateCount !== undefined) {
      patch.spamDuplicateCount = asInt(
        automod.spamDuplicateCount,
        'automod.spamDuplicateCount',
        2,
        100,
      );
    }
    if (automod.ignoredChannels !== undefined) {
      patch.ignoredChannels = channelIds(guild, automod.ignoredChannels, 'automod.ignoredChannels');
    }
    if (automod.ignoredRoles !== undefined) {
      patch.ignoredRoles = roleIds(guild, automod.ignoredRoles, 'automod.ignoredRoles');
    }

    const effectiveAction = patch.action ?? getModerationSettings(guild.id).automod.action;
    if (effectiveAction === 'timeout' && patch.durationMs && patch.durationMs > 28 * 86_400_000) {
      throw new HttpError(400, 'Для таймаута максимальная длительность — 28 дней.');
    }
    if (effectiveAction === 'mute' && patch.durationMs && patch.durationMs > 365 * 86_400_000) {
      throw new HttpError(400, 'Для мута максимальная длительность — 365 дней.');
    }

    if (Object.keys(patch).length > 0) updateAutomod(guild.id, patch);
  }

  if (body.warnExpiryDays !== undefined) {
    setWarnExpiry(guild.id, asInt(body.warnExpiryDays, 'Срок варнов', 0, 365));
  }
  if (body.reportChannelId !== undefined) {
    setReportChannel(guild.id, textChannelId(guild, body.reportChannelId, 'Канал жалоб'));
  }
  if (body.appealChannelId !== undefined) {
    setAppealChannel(guild.id, textChannelId(guild, body.appealChannelId, 'Канал апелляций'));
  }
  if (body.muteRoleId !== undefined) {
    setMuteRoleId(guild.id, role(guild, body.muteRoleId, 'Роль мута')?.id ?? null);
  }
  if (body.immunityRoles !== undefined) {
    const ids = roleIds(guild, body.immunityRoles, 'Иммунитет');
    clearImmunityRoles(guild.id);
    for (const id of ids) addImmunityRole(guild.id, id);
  }

  return getModerationSettings(guild.id);
}

const WARN_ACTIONS: WarnActionType[] = ['timeout', 'mute', 'kick', 'ban', 'tempban'];

export function addWarnActionFromPanel(
  guild: Guild,
  body: Record<string, unknown>,
): ModerationSettings {
  const action = body.action;
  if (typeof action !== 'string' || !WARN_ACTIONS.includes(action as WarnActionType)) {
    throw new HttpError(400, 'Неверное действие автонаказания.');
  }

  const count = asInt(body.count, 'Количество варнов', 1, 100);
  const windowDays = asInt(body.windowDays, 'Окно в днях', 1, 365);
  const needsDuration = action === 'timeout' || action === 'mute' || action === 'tempban';

  let durationMs: number | null = null;
  if (body.duration !== undefined && body.duration !== null && body.duration !== '') {
    if (typeof body.duration !== 'string') {
      throw new HttpError(400, 'Неверный формат длительности.');
    }
    durationMs = parseDuration(body.duration);
    if (!durationMs) throw new HttpError(400, 'Неверный формат длительности.');
  }

  if (needsDuration && !durationMs) {
    throw new HttpError(400, 'Для таймаута, мута и временного бана укажите длительность.');
  }
  if (action === 'timeout' && durationMs && durationMs > 28 * 86_400_000) {
    throw new HttpError(400, 'Максимальный таймаут — 28 дней.');
  }
  if (action === 'mute' && durationMs && durationMs > 365 * 86_400_000) {
    throw new HttpError(400, 'Максимальный мут — 365 дней.');
  }

  addWarnAction(guild.id, {
    count,
    windowDays,
    action: action as WarnActionType,
    durationMs: needsDuration ? durationMs : null,
  });
  return getModerationSettings(guild.id);
}

export function removeWarnActionFromPanel(guildId: string, id: string): ModerationSettings {
  if (!removeWarnAction(guildId, id)) throw new HttpError(404, 'Правило не найдено.');
  return getModerationSettings(guildId);
}

export function clearWarnActionsFromPanel(guildId: string): ModerationSettings {
  clearWarnActions(guildId);
  return getModerationSettings(guildId);
}

export function addAutomodWordFromPanel(
  guild: Guild,
  body: Record<string, unknown>,
): ModerationSettings {
  const word = asText(body.word, 'Слово', 100);
  if (!word) throw new HttpError(400, 'Укажите слово.');
  if (!addAutomodWord(guild.id, word)) throw new HttpError(409, 'Такое слово уже есть.');
  return getModerationSettings(guild.id);
}

export function removeAutomodWordFromPanel(guild: Guild, word: string): ModerationSettings {
  if (!removeAutomodWord(guild.id, word)) throw new HttpError(404, 'Слово не найдено.');
  return getModerationSettings(guild.id);
}

export function updateLogSettings(guild: Guild, body: Record<string, unknown>): LogConfig {
  if (body.reset === true) {
    resetLogFilters(guild.id);
  }

  if (body.channelId !== undefined) {
    setLogChannel(guild.id, textChannelId(guild, body.channelId, 'Канал логов'));
  }

  if (body.categories !== undefined) {
    const categories = asObject(body.categories, 'categories');
    for (const [key, value] of Object.entries(categories)) {
      if (!(key in LOG_CATEGORIES)) throw new HttpError(400, `Неизвестная категория логов: ${key}`);
      setLogCategory(guild.id, key as LogCategory, asBoolean(value, `categories.${key}`));
    }
  }

  if (body.events !== undefined) {
    const events = asObject(body.events, 'events');
    for (const [key, value] of Object.entries(events)) {
      if (!(key in LOG_EVENTS)) throw new HttpError(400, `Неизвестное событие логов: ${key}`);
      setLogEvent(guild.id, key as LogEventKey, asBoolean(value, `events.${key}`));
    }
  }

  return getLogConfig(guild.id);
}

const RAID_ACTIONS: RaidAction[] = ['alert', 'kick', 'ban'];
const NUKE_ACTIONS: NukeAction[] = ['alert', 'timeout', 'kick', 'ban'];

export function updateSecuritySettings(
  guild: Guild,
  body: Record<string, unknown>,
): SecuritySettings {
  if (body.raid !== undefined) {
    const raw = asObject(body.raid, 'raid');
    const patch: Partial<RaidConfig> = {};

    if (raw.enabled !== undefined) patch.enabled = asBoolean(raw.enabled, 'raid.enabled');
    if (raw.joinThreshold !== undefined) {
      patch.joinThreshold = asInt(raw.joinThreshold, 'raid.joinThreshold', 1, 1_000);
    }
    if (raw.joinWindowSec !== undefined) {
      patch.joinWindowSec = asInt(raw.joinWindowSec, 'raid.joinWindowSec', 5, 3_600);
    }
    if (raw.accountAgeDays !== undefined) {
      patch.accountAgeDays = asInt(raw.accountAgeDays, 'raid.accountAgeDays', 0, 365);
    }
    if (raw.action !== undefined) {
      if (typeof raw.action !== 'string' || !RAID_ACTIONS.includes(raw.action as RaidAction)) {
        throw new HttpError(400, 'Неверное действие антирейда.');
      }
      patch.action = raw.action as RaidAction;
    }
    if (raw.durationSec !== undefined) {
      patch.durationSec = asInt(raw.durationSec, 'raid.durationSec', 30, 86_400);
    }
    if (raw.ignoreBots !== undefined) {
      patch.ignoreBots = asBoolean(raw.ignoreBots, 'raid.ignoreBots');
    }

    if (Object.keys(patch).length > 0) updateRaidConfig(guild.id, patch);
  }

  if (body.nuke !== undefined) {
    const raw = asObject(body.nuke, 'nuke');
    const patch: Partial<NukeConfig> = {};

    if (raw.enabled !== undefined) patch.enabled = asBoolean(raw.enabled, 'nuke.enabled');
    if (raw.threshold !== undefined) {
      patch.threshold = asInt(raw.threshold, 'nuke.threshold', 1, 100);
    }
    if (raw.windowSec !== undefined) {
      patch.windowSec = asInt(raw.windowSec, 'nuke.windowSec', 5, 3_600);
    }
    if (raw.action !== undefined) {
      if (typeof raw.action !== 'string' || !NUKE_ACTIONS.includes(raw.action as NukeAction)) {
        throw new HttpError(400, 'Неверное действие анти-нака.');
      }
      patch.action = raw.action as NukeAction;
    }
    if (raw.ignoreAdmins !== undefined) {
      patch.ignoreAdmins = asBoolean(raw.ignoreAdmins, 'nuke.ignoreAdmins');
    }

    if (Object.keys(patch).length > 0) updateNukeConfig(guild.id, patch);
  }

  return getSecuritySettings(guild.id);
}

export function updateCommunityFromPanel(
  guild: Guild,
  body: Record<string, unknown>,
): CommunitySettings {
  const patch: Partial<CommunitySettings> = {};

  if (body.welcomeChannelId !== undefined) {
    patch.welcomeChannelId = textChannelId(guild, body.welcomeChannelId, 'Канал приветствий');
  }
  if (body.welcomeMessage !== undefined) {
    patch.welcomeMessage = asText(body.welcomeMessage, 'Приветствие', 1_000);
  }
  if (body.goodbyeChannelId !== undefined) {
    patch.goodbyeChannelId = textChannelId(guild, body.goodbyeChannelId, 'Канал прощаний');
  }
  if (body.goodbyeMessage !== undefined) {
    patch.goodbyeMessage = asText(body.goodbyeMessage, 'Прощание', 1_000);
  }
  if (body.autoroleIds !== undefined) {
    patch.autoroleIds = roleIds(guild, body.autoroleIds, 'Автороли');
  }
  if (body.levelingEnabled !== undefined) {
    patch.levelingEnabled = asBoolean(body.levelingEnabled, 'levelingEnabled');
  }
  if (body.levelupChannelId !== undefined) {
    patch.levelupChannelId = textChannelId(guild, body.levelupChannelId, 'Канал уровней');
  }
  if (body.levelupMessage !== undefined) {
    patch.levelupMessage = asText(body.levelupMessage, 'Сообщение об уровне', 1_000);
  }
  if (body.messageXp !== undefined) {
    patch.messageXp = asInt(body.messageXp, 'XP за сообщение', 0, 100);
  }
  if (body.messageCooldownSec !== undefined) {
    patch.messageCooldownSec = asInt(body.messageCooldownSec, 'Пауза за сообщения', 0, 3_600);
  }
  if (body.voiceXp !== undefined) {
    patch.voiceXp = asInt(body.voiceXp, 'XP за голос', 0, 100);
  }
  if (body.voiceTrackingEnabled !== undefined) {
    patch.voiceTrackingEnabled = asBoolean(body.voiceTrackingEnabled, 'voiceTrackingEnabled');
  }
  if (body.tempVoiceChannelId !== undefined) {
    patch.tempVoiceChannelId = voiceChannelId(
      guild,
      body.tempVoiceChannelId,
      'Канал временных голосовых',
    );
  }
  if (body.ticketCategoryId !== undefined) {
    patch.ticketCategoryId = categoryId(guild, body.ticketCategoryId, 'Категория тикетов');
  }
  if (body.ticketLogChannelId !== undefined) {
    patch.ticketLogChannelId = textChannelId(guild, body.ticketLogChannelId, 'Канал логов тикетов');
  }
  if (body.ticketSupportRoleId !== undefined) {
    patch.ticketSupportRoleId = role(guild, body.ticketSupportRoleId, 'Роль поддержки')?.id ?? null;
  }

  return updateCommunitySettings(guild.id, patch);
}
