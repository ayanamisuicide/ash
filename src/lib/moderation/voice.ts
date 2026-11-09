import type { Guild } from 'discord.js';
import { createCase } from '../cases.js';
import { dmEmbed } from '../embeds.js';
import {
  checkTarget,
  dm,
  fail,
  fetchMember,
  ok,
  userAvatar,
  type ActionResult,
} from './helpers.js';

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

  const dmTitles: Record<VoiceAction, string> = {
    kick: 'Отключение от голоса',
    move: 'Перемещение в голосе',
    mute: 'Голосовой мут',
    unmute: 'Голосовой мут снят',
    deafen: 'Оглушение',
    undeafen: 'Оглушение снято',
  };

  const dmDescriptions: Record<VoiceAction, string> = {
    kick: `Вы отключены от голосового канала на сервере **${guild.name}**.`,
    move: `Вы перемещены в другой голосовой канал на сервере **${guild.name}**.`,
    mute: `Вы заглушены в голосовом канале на сервере **${guild.name}**.`,
    unmute: `С вас снято голосовое заглушение на сервере **${guild.name}**.`,
    deafen: `Вы оглушены на сервере **${guild.name}**.`,
    undeafen: `С вас снято оглушение на сервере **${guild.name}**.`,
  };

  const positive = action === 'unmute' || action === 'undeafen';

  await dm(
    member.user,
    dmEmbed('info', guild, {
      title: dmTitles[action],
      emoji: positive ? '🔊' : '🎧',
      tone: positive ? 'success' : 'info',
      reason,
      description: dmDescriptions[action],
      thumbnail: userAvatar(member.user),
    }),
  );

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
