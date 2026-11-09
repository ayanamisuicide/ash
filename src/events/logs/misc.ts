import {
  AuditLogEvent,
  AutoModerationActionType,
  Events,
  GuildScheduledEventStatus,
  type AutoModerationActionExecution,
  type ForumChannel,
  type GuildScheduledEvent,
  type MediaChannel,
  type NewsChannel,
  type PartialGuildScheduledEvent,
  type TextChannel,
  type VoiceChannel,
} from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import {
  fmtRelative,
  fmtUser,
  isLogEventEnabled,
  quote,
  reasonValue,
  sendLog,
  truncate,
} from '../../lib/logging.js';

type WebhookChannel = TextChannel | NewsChannel | VoiceChannel | ForumChannel | MediaChannel;

function eventStatusLabel(status: GuildScheduledEventStatus): string {
  const labels: Record<number, string> = {
    [GuildScheduledEventStatus.Scheduled]: 'запланировано',
    [GuildScheduledEventStatus.Active]: 'идёт',
    [GuildScheduledEventStatus.Completed]: 'завершено',
    [GuildScheduledEventStatus.Canceled]: 'отменено',
  };
  return labels[status] ?? String(status);
}

function automodActionLabel(type: AutoModerationActionType): string {
  const labels: Record<number, string> = {
    [AutoModerationActionType.BlockMessage]: 'сообщение заблокировано',
    [AutoModerationActionType.SendAlertMessage]: 'отправлен алерт',
    [AutoModerationActionType.Timeout]: 'таймаут',
    [AutoModerationActionType.BlockMemberInteraction]: 'взаимодействие заблокировано',
  };
  return labels[type] ?? String(type);
}

function scheduledChanges(
  oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
  newEvent: GuildScheduledEvent,
): string[] {
  if (!oldEvent || oldEvent.partial) return ['**Событие изменено**'];

  const changes: string[] = [];
  if (oldEvent.name !== newEvent.name) {
    changes.push(`**Название:** \`${oldEvent.name}\` → \`${newEvent.name}\``);
  }
  if (
    oldEvent.scheduledStartTimestamp !== newEvent.scheduledStartTimestamp &&
    newEvent.scheduledStartTimestamp
  ) {
    changes.push(`**Начало:** ${fmtRelative(newEvent.scheduledStartTimestamp)}`);
  }
  if (oldEvent.status !== newEvent.status) {
    changes.push(
      `**Статус:** ${eventStatusLabel(oldEvent.status)} → ${eventStatusLabel(newEvent.status)}`,
    );
  }
  if (oldEvent.channelId !== newEvent.channelId) {
    changes.push(
      `**Канал:** ${oldEvent.channelId ? `<#${oldEvent.channelId}>` : '—'} → ${newEvent.channelId ? `<#${newEvent.channelId}>` : '—'}`,
    );
  }
  return changes;
}

