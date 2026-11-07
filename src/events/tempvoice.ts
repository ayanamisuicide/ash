import { ChannelType, Events, PermissionFlagsBits, type VoiceState } from 'discord.js';
import type { AnyBotEvent } from '../core/types.js';
import {
  addTempVoice,
  getCommunitySettings,
  getTempVoice,
  listTempVoices,
  removeTempVoice,
} from '../lib/community.js';

export default {
  name: Events.VoiceStateUpdate,

  async execute(oldState: VoiceState, newState: VoiceState) {
    const guild = newState.guild ?? oldState.guild;
    const member = newState.member ?? oldState.member;
    const settings = getCommunitySettings(guild.id);

    // Удаление пустого временного канала
    const oldChannel = oldState.channel;
    if (oldChannel && oldState.channelId !== newState.channelId) {
      const temp = getTempVoice(oldChannel.id);
      if (temp) {
        const remaining = oldChannel.members.filter((item) => item.id !== oldState.id);
        if (remaining.size === 0) {
          await oldChannel.delete('TempVoice: канал пуст').catch(() => undefined);
          removeTempVoice(oldChannel.id);
        }
      }
    }

    if (!settings.tempVoiceChannelId) return;
    if (newState.channelId !== settings.tempVoiceChannelId) return;
    if (oldState.channelId === settings.tempVoiceChannelId) return;
    if (!member || member.user.bot) return;

    const existing = listTempVoices(guild.id).find(
      (voice) => voice.ownerId === member.id && guild.channels.cache.has(voice.channelId),
    );
    if (existing) {
      await member.voice.setChannel(existing.channelId).catch(() => undefined);
      return;
    }

    const trigger = newState.channel;
    if (!trigger) return;

    try {
      const channel = await guild.channels.create({
        name: `🔊 ${member.user.username}`.slice(0, 100),
        type: ChannelType.GuildVoice,
        parent: trigger.parentId,
        permissionOverwrites: [
          {
            id: member.id,
            allow: [
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.MuteMembers,
              PermissionFlagsBits.DeafenMembers,
            ],
          },
        ],
        reason: 'TempVoice: создание канала',
      });

      addTempVoice(guild.id, channel.id, member.id);
      await member.voice.setChannel(channel).catch(() => undefined);
    } catch (error) {
      console.error('[tempvoice] не удалось создать канал:', error);
    }
  },
} satisfies AnyBotEvent;
