import { PermissionFlagsBits, type Guild, type GuildMember } from 'discord.js';
import type { BotClient } from '../core/client.js';
import { guildIconUrl } from './discord.js';
import { HttpError } from './http.js';

export interface GuildAccess {
  guild: Guild;
  member: GuildMember;
  /** Управление сервером / администратор — доступ к настройкам */
  admin: boolean;
  /** Любые модераторские права — доступ к панели этого сервера */
  moderator: boolean;
  /** Право «Заглушать участников»: варны, таймауты, заметки */
  moderate: boolean;
  /** Право «Управлять сообщениями» */
  manageMessages: boolean;
  kick: boolean;
  ban: boolean;
}

export interface GuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  level: 'admin' | 'moderator';
}

interface CacheEntry {
  at: number;
  value: GuildAccess;
}

const ACCESS_CACHE_TTL_MS = 15_000;
const accessCache = new Map<string, CacheEntry>();

const SNOWFLAKE = /^\d{17,20}$/;

export function isSnowflake(value: unknown): value is string {
  return typeof value === 'string' && SNOWFLAKE.test(value);
}

function computeAccess(guild: Guild, member: GuildMember): GuildAccess {
  const permissions = member.permissions;
  const admin =
    permissions.has(PermissionFlagsBits.Administrator) ||
    permissions.has(PermissionFlagsBits.ManageGuild);
  const kick = permissions.has(PermissionFlagsBits.KickMembers);
  const ban = permissions.has(PermissionFlagsBits.BanMembers);
  const moderate = permissions.has(PermissionFlagsBits.ModerateMembers);
  const manageMessages = permissions.has(PermissionFlagsBits.ManageMessages);
  const moderator = admin || kick || ban || moderate || manageMessages;

  return {
    guild,
    member,
    admin,
    moderator,
    moderate,
    manageMessages,
    kick,
    ban,
  };
}

function cacheKey(userId: string, guildId: string): string {
  return `${userId}:${guildId}`;
}

export function invalidateAccessCache(userId?: string, guildId?: string): void {
  if (!userId && !guildId) {
    accessCache.clear();
    return;
  }
  for (const key of accessCache.keys()) {
    const [cachedUser, cachedGuild] = key.split(':');
    if (userId && cachedUser !== userId) continue;
    if (guildId && cachedGuild !== guildId) continue;
    accessCache.delete(key);
  }
}

/** Убирает протухшие записи кэша прав, чтобы он не рос бесконечно */
export function pruneAccessCache(): void {
  const now = Date.now();
  for (const [key, entry] of accessCache) {
    if (now - entry.at >= ACCESS_CACHE_TTL_MS) accessCache.delete(key);
  }
}

/**
 * Проверяет, что пользователь состоит в сервере и имеет модераторские права.
 * Права считаются по актуальным ролям участника, а не по данным OAuth.
 */
export async function resolveGuildAccess(
  client: BotClient,
  userId: string,
  guildId: string,
): Promise<GuildAccess> {
  if (!isSnowflake(userId) || !isSnowflake(guildId)) {
    throw new HttpError(400, 'Некорректный идентификатор.');
  }

  const key = cacheKey(userId, guildId);
  const cached = accessCache.get(key);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_TTL_MS) {
    return cached.value;
  }

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new HttpError(404, 'Бот не находится на этом сервере.');

  const member =
    guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
  if (!member) throw new HttpError(403, 'Вы не состоите на этом сервере.');

  const access = computeAccess(guild, member);
  if (!access.moderator) {
    throw new HttpError(403, 'Недостаточно прав для доступа к панели этого сервера.');
  }

  accessCache.set(key, { at: Date.now(), value: access });
  return access;
}

/** Список серверов, где пользователь может пользоваться панелью */
export async function listAccessibleGuilds(
  client: BotClient,
  userId: string,
): Promise<GuildSummary[]> {
  const guilds = [...client.guilds.cache.values()];
  const results = await Promise.all(
    guilds.map(async (guild): Promise<GuildSummary | null> => {
      const member =
        guild.members.cache.get(userId) ?? (await guild.members.fetch(userId).catch(() => null));
      if (!member) return null;

      const access = computeAccess(guild, member);
      if (!access.moderator) return null;

      accessCache.set(cacheKey(userId, guild.id), { at: Date.now(), value: access });

      return {
        id: guild.id,
        name: guild.name,
        iconUrl: guildIconUrl(guild.id, guild.icon, 64),
        memberCount: guild.memberCount,
        level: access.admin ? 'admin' : 'moderator',
      };
    }),
  );

  return results
    .filter((item): item is GuildSummary => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export function requireAdmin(access: GuildAccess): void {
  if (!access.admin) {
    throw new HttpError(403, 'Нужно право «Управление сервером».');
  }
}
