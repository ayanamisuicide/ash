import { AuditLogEvent, Events, type DMChannel, type NonThreadGuildBasedChannel } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import { channelTypeLabel, fmtUser, isLogEventEnabled, sendLog } from '../../lib/logging.js';

function channelFields(channel: NonThreadGuildBasedChannel) {
  return [
    { name: 'Канал', value: `<#${channel.id}>`, inline: true },
    { name: 'Название', value: `\`${channel.name}\``, inline: true },
    { name: 'Тип', value: channelTypeLabel(channel.type), inline: true },
    { name: 'Категория', value: channel.parent ? channel.parent.name : '*нет*', inline: true },
  ];
}

const events: AnyBotEvent[] = [
  {
    name: Events.ChannelCreate,
    async execute(channel: NonThreadGuildBasedChannel) {
      if (!isLogEventEnabled(channel.guild.id, 'channelCreate')) return;
      const { executor } = await auditInfo(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
      const fields = channelFields(channel);
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(channel.guild, {
        title: '📁 Канал создан',
        color: COLORS.success,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${channel.id}`,
      });

      await sendLog(channel.guild, embed, 'channelCreate');
    },
  },

  {
    name: Events.ChannelDelete,
    async execute(channel: DMChannel | NonThreadGuildBasedChannel) {
      if (!('guild' in channel)) return;
      if (!isLogEventEnabled(channel.guild.id, 'channelDelete')) return;

      const { executor, reason } = await auditInfo(
        channel.guild,
        AuditLogEvent.ChannelDelete,
        channel.id,
      );

      const fields = channelFields(channel);
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      if (reason) fields.push({ name: 'Причина', value: reason, inline: false });

      const embed = logCard(channel.guild, {
        title: '🗑️ Канал удалён',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${channel.id}`,
      });

      await sendLog(channel.guild, embed, 'channelDelete');
    },
  },

  {
    name: Events.ChannelUpdate,
    async execute(
      oldChannel: DMChannel | NonThreadGuildBasedChannel,
      newChannel: DMChannel | NonThreadGuildBasedChannel,
    ) {
      if (!('guild' in oldChannel) || !('guild' in newChannel)) return;
      const guild = newChannel.guild;
      if (!isLogEventEnabled(guild.id, 'channelUpdate')) return;
      const changes: string[] = [];

      if (oldChannel.name !== newChannel.name) {
        changes.push(`**Название:** \`${oldChannel.name}\` → \`${newChannel.name}\``);
      }
      if (oldChannel.parentId !== newChannel.parentId) {
        changes.push(
          `**Категория:** ${oldChannel.parent?.name ?? '*нет*'} → ${newChannel.parent?.name ?? '*нет*'}`,
        );
      }
      if (oldChannel.position !== newChannel.position) {
        changes.push(`**Позиция:** ${oldChannel.position} → ${newChannel.position}`);
      }
      if ('topic' in oldChannel && 'topic' in newChannel && oldChannel.topic !== newChannel.topic) {
        changes.push(`**Тема:** ${oldChannel.topic ?? '*нет*'} → ${newChannel.topic ?? '*нет*'}`);
      }
      if (
        'rateLimitPerUser' in oldChannel &&
        'rateLimitPerUser' in newChannel &&
        oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser
      ) {
        changes.push(
          `**Медленный режим:** ${oldChannel.rateLimitPerUser ?? 0}с → ${newChannel.rateLimitPerUser ?? 0}с`,
        );
      }
      if ('nsfw' in oldChannel && 'nsfw' in newChannel && oldChannel.nsfw !== newChannel.nsfw) {
        changes.push(
          `**NSFW:** ${oldChannel.nsfw ? 'да' : 'нет'} → ${newChannel.nsfw ? 'да' : 'нет'}`,
        );
      }

      if (changes.length === 0) return;

      const { executor } = await auditInfo(guild, AuditLogEvent.ChannelUpdate, newChannel.id);

      const fields = [{ name: 'Канал', value: `<#${newChannel.id}>`, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(guild, {
        title: '✏️ Канал изменён',
        color: COLORS.warn,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        description: changes.join('\n'),
        fields,
        footer: `ID: ${newChannel.id}`,
      });

      await sendLog(guild, embed, 'channelUpdate');
    },
  },
];

export default events;
