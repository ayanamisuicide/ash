import { Events, type GuildMember, type PartialGuildMember, type VoiceState } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import { getCommunitySettings } from '../lib/community.js';
import { closeVoiceSession, openVoiceSession } from '../lib/voiceStats.js';

/**
 * Канал, время в котором считается. AFK-канал исключается: иначе «сидение»
 * в AFK фармило бы и статистику, и XP.
 */
function countableChannelId(afkChannelId: string | null, channelId: string | null): string | null {
  if (!channelId) return null;
  if (afkChannelId && channelId === afkChannelId) return null;
  return channelId;
}

const events: AnyBotEvent[] = [
  {
    name: Events.VoiceStateUpdate,
    execute(oldState: VoiceState, newState: VoiceState) {
      const member = newState.member ?? oldState.member;
      if (!member || member.user.bot) return;

      const guild = newState.guild ?? oldState.guild;
      if (!getCommunitySettings(guild.id).voiceTrackingEnabled) return;

      const before = countableChannelId(guild.afkChannelId, oldState.channelId);
      const after = countableChannelId(guild.afkChannelId, newState.channelId);
      // Смена микрофона/наушников не влияет на время в канале.
      if (before === after) return;

      if (before) closeVoiceSession(guild.id, member.id);
      if (after) openVoiceSession(guild.id, member.id, after);
    },
  },
  {
    // Участник мог выйти с сервера прямо из голосового канала.
    name: Events.GuildMemberRemove,
    execute(member: GuildMember | PartialGuildMember) {
      closeVoiceSession(member.guild.id, member.id);
    },
  },
];

export default events;
