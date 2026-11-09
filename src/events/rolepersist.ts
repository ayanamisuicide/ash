import { Events, type GuildMember } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { restoreMemberRoles } from '../lib/rolepersist.js';

const events: AnyBotEvent[] = [
  {
    name: Events.GuildMemberAdd,
    async execute(member: GuildMember) {
      await restoreMemberRoles(member.guild, member);
    },
  },
];

export default events;
