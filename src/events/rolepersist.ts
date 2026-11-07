import { Events, type GuildMember, type PartialGuildMember } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { restoreMemberRoles, saveMemberRoles } from '../lib/rolepersist.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
      await restoreMemberRoles(member.guild, member);
    },
  },
  {
    name: Events.GuildMemberRemove,
    execute(member: GuildMember | PartialGuildMember) {
      saveMemberRoles(member.guild, member);
    },
  },
];

export default events;