const events: AnyBotEvent[] = [
  {
    name: Events.WebhooksUpdate,
    async execute(channel: WebhookChannel) {
      if (!isLogEventEnabled(channel.guild.id, 'webhookUpdate')) return;

      const { executor, reason } = await auditInfo(
        channel.guild,
        AuditLogEvent.WebhookUpdate,
        channel.id,
      );
      const fields = [{ name: 'Канал', value: `<#${channel.id}>`, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(channel.guild, {
        title: '🪝 Вебхуки изменены',
        color: COLORS.primary,
        description: `Изменены вебхуки в канале <#${channel.id}>.`,
        fields,
        footer: `ID: ${channel.id}`,
      });

      await sendLog(channel.guild, embed, 'webhookUpdate');
    },
  },

  {
    name: Events.GuildScheduledEventCreate,
    async execute(event: GuildScheduledEvent) {
      const guild = event.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'scheduledEventCreate')) return;

      const fields = [
        { name: 'Название', value: `\`${event.name}\``, inline: true },
        {
          name: 'Начало',
          value: event.scheduledStartTimestamp ? fmtRelative(event.scheduledStartTimestamp) : '—',
          inline: true,
        },
        { name: 'Канал', value: event.channelId ? `<#${event.channelId}>` : '—', inline: true },
      ];
      if (event.creator) {
        fields.push({ name: 'Создал', value: `${event.creator}`, inline: true });
      }

      const { reason } = await auditInfo(guild, AuditLogEvent.GuildScheduledEventCreate, event.id);
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '📅 Событие создано',
        color: COLORS.success,
        actor: event.creator
          ? { name: event.creator.tag, iconURL: event.creator.displayAvatarURL() }
          : undefined,
        description: event.description ? truncate(event.description, 1000) : undefined,
        fields,
        footer: `ID: ${event.id}`,
      });

      await sendLog(guild, embed, 'scheduledEventCreate');
    },
  },

  {
    name: Events.GuildScheduledEventUpdate,
    async execute(
      oldEvent: GuildScheduledEvent | PartialGuildScheduledEvent | null,
      newEvent: GuildScheduledEvent,
    ) {
      const guild = newEvent.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'scheduledEventUpdate')) return;

      const changes = scheduledChanges(oldEvent, newEvent);
      if (changes.length === 0) return;

      const fields = [{ name: 'Название', value: `\`${newEvent.name}\``, inline: true }];

      const { reason } = await auditInfo(
        guild,
        AuditLogEvent.GuildScheduledEventUpdate,
        newEvent.id,
      );
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '📅 Событие изменено',
        color: COLORS.warn,
        description: changes.join('\n'),
        fields,
        footer: `ID: ${newEvent.id}`,
      });

      await sendLog(guild, embed, 'scheduledEventUpdate');
    },
  },

  {
    name: Events.GuildScheduledEventDelete,
    async execute(event: GuildScheduledEvent | PartialGuildScheduledEvent) {
      const guild = event.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'scheduledEventDelete')) return;

      const { executor, reason } = await auditInfo(
        guild,
        AuditLogEvent.GuildScheduledEventDelete,
        event.id,
      );

      const fields = [{ name: 'Название', value: `\`${event.name}\``, inline: true }];
      fields.push({ name: 'Причина', value: reasonValue(reason), inline: false });

      const embed = logCard(guild, {
        title: '📅 Событие удалено',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${event.id}`,
      });

      await sendLog(guild, embed, 'scheduledEventDelete');
    },
  },

  {
    name: Events.AutoModerationActionExecution,
    async execute(execution: AutoModerationActionExecution) {
      const guild = execution.guild;
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'automodExecution')) return;

      const fields = [
        { name: 'Пользователь', value: `<@${execution.userId}>`, inline: true },
        {
          name: 'Причина',
          value: execution.autoModerationRule?.name ?? `ID ${execution.ruleId}`,
          inline: true,
        },
        {
          name: 'Действие',
          value: automodActionLabel(execution.action.type),
          inline: true,
        },
      ];

      if (execution.channelId) {
        fields.push({ name: 'Канал', value: `<#${execution.channelId}>`, inline: true });
      }
      if (execution.matchedKeyword) {
        fields.push({ name: 'Слово', value: `\`${execution.matchedKeyword}\``, inline: true });
      }

      const embed = logCard(guild, {
        title: '🛡️ Автомодерация сработала',
        color: COLORS.danger,
        actor: execution.user
          ? {
              name: execution.user.tag,
              iconURL: execution.user.displayAvatarURL(),
            }
          : { name: execution.userId },
        description: execution.matchedContent
          ? quote(execution.matchedContent, 800)
          : execution.content
            ? quote(execution.content, 800)
            : undefined,
        fields,
        footer: `ID пользователя: ${execution.userId}`,
      });

      await sendLog(guild, embed, 'automodExecution');
    },
  },
];

export default events;
