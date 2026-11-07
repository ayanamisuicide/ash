import { AuditLogEvent, Events, PermissionsBitField, type Role } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import { fmtUser, isLogEventEnabled, sendLog, truncate } from '../../lib/logging.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildRoleCreate,
    async execute(role: Role) {
      if (!isLogEventEnabled(role.guild.id, 'roleCreate')) return;
      const { executor } = await auditInfo(role.guild, AuditLogEvent.RoleCreate, role.id);

      const fields = [
        { name: 'Роль', value: `<@&${role.id}>`, inline: true },
        { name: 'Цвет', value: `\`${role.hexColor}\``, inline: true },
        { name: 'Позиция', value: String(role.position), inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(role.guild, {
        title: '🎭 Роль создана',
        color: COLORS.success,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${role.id}`,
      });

      await sendLog(role.guild, embed, 'roleCreate');
    },
  },

  {
    name: Events.GuildRoleDelete,
    async execute(role: Role) {
      if (!isLogEventEnabled(role.guild.id, 'roleDelete')) return;
      const { executor, reason } = await auditInfo(role.guild, AuditLogEvent.RoleDelete, role.id);

      const fields = [
        { name: 'Роль', value: `\`${role.name}\``, inline: true },
        { name: 'Цвет', value: `\`${role.hexColor}\``, inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      if (reason) fields.push({ name: 'Причина', value: reason, inline: false });

      const embed = logCard(role.guild, {
        title: '🎭 Роль удалена',
        color: COLORS.danger,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        fields,
        footer: `ID: ${role.id}`,
      });

      await sendLog(role.guild, embed, 'roleDelete');
    },
  },

  {
    name: Events.GuildRoleUpdate,
    async execute(oldRole: Role, newRole: Role) {
      if (!isLogEventEnabled(newRole.guild.id, 'roleUpdate')) return;
      const changes: string[] = [];

      if (oldRole.name !== newRole.name) {
        changes.push(`**Название:** \`${oldRole.name}\` → \`${newRole.name}\``);
      }
      if (oldRole.hexColor !== newRole.hexColor) {
        changes.push(`**Цвет:** \`${oldRole.hexColor}\` → \`${newRole.hexColor}\``);
      }
      if (oldRole.hoist !== newRole.hoist) {
        changes.push(
          `**Отображать отдельно:** ${oldRole.hoist ? 'да' : 'нет'} → ${newRole.hoist ? 'да' : 'нет'}`,
        );
      }
      if (oldRole.mentionable !== newRole.mentionable) {
        changes.push(
          `**Упоминаемая:** ${oldRole.mentionable ? 'да' : 'нет'} → ${newRole.mentionable ? 'да' : 'нет'}`,
        );
      }
      if (oldRole.position !== newRole.position) {
        changes.push(`**Позиция:** ${oldRole.position} → ${newRole.position}`);
      }

      const added = new PermissionsBitField(
        newRole.permissions.bitfield & ~oldRole.permissions.bitfield,
      ).toArray();
      const removed = new PermissionsBitField(
        oldRole.permissions.bitfield & ~newRole.permissions.bitfield,
      ).toArray();

      if (added.length > 0) changes.push(`**Добавлены права:** ${added.join(', ')}`);
      if (removed.length > 0) changes.push(`**Убраны права:** ${removed.join(', ')}`);

      if (changes.length === 0) return;

      const { executor } = await auditInfo(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

      const fields = [{ name: 'Роль', value: `<@&${newRole.id}>`, inline: true }];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(newRole.guild, {
        title: '✏️ Роль изменена',
        color: COLORS.warn,
        actor: executor ? { name: executor.tag, iconURL: executor.displayAvatarURL() } : undefined,
        description: truncate(changes.join('\n'), 3500),
        fields,
        footer: `ID: ${newRole.id}`,
      });

      await sendLog(newRole.guild, embed, 'roleUpdate');
    },
  },
];

export default events;
