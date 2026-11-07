import { Events, type GuildMember } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { handleRaidJoin } from '../lib/raid.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member: GuildMember) {
    await handleRaidJoin(member.guild, member);
  },
} satisfies AnyBotEvent;
