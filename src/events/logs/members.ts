import {
  AuditLogEvent,
  Events,
  type GuildBan,
  type GuildMember,
  type PartialGuildMember,
} from 'discord.js';
import type { AnyBotEvent } from '../../core/types.js';
import { auditInfo } from '../../lib/audit.js';
import { COLORS } from '../../lib/embeds.js';
import { logCard } from '../../lib/logCard.js';
import { fmtRelative, fmtUser, isLogEventEnabled, sendLog, truncate } from '../../lib/logging.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
      if (!isLogEventEnabled(member.guild.id, 'memberAdd')) return;

      const embed = logCard(member.guild, {
        title: '📥 Участник зашёл',
        color: COLORS.success,
        actor: {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        },
        description: `${member} присоединился к серверу.`,
        fields: [
          {
            name: 'Аккаунт создан',
            value: fmtRelative(member.user.createdTimestamp),
            inline: true,
          },
          { name: 'Участников', value: String(member.guild.memberCount), inline: true },
        ],
      });

      await sendLog(member.guild, embed, 'memberAdd');
    },
  },

  {
    name: Events.GuildMemberRemove,
    async execute(member: GuildMember | PartialGuildMember) {
      const guild = member.guild;
      if (!isLogEventEnabled(guild.id, 'memberRemove')) return;

      // Бан обрабатывается отдельно событием GuildBanAdd — не дублируем «участник вышел»
      const [kick, ban] = await Promise.all([
        auditInfo(guild, AuditLogEvent.MemberKick, member.id),
        auditInfo(guild, AuditLogEvent.MemberBanAdd, member.id),
      ]);
      if (ban.executor) return;

      const { executor, reason } = kick;

      const fields = [
        {
          name: 'Был на сервере',
          value: member.joinedTimestamp ? fmtRelative(member.joinedTimestamp) : '—',
          inline: true,
        },
        { name: 'Участников', value: String(guild.memberCount), inline: true },
      ];

      if (executor) fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      if (reason) fields.push({ name: 'Причина', value: reason, inline: false });

      const embed = logCard(guild, {
        title: executor ? '👢 Участник кикнут' : '📤 Участник вышел',
        color: executor ? COLORS.danger : COLORS.gray,
        actor: {
          name: member.user.tag,
          iconURL: member.user.displayAvatarURL(),
        },
        description: `${member} покинул сервер.`,
        fields,
        footer: `ID: ${member.id}`,
      });

      await sendLog(guild, embed, 'memberRemove');
    },
  },

  {
    name: Events.GuildMemberUpdate,
    async execute(oldMember: GuildMember | PartialGuildMember, newMember: GuildMember) {
      if (!isLogEventEnabled(newMember.guild.id, 'memberUpdate')) return;
      const changes: string[] = [];

      const oldNick = oldMember.nickname ?? null;
      const newNick = newMember.nickname ?? null;
      if (oldNick !== newNick) {
        changes.push(`**Ник:** ${oldNick ?? '*нет*'} → ${newNick ?? '*нет*'}`);
      }

      const oldRoles = oldMember.partial ? null : oldMember.roles.cache.map((role) => role.id);
      if (oldRoles) {
        const newRoles = newMember.roles.cache.map((role) => role.id);
        const added = newRoles.filter((id) => !oldRoles.includes(id));
        const removed = oldRoles.filter((id) => !newRoles.includes(id));
        if (added.length > 0) {
          changes.push(`**Выданы роли:** ${added.map((id) => `<@&${id}>`).join(', ')}`);
        }
        if (removed.length > 0) {
          changes.push(`**Сняты роли:** ${removed.map((id) => `<@&${id}>`).join(', ')}`);
        }
      }

      const oldTimeout = oldMember.communicationDisabledUntilTimestamp ?? null;
      const newTimeout = newMember.communicationDisabledUntilTimestamp ?? null;
      if (oldTimeout !== newTimeout) {
        changes.push(
          newTimeout ? `**Таймаут до:** ${fmtRelative(newTimeout)}` : '**Таймаут снят**',
        );
      }

      if (changes.length === 0) return;

      const { executor } = await auditInfo(
        newMember.guild,
        AuditLogEvent.MemberUpdate,
        newMember.id,
      );

      const fields = [{ name: 'Кто', value: `${newMember}`, inline: true }];
      if (executor && executor.id !== newMember.id) {
        fields.push({ name: 'Кем', value: fmtUser(executor), inline: true });
      }

      const embed = logCard(newMember.guild, {
        title: '👤 Профиль участника изменён',
        color: COLORS.warn,
        actor: {
          name: newMember.user.tag,
          iconURL: newMember.user.displayAvatarURL(),
        },
        description: truncate(changes.join('\n'), 4000),
        fields,
        footer: `ID: ${newMember.id}`,
      });

      await sendLog(newMember.guild, embed, 'memberUpdate');
    },
  },

  {
    name: Events.GuildBanAdd,
    async execute(ban: GuildBan) {
      if (!isLogEventEnabled(ban.guild.id, 'banAdd')) return;

      const { executor, reason } = await auditInfo(
        ban.guild,
        AuditLogEvent.MemberBanAdd,
        ban.user.id,
      );

      const fields = [{ name: 'Кого', value: fmtUser(ban.user), inline: false }];
      if (reason) fields.push({ name: 'Причина', value: reason, inline: false });

      const embed = logCard(ban.guild, {
        title: '🔨 Бан',
        color: COLORS.danger,
        actor: executor
          ? { name: executor.tag, iconURL: executor.displayAvatarURL() }
          : { name: 'Система' },
        thumbnail: ban.user.displayAvatarURL(),
        fields,
        footer: `ID: ${ban.user.id}`,
      });

      await sendLog(ban.guild, embed, 'banAdd');
    },
  },

  {
    name: Events.GuildBanRemove,
    async execute(ban: GuildBan) {
      if (!isLogEventEnabled(ban.guild.id, 'banRemove')) return;

      const { executor, reason } = await auditInfo(
        ban.guild,
        AuditLogEvent.MemberBanRemove,
        ban.user.id,
      );

      const fields = [{ name: 'Кого', value: fmtUser(ban.user), inline: false }];
      if (reason) fields.push({ name: 'Причина', value: reason, inline: false });

      const embed = logCard(ban.guild, {
        title: '🔓 Разбан',
        color: COLORS.success,
        actor: executor
          ? { name: executor.tag, iconURL: executor.displayAvatarURL() }
          : { name: 'Система' },
        thumbnail: ban.user.displayAvatarURL(),
        fields,
        footer: `ID: ${ban.user.id}`,
      });

      await sendLog(ban.guild, embed, 'banRemove');
    },
  },
];

export default events;
