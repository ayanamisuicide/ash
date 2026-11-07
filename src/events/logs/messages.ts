import {
  AuditLogEvent,
  Events,
  type Message,
  type MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  type TextBasedChannel,
  type User,
} from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import {
  fmtRelative,
  fmtUser,
  getLogChannel,
  isLogEventEnabled,
  messageLink,
  quote,
  sendLog,
  truncate,
} from '../../lib/logging.js';

async function resolveReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | PartialMessageReaction> {
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message.partial) await reaction.message.fetch().catch(() => null);
  return reaction;
}

const events: AnyBotEvent[] = [
  {
    name: Events.MessageCreate,
    async execute(message: Message) {
      const guild = message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'messageCreate')) return;
      if (message.author.bot) return;
      if (message.channelId === getLogChannel(guild)?.id) return;

      const content = message.content?.trim() ?? '';
      const fields = [
        { name: 'Автор', value: `${message.author}`, inline: true },
        { name: 'Канал', value: `<#${message.channelId}>`, inline: true },
        {
          name: 'Ссылка',
          value: `[Открыть сообщение](${messageLink(guild.id, message.channelId, message.id)})`,
          inline: true,
        },
      ];

      if (message.attachments.size > 0) {
        fields.push({
          name: 'Вложения',
          value: message.attachments
            .map((attachment) => `[${attachment.name}](${attachment.url})`)
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }

      const embed = logCard(guild, {
        title: '💬 Новое сообщение',
        color: COLORS.primary,
        actor: {
          name: message.author.tag,
          iconURL: message.author.displayAvatarURL(),
        },
        description: content ? quote(content, 1800) : '*без текста*',
        fields,
        footer: `ID: ${message.id}`,
      });

      await sendLog(guild, embed, 'messageCreate');
    },
  },

  {
    name: Events.MessageDelete,
    async execute(message: Message | PartialMessage) {
      const guild = message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'messageDelete')) return;

      const author = message.author;
      const content = message.content?.trim() ?? '';
      const { executor } = await auditInfo(guild, AuditLogEvent.MessageDelete, author?.id ?? null);

      const fields = [{ name: 'Канал', value: `<#${message.channelId}>`, inline: true }];
      if (author) {
        fields.push({ name: 'Автор', value: `${author}`, inline: true });
      }
      if (executor && executor.id !== author?.id) {
        fields.push({ name: 'Удалил', value: fmtUser(executor), inline: true });
      }
      if (message.attachments.size > 0) {
        fields.push({ name: 'Вложений', value: String(message.attachments.size), inline: true });
      }

      const embed = logCard(guild, {
        title: '🗑️ Сообщение удалено',
        color: COLORS.danger,
        actor: author
          ? { name: author.tag, iconURL: author.displayAvatarURL() }
          : { name: 'Неизвестный автор' },
        description: content ? quote(content, 1800) : '*содержимое недоступно*',
        fields,
        footer: `ID: ${message.id}`,
        timestamp: message.createdTimestamp || undefined,
      });

      await sendLog(guild, embed, 'messageDelete');
    },
  },

  {
    name: Events.MessageUpdate,
    async execute(oldMessage: Message | PartialMessage, newMessage: Message) {
      const guild = newMessage.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'messageUpdate')) return;
      if (newMessage.author?.bot) return;
      if (newMessage.channelId === getLogChannel(guild)?.id) return;

      const beforeUnknown = oldMessage.partial && oldMessage.content === null;
      const before = oldMessage.content ?? '';
      const after = newMessage.content ?? '';
      if (!beforeUnknown && before === after) return;

      const author = newMessage.author ?? oldMessage.author;
      const embed = logCard(guild, {
        title: '✏️ Сообщение изменено',
        color: COLORS.warn,
        actor: author
          ? { name: author.tag, iconURL: author.displayAvatarURL() }
          : { name: 'Неизвестный автор' },
        description: beforeUnknown
          ? `**Новое содержимое**\n${quote(after, 1000)}`
          : `**Было**\n${quote(before, 800)}\n\n**Стало**\n${quote(after, 800)}`,
        fields: [
          { name: 'Автор', value: author ? `${author}` : 'неизвестен', inline: true },
          { name: 'Канал', value: `<#${newMessage.channelId}>`, inline: true },
        ],
        footer: `ID: ${newMessage.id}`,
      });

      await sendLog(guild, embed, 'messageUpdate');
    },
  },

  {
    name: Events.MessageBulkDelete,
    async execute(
      messages: ReadonlyMap<string, Message<true> | PartialMessage<true>>,
      channel: TextBasedChannel,
    ) {
      if (!('guild' in channel)) return;
      const guild = channel.guild;
      if (!isLogEventEnabled(guild.id, 'messageBulkDelete')) return;

      const preview = [...messages.values()]
        .slice(0, 12)
        .map(
          (message) =>
            `**${message.author?.tag ?? 'неизвестен'}**: ${truncate(message.content ?? '', 70)}`,
        )
        .join('\n');

      const { executor } = await auditInfo(guild, AuditLogEvent.MessageBulkDelete, channel.id);
      const fields = [
        { name: 'Канал', value: `<#${channel.id}>`, inline: true },
        { name: 'Удалено', value: String(messages.size), inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(guild, {
        title: '🧹 Массовое удаление сообщений',
        color: COLORS.danger,
        actor: executor
          ? { name: executor.tag, iconURL: executor.displayAvatarURL() }
          : undefined,
        description: preview || '*содержимое недоступно*',
        fields,
      });

      await sendLog(guild, embed, 'messageBulkDelete');
    },
  },

  {
    name: Events.MessageReactionAdd,
    async execute(
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) {
      const resolved = await resolveReaction(reaction);
      const guild = resolved.message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'reactionAdd')) return;
      const channelId = resolved.message.channelId;
      if (!channelId) return;
      if (user.partial) await user.fetch().catch(() => null);

      const embed = logCard(guild, {
        title: '➕ Реакция добавлена',
        color: COLORS.primary,
        actor: { name: user.tag ?? user.username ?? user.id, iconURL: user.displayAvatarURL() },
        description: `**${resolved.emoji}**`,
        fields: [
          { name: 'Пользователь', value: `<@${user.id}>`, inline: true },
          { name: 'Канал', value: `<#${channelId}>`, inline: true },
          {
            name: 'Сообщение',
            value: `[Открыть](${messageLink(guild.id, channelId, resolved.message.id)})`,
            inline: true,
          },
        ],
      });

      await sendLog(guild, embed, 'reactionAdd');
    },
  },

  {
    name: Events.MessageReactionRemove,
    async execute(
      reaction: MessageReaction | PartialMessageReaction,
      user: User | PartialUser,
    ) {
      const resolved = await resolveReaction(reaction);
      const guild = resolved.message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'reactionRemove')) return;
      const channelId = resolved.message.channelId;
      if (!channelId) return;
      if (user.partial) await user.fetch().catch(() => null);

      const embed = logCard(guild, {
        title: '➖ Реакция убрана',
        color: COLORS.gray,
        actor: { name: user.tag ?? user.username ?? user.id, iconURL: user.displayAvatarURL() },
        description: `**${resolved.emoji}**`,
        fields: [
          { name: 'Пользователь', value: `<@${user.id}>`, inline: true },
          { name: 'Канал', value: `<#${channelId}>`, inline: true },
          {
            name: 'Сообщение',
            value: `[Открыть](${messageLink(guild.id, channelId, resolved.message.id)})`,
            inline: true,
          },
        ],
      });

      await sendLog(guild, embed, 'reactionRemove');
    },
  },

  {
    name: Events.MessageReactionRemoveAll,
    async execute(message: Message | PartialMessage, reactions: ReadonlyMap<string, MessageReaction>) {
      const guild = message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'reactionClear')) return;

      const list = [...reactions.values()]
        .map((reaction) => `${reaction.emoji} ×${reaction.count}`)
        .join('  ');

      const embed = logCard(guild, {
        title: '🧽 Все реакции очищены',
        color: COLORS.gray,
        description: list ? truncate(list, 2000) : '*реакции удалены*',
        fields: [{ name: 'Канал', value: `<#${message.channelId}>`, inline: true }],
      });

      await sendLog(guild, embed, 'reactionClear');
    },
  },

  {
    name: Events.MessageReactionRemoveEmoji,
    async execute(reaction: MessageReaction | PartialMessageReaction) {
      const resolved = await resolveReaction(reaction);
      const guild = resolved.message.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'reactionEmojiClear')) return;
      const channelId = resolved.message.channelId;
      if (!channelId) return;

      const embed = logCard(guild, {
        title: '🧽 Реакции с эмодзи убраны',
        color: COLORS.gray,
        description: `**${resolved.emoji}**`,
        fields: [{ name: 'Канал', value: `<#${channelId}>`, inline: true }],
      });

      await sendLog(guild, embed, 'reactionEmojiClear');
    },
  },

  {
    name: Events.ChannelPinsUpdate,
    async execute(channel: TextBasedChannel, date: Date) {
      if (!('guild' in channel)) return;
      const guild = channel.guild;
      if (!isLogEventEnabled(guild.id, 'pinsUpdate')) return;

      const embed = logCard(guild, {
        title: '📌 Закреплённые сообщения изменены',
        color: COLORS.primary,
        fields: [
          { name: 'Канал', value: `<#${channel.id}>`, inline: true },
          { name: 'Когда', value: fmtRelative(date), inline: true },
        ],
        timestamp: date,
      });

      await sendLog(guild, embed, 'pinsUpdate');
    },
  },
];

export default events;
