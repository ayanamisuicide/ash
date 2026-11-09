import { Events, PermissionFlagsBits, type Message } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { getLogChannel, sendLog } from '../lib/logger.js';
import { getModerationSettings, hasImmunity, type AutomodAction } from '../lib/modSettings.js';
import {
  banUser,
  kickUser,
  muteUser,
  timeoutUser,
  warnUser,
  type ActionResult,
} from '../lib/moderation.js';
import { automodResponse } from '../lib/responses.js';

const INVITE_RE = /(?:discord\.(?:gg|io|me|li|link)|discord(?:app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;
const LINK_RE = /https?:\/\/[^\s]+/i;

const MOD_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
];

const DEFAULT_SPAM_WINDOW_MS = 10_000;
const DEFAULT_SPAM_MESSAGE_LIMIT = 8;
const DEFAULT_SPAM_DUPLICATE_LIMIT = 5;
const DEFAULT_PUNISH_DURATION_MS = 10 * 60_000;
const SPAM_MAX_KEYS = 5_000;

const ACTION_LABELS: Record<AutomodAction, string> = {
  delete: 'только удалить сообщение',
  warn: 'варн',
  timeout: 'таймаут',
  mute: 'мут',
  kick: 'кик',
  ban: 'бан',
};

interface SpamHit {
  at: number;
  text: string;
}

export interface SpamOptions {
  windowMs?: number;
  messageLimit?: number;
  duplicateLimit?: number;
}

const spam = new Map<string, SpamHit[]>();

/**
 * Флуд-детектор: считает и общий поток сообщений, и повторы одного текста.
 * Пороги настраиваются, значения по умолчанию сохраняют прежнее поведение.
 */
export function checkSpam(
  guildId: string,
  userId: string,
  content: string,
  options: SpamOptions = {},
): boolean {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const text = content.slice(0, 200);
  const windowMs = options.windowMs ?? DEFAULT_SPAM_WINDOW_MS;
  const messageLimit = options.messageLimit ?? DEFAULT_SPAM_MESSAGE_LIMIT;
  const duplicateLimit = options.duplicateLimit ?? DEFAULT_SPAM_DUPLICATE_LIMIT;

  const hits = (spam.get(key) ?? []).filter((hit) => now - hit.at <= windowMs);
  hits.push({ at: now, text });

  const duplicates = hits.filter((hit) => hit.text === text).length;
  if (hits.length >= messageLimit || duplicates >= duplicateLimit) {
    spam.delete(key);
    return true;
  }

  spam.set(key, hits);
  if (spam.size > SPAM_MAX_KEYS) pruneSpam(now, windowMs);
  return false;
}

function pruneSpam(now: number, windowMs: number): void {
  for (const [key, hits] of spam) {
    if (hits.every((hit) => now - hit.at > windowMs)) spam.delete(key);
  }
  if (spam.size > SPAM_MAX_KEYS) spam.clear();
}

/** Сброс состояния (используется в тестах) */
export function resetSpamState(): void {
  spam.clear();
}

export function capsViolation(content: string, minLength = 10, percent = 70): boolean {
  if (content.length < minLength) return false;
  const letters = content.match(/[A-Za-zА-Яа-яЁё]/g);
  if (!letters || letters.length < Math.min(8, minLength)) return false;
  const upper = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return (upper / letters.length) * 100 >= percent;
}

async function applyPunishment(
  message: Message,
  action: AutomodAction,
  durationMs: number | null,
  reason: string,
): Promise<ActionResult | null> {
  const guild = message.guild;
  const moderatorId = guild?.client.user?.id;
  if (!guild || !moderatorId || action === 'delete') return null;

  const userId = message.author.id;
  switch (action) {
    case 'warn':
      return warnUser(guild, moderatorId, userId, reason);
    case 'timeout':
      return timeoutUser(
        guild,
        moderatorId,
        userId,
        durationMs ?? DEFAULT_PUNISH_DURATION_MS,
        reason,
      );
    case 'mute':
      return muteUser(guild, moderatorId, userId, durationMs ?? DEFAULT_PUNISH_DURATION_MS, reason);
    case 'kick':
      return kickUser(guild, moderatorId, userId, reason);
    case 'ban':
      return banUser(guild, moderatorId, userId, reason);
  }
}

export default {
  name: Events.MessageCreate,

  async execute(message: Message) {
    const guild = message.guild;
    if (!guild) return;
    if (message.author.bot) return;

    const config = getModerationSettings(guild.id).automod;
    if (!config.enabled) return;
    if (message.channelId === getLogChannel(guild)?.id) return;
    if (config.ignoredChannels.includes(message.channelId)) return;

    const member = message.member;
    if (member) {
      if (MOD_PERMS.some((permission) => member.permissions.has(permission))) return;
      if (hasImmunity(guild, member)) return;
      if (config.ignoredRoles.some((roleId) => member.roles.cache.has(roleId))) return;
    }

    const content = message.content?.trim() ?? '';
    if (!content) return;

    let violation: string | null = null;

    if (config.invites && INVITE_RE.test(content)) {
      violation = 'приглашение на другой сервер';
    } else if (config.links && LINK_RE.test(content)) {
      violation = 'ссылка';
    } else if (
      config.words.length > 0 &&
      config.words.some((word) => content.toLowerCase().includes(word.toLowerCase()))
    ) {
      violation = 'запрещённое слово';
    } else if (config.caps && capsViolation(content, config.capsMinLength, config.capsPercent)) {
      violation = 'чрезмерный капс';
    } else if (config.mentions > 0 && message.mentions.users.size > config.mentions) {
      violation = `массовые упоминания (${message.mentions.users.size})`;
    } else if (
      config.spam &&
      checkSpam(guild.id, message.author.id, content, {
        windowMs: config.spamWindowSec * 1_000,
        messageLimit: config.spamCount,
        duplicateLimit: config.spamDuplicateCount,
      })
    ) {
      violation = 'спам';
    }

    if (!violation) return;

    if (config.deleteMessage || config.action === 'delete') {
      await message.delete().catch(() => undefined);
    }

    const reason = `Автомодерация: ${violation}`;
    const result = await applyPunishment(message, config.action, config.durationMs, reason).catch(
      (error: unknown) => {
        console.error('[automod] не удалось применить наказание:', error);
        return null;
      },
    );

    let resultText: string;
    if (config.action === 'delete') {
      resultText = config.deleteMessage ? 'сообщение удалено' : 'нарушение зафиксировано';
    } else if (result?.ok) {
      resultText = result.message;
    } else {
      resultText = result ? `не удалось: ${result.message}` : 'наказание не применено';
    }

    await sendLog(
      guild,
      automodResponse(violation, message.author, reason, {
        action: ACTION_LABELS[config.action],
        channelId: message.channelId,
        result: resultText,
        content,
        severity: config.action === 'delete' ? 'warn' : 'danger',
      }),
      'automodExecution',
    );
  },
} satisfies AnyBotEvent;
