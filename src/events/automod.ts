import { Events, PermissionFlagsBits, type Message } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { COLORS } from '../lib/embeds.js';
import { logCard } from '../lib/logCard.js';
import { getLogChannel, sendLog } from '../lib/logger.js';
import { getModerationSettings } from '../lib/modSettings.js';
import { warnUser } from '../lib/moderation.js';
import { quote, truncate } from '../lib/logging.js';

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

const SPAM_WINDOW_MS = 10_000;
/** Сколько сообщений подряд за окно считается флудом */
const SPAM_MESSAGE_LIMIT = 8;
/** Сколько одинаковых сообщений за окно считается спамом */
const SPAM_DUPLICATE_LIMIT = 5;
const SPAM_MAX_KEYS = 5_000;

interface SpamHit {
  at: number;
  text: string;
}

const spam = new Map<string, SpamHit[]>();

/**
 * Флуд-детектор: считает и общий поток сообщений, и повторы одного текста.
 * Раньше учитывались только полностью идентичные сообщения, поэтому спам
 * разными фразами не ловился вообще.
 */
export function checkSpam(guildId: string, userId: string, content: string): boolean {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const text = content.slice(0, 200);

  const hits = (spam.get(key) ?? []).filter((hit) => now - hit.at <= SPAM_WINDOW_MS);
  hits.push({ at: now, text });

  const duplicates = hits.filter((hit) => hit.text === text).length;
  if (hits.length >= SPAM_MESSAGE_LIMIT || duplicates >= SPAM_DUPLICATE_LIMIT) {
    spam.delete(key);
    return true;
  }

  spam.set(key, hits);
  if (spam.size > SPAM_MAX_KEYS) pruneSpam(now);
  return false;
}

function pruneSpam(now: number): void {
  for (const [key, hits] of spam) {
    if (hits.every((hit) => now - hit.at > SPAM_WINDOW_MS)) spam.delete(key);
  }
  if (spam.size > SPAM_MAX_KEYS) spam.clear();
}

/** Сброс состояния (используется в тестах) */
export function resetSpamState(): void {
  spam.clear();
}

function capsViolation(content: string): boolean {
  if (content.length < 10) return false;
  const letters = content.match(/[A-Za-zА-Яа-яЁё]/g);
  if (!letters || letters.length < 8) return false;
  const upper = letters.filter((letter) => letter === letter.toUpperCase()).length;
  return upper / letters.length > 0.7;
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

    const member = message.member;
    if (member && MOD_PERMS.some((permission) => member.permissions.has(permission))) {
      return;
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
    } else if (config.caps && capsViolation(content)) {
      violation = 'чрезмерный капс';
    } else if (config.mentions > 0 && message.mentions.users.size >= config.mentions) {
      violation = `массовые упоминания (${message.mentions.users.size})`;
    } else if (config.spam && checkSpam(guild.id, message.author.id, content)) {
      violation = 'спам';
    }

    if (!violation) return;

    await message.delete().catch(() => undefined);

    const moderatorId = guild.client.user?.id;
    if (!moderatorId) return;

    const warning = await warnUser(
      guild,
      moderatorId,
      message.author.id,
      `Автомодерация: ${violation}`,
    ).catch(() => null);

    await sendLog(
      guild,
      logCard(guild, {
        title: '🛡️ Автомодерация',
        color: COLORS.danger,
        actor: {
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL(),
        },
        description: quote(truncate(content, 600), 600),
        fields: [
          { name: 'Нарушение', value: violation },
          { name: 'Канал', value: `<#${message.channelId}>`, inline: true },
          { name: 'Участник', value: `${message.author}`, inline: true },
          {
            name: 'Результат',
            value: warning?.ok ? 'сообщение удалено, выдан варн' : 'сообщение удалено',
            inline: true,
          },
        ],
        footer: `ID: ${message.author.id}`,
      }),
      'automodExecution',
    );
  },
} satisfies AnyBotEvent;
