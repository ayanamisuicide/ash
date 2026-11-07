import { AuditLogEvent, Events, type Guild, type Invite } from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import {
  fmtRelative,
  fmtUser,
  isLogEventEnabled,
  sendLog,
  verificationLabel,
} from '../../lib/logging.js';

function resolveGuild(invite: Invite): Guild | null {
  return invite.guild ? (invite.client.guilds.cache.get(invite.guild.id) ?? null) : null;
}

const events: AnyBotEvent[] = [
  {
    name: Events.GuildUpdate,
    async execute(oldGuild: Guild, newGuild: Guild) {
      if (!isLogEventEnabled(newGuild.id, 'guildUpdate')) return;
      const changes: string[] = [];

      if (oldGuild.name !== newGuild.name) {
        changes.push(`**Название:** \`${oldGuild.name}\` → \`${newGuild.name}\``);
      }
      if (oldGuild.ownerId !== newGuild.ownerId) {
        changes.push(`**Владелец:** <@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`);
      }
      if (oldGuild.icon !== newGuild.icon) {
        changes.push('**Иконка сервера изменена**');
      }
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push(
          `**Уровень проверки:** ${verificationLabel(oldGuild.verificationLevel)} → ${verificationLabel(newGuild.verificationLevel)}`,
        );
      }

      if (changes.length === 0) return;

      const { executor } = await auditInfo(newGuild, AuditLogEvent.GuildUpdate);

      const embed = logCard(newGuild, {
        title: '🏠 Сервер изменён',
        color: COLORS.warn,
        actor: executor
          ? { name: executor.tag, iconURL: executor.displayAvatarURL() }
          : undefined,
        description: changes.join('\n'),
      });

      await sendLog(newGuild, embed, 'guildUpdate');
    },
  },

  {
    name: Events.InviteCreate,
    async execute(invite: Invite) {
      const guild = resolveGuild(invite);
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'inviteCreate')) return;

      const fields = [
        { name: 'Код', value: `\`${invite.code}\``, inline: true },
        { name: 'Канал', value: invite.channelId ? `<#${invite.channelId}>` : '—', inline: true },
      ];
      if (invite.maxUses) {
        fields.push({ name: 'Лимит', value: String(invite.maxUses), inline: true });
      }
      if (invite.expiresTimestamp) {
        fields.push({ name: 'Истекает', value: fmtRelative(invite.expiresTimestamp), inline: true });
      }

      const embed = logCard(guild, {
        title: '🔗 Приглашение создано',
        color: COLORS.success,
        actor: invite.inviter
          ? { name: invite.inviter.tag, iconURL: invite.inviter.displayAvatarURL() }
          : undefined,
        description: invite.inviter ? `${invite.inviter} создал приглашение.` : undefined,
        fields,
        footer: `Код: ${invite.code}`,
      });

      await sendLog(guild, embed, 'inviteCreate');
    },
  },

  {
    name: Events.InviteDelete,
    async execute(invite: Invite) {
      const guild = resolveGuild(invite);
      if (!guild) return;
      if (!isLogEventEnabled(guild.id, 'inviteDelete')) return;

      const { executor } = await auditInfo(guild, AuditLogEvent.InviteDelete, invite.channelId);

      const fields = [
        { name: 'Код', value: `\`${invite.code}\``, inline: true },
        { name: 'Канал', value: invite.channelId ? `<#${invite.channelId}>` : '—', inline: true },
      ];
      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });

      const embed = logCard(guild, {
        title: '🔗 Приглашение удалено',
        color: COLORS.danger,
        actor: executor
          ? { name: executor.tag, iconURL: executor.displayAvatarURL() }
          : undefined,
        fields,
        footer: `Код: ${invite.code}`,
      });

      await sendLog(guild, embed, 'inviteDelete');
    },
  },
];

export default events;
