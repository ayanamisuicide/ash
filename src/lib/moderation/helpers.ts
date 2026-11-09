import type { ContainerBuilder, Guild, GuildMember, User } from 'discord.js';
import { V2 } from '../card.js';
import { parseDuration } from '../format.js';
import { hasImmunity } from '../modSettings.js';

export const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1_000;
export const MAX_MUTE_MS = 365 * 24 * 60 * 60 * 1_000;
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1_000;
export const MAX_PURGE = 1_000;

export interface ActionResult {
  ok: boolean;
  message: string;
  caseId?: number;
}

export function ok(message: string, caseId?: number): ActionResult {
  return { ok: true, message, caseId };
}

export function fail(message: string): ActionResult {
  return { ok: false, message };
}

export function checkTarget(guild: Guild, member: GuildMember, moderatorId: string): string | null {
  const me = guild.members.me;

  if (member.id === moderatorId) return 'Нельзя применить действие к самому себе.';
  if (member.id === guild.ownerId) return 'Нельзя применить действие к владельцу сервера.';
  if (member.id === guild.client.user?.id) return 'Нельзя применить действие к боту.';
  if (hasImmunity(guild, member)) return 'У участника иммунитет — действие запрещено.';
  if (me && member.roles.highest.position >= me.roles.highest.position) {
    return 'Роль участника не ниже роли бота — поднимите роль бота выше.';
  }
  return null;
}

export function clampDeleteSeconds(value: number): number {
  return Math.max(0, Math.min(Math.floor(value), 604_800));
}

export function durationToMs(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return value > 0 ? Math.floor(value) : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = parseDuration(value);
  return parsed && parsed > 0 ? parsed : null;
}

export async function fetchUser(guild: Guild, userId: string): Promise<User | null> {
  return guild.client.users.fetch(userId).catch(() => null);
}

export async function fetchMember(guild: Guild, userId: string): Promise<GuildMember | null> {
  return guild.members.fetch(userId).catch(() => null);
}

/**
 * Безопасно получает URL аватара. В тестах и при работе с частичными
 * пользователями метод `displayAvatarURL` может отсутствовать.
 */
export function userAvatar(user: User): string | null {
  const fn = (
    user as unknown as {
      displayAvatarURL?: (options?: { size?: number }) => string;
    }
  ).displayAvatarURL;

  return typeof fn === 'function' ? fn.call(user, { size: 128 }) : null;
}

/**
 * Отправляет участнику ЛС: обычный текст или Components V2-карточку.
 * Ошибки доставки не прерывают модерационное действие.
 */
export async function dm(user: User, message: string | ContainerBuilder): Promise<void> {
  const onError = (error: unknown): void => {
    console.warn(`[moderation] не удалось отправить ЛС ${user.id}:`, error);
  };

  if (typeof message === 'string') {
    await user.send({ content: message }).catch(onError);
    return;
  }

  await user.send({ components: [message], flags: V2 }).catch(onError);
}
