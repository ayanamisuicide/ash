import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { clearMemberPunishments } from '../lib/punishmentCleanup.js';
import { saveMemberRoles } from '../lib/rolepersist.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildMemberRemove,
    execute(member: GuildMember | PartialGuildMember) {
      if (member.user.bot) return;

      // Сначала запоминаем обычные роли (с учётом активных наказаний),
      // затем сбрасываем варны и наказания, которые действуют только в гильдии.
      saveMemberRoles(member.guild, member);
      clearMemberPunishments(member.guild.id, member.id);
    },
  },
];

export default events;
