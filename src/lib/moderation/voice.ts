import type { Guild } from 'discord.js';
import { createCase } from '../cases.js';
import { checkTarget, fail, fetchMember, ok, type ActionResult } from './helpers.js';

export type VoiceAction = 'kick' | 'move' | 'mute' | 'unmute' | 'deafen' | 'undeafen';

export async function voiceAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
  action: VoiceAction,
  reason: string,
  channelId?: string | null,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  if (action === 'kick' || action === 'move') {
    if (!member.voice.channel) return fail('Участник не находится в голосовом канале.');
  }

  try {
    switch (action) {
      case 'kick':
        await member.voice.disconnect(`Модератор ${moderatorId}: ${reason}`);
        break;
      case 'move': {
        const channel = channelId ? guild.channels.cache.get(channelId) : null;
        if (!channel || !channel.isVoiceBased()) {
          return fail('Укажите существующий голосовой канал.');
        }
        await member.voice.setChannel(channel, `Модератор ${moderatorId}: ${reason}`);
        break;
      }
      case 'mute':
        await member.voice.setMute(true, `Модератор ${moderatorId}: ${reason}`);
        break;
      case 'unmute':
        await member.voice.setMute(false, `Модератор ${moderatorId}: ${reason}`);
        break;
      case 'deafen':
        await member.voice.setDeaf(true, `Модератор ${moderatorId}: ${reason}`);
        break;
      case 'undeafen':
        await member.voice.setDeaf(false, `Модератор ${moderatorId}: ${reason}`);
        break;
    }
  } catch (error) {
    console.error('[moderation] голосовое действие не удалось:', error);
    return fail('Discord отклонил голосовое действие.');
  }

  const labels: Record<VoiceAction, string> = {
    kick: 'отключён от голоса',
    move: 'перемещён в другой канал',
    mute: 'заглушен в голосе',
    unmute: 'разглушен в голосе',
    deafen: 'оглушён',
    undeafen: 'разоглушён',
  };

  const modCase = createCase({
    guildId: guild.id,
    type: 'voice',
    userId,
    moderatorId,
    reason,
    active: false,
    extra: { action, channelId: channelId ?? null },
  });
  return ok(`${member} ${labels[action]}.`, modCase.id);
}
