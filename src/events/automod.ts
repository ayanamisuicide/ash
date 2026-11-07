import { Events, PermissionFlagsBits, type Message } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { COLORS } from '../lib/embeds.js';
import { logCard } from '../lib/logCard.js';
import { getLogChannel, sendLog } from '../lib/logger.js';
import { getModerationSettings } from '../lib/modSettings.js';
import { warnUser } from '../lib/moderation.js';
import { quote, truncate } from '../lib/logging.js';

const INVITE_RE =
  /(?:discord\.(?:gg|io|me|li|link)|discord(?:app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;
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
const SPAM_LIMIT = 5;

interface SpamState {
  content: string;
  count: number;
  at: number;
}

const spam = new Map<string, SpamState>();

function checkSpam(guildId: string, userId: string, content: string): boolean {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const previous = spam.get(key);

  if (!previous || previous.content !== content || now - previous.at > SPAM_WINDOW_MS) {
    spam.set(key, { content, count: 1, at: now });
    if (spam.size > 5_000) spam.clear();
    return false;
  }

  previous.count++;
  previous.at = now;
  if (previous.count >= SPAM_LIMIT) {
    spam.delete(key);
    return true;
  }
  return false;
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
    } else if (
      config.mentions > 0 &&
      message.mentions.users.size >= config.mentions
    ) {
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
