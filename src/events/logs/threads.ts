import { AuditLogEvent, Events, type AnyThreadChannel } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';
import { logCard } from '../../lib/logCard.js';
import { fmtUser, isLogEventEnabled, sendLog } from '../../lib/logging.js';

const events: AnyBotEvent[] = [
  {
    name: Events.ThreadCreate,
    async execute(thread: AnyThreadChannel, newlyCreated: boolean) {
      if (!newlyCreated) return;
      if (!isLogEventEnabled(thread.guild.id, 'threadCreate')) return;

      const { executor } = await auditInfo(thread.guild, AuditLogEvent.ThreadCreate, thread.id);

      const fields = [
        { name: 'Ветка', value: `<#${thread.id}>`, inline: true },
        { name: 'Название', value: `\`${thread.name}\``, inline: true },
        {
          name: 'Родительский канал',
          value: thread.parent ? `<#${thread.parent.id}>` : '—',
          inline: true,
        },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(thread.guild, {
        title: '🧵 Ветка создана',
        color: COLORS.success,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${thread.id}`,
      });

      await sendLog(thread.guild, embed, 'threadCreate');
    },
  },

  {
    name: Events.ThreadDelete,
    async execute(thread: AnyThreadChannel) {
      if (!isLogEventEnabled(thread.guild.id, 'threadDelete')) return;
      const { executor } = await auditInfo(thread.guild, AuditLogEvent.ThreadDelete, thread.id);

      const fields = [
        { name: 'Название', value: `\`${thread.name}\``, inline: true },
        { name: 'Родитель', value: thread.parentId ? `<#${thread.parentId}>` : '—', inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(thread.guild, {
        title: '🧵 Ветка удалена',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${thread.id}`,
      });

      await sendLog(thread.guild, embed, 'threadDelete');
    },
  },

  {
    name: Events.ThreadUpdate,
    async execute(oldThread: AnyThreadChannel, newThread: AnyThreadChannel) {
      if (!isLogEventEnabled(newThread.guild.id, 'threadUpdate')) return;
      const changes: string[] = [];

      if (oldThread.name !== newThread.name) {
        changes.push(`**Название:** \`${oldThread.name}\` → \`${newThread.name}\``);
      }
      if (oldThread.archived !== newThread.archived) {
        changes.push(
          `**Архив:** ${oldThread.archived ? 'да' : 'нет'} → ${newThread.archived ? 'да' : 'нет'}`,
        );
      }
      if (oldThread.locked !== newThread.locked) {
        changes.push(
          `**Закрыта:** ${oldThread.locked ? 'да' : 'нет'} → ${newThread.locked ? 'да' : 'нет'}`,
        );
      }
      if (oldThread.rateLimitPerUser !== newThread.rateLimitPerUser) {
        changes.push(
          `**Медленный режим:** ${oldThread.rateLimitPerUser ?? 0}с → ${newThread.rateLimitPerUser ?? 0}с`,
        );
      }
      if (oldThread.autoArchiveDuration !== newThread.autoArchiveDuration) {
        changes.push(
          `**Авто-архив:** ${humanDuration((oldThread.autoArchiveDuration ?? 0) * 60_000)} → ${humanDuration((newThread.autoArchiveDuration ?? 0) * 60_000)}`,
        );
      }

      if (changes.length === 0) return;

      const { executor } = await auditInfo(
        newThread.guild,
        AuditLogEvent.ThreadUpdate,
        newThread.id,
      );

      const fields = [{ name: 'Ветка', value: `<#${newThread.id}>`, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(newThread.guild, {
        title: '✏️ Ветка изменена',
        color: COLORS.warn,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        description: changes.join('\n'),
        fields,
        footer: `ID: ${newThread.id}`,
      });

      await sendLog(newThread.guild, embed, 'threadUpdate');
    },
  },
];

export default events;
