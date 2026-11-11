import type { Guild, GuildMember } from 'discord.js';
import { V2 } from './card.js';
import { getCommunitySettings, renderTemplate } from './community.js';
import { applyLevelRewards } from './levelRewards.js';
import { goodbyeMessage, levelUpMessage, welcomeMessage } from './responses.js';

export type CommunityTemplateKind = 'welcome' | 'goodbye' | 'levelup';

/**
 * Отправляет карточку сообщества в канал. Общий код для событий входа/выхода,
 * повышения уровня от сообщений и от голоса.
 */
export async function sendCommunityTemplate(
  channelId: string | null,
  guild: Guild,
  template: string,
  member: GuildMember,
  kind: CommunityTemplateKind,
  extra: Record<string, string | number> = {},
): Promise<void> {
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased()) return;

  const content = renderTemplate(template, {
    user: `${member}`,
    guild: guild.name,
    memberCount: guild.memberCount,
    ...extra,
  });

  const view =
    kind === 'welcome'
      ? welcomeMessage(member.user, guild, guild.memberCount, content)
      : kind === 'goodbye'
        ? goodbyeMessage(member.user, guild, content)
        : levelUpMessage(member.user, Number(extra.level ?? 0), Number(extra.xp ?? 0), content);

  await channel
    .send({
      components: [view],
      flags: V2,
    })
    .catch(() => undefined);
}

export interface LevelUpNotice {
  userId: string;
  level: number;
  xp: number;
}

/**
 * Уведомления о новом уровне. Используется голосовым тикером: XP за голос
 * начисляется в фоне, поэтому событие сообщения здесь не срабатывает.
 */
export async function announceLevelUps(guild: Guild, notices: LevelUpNotice[]): Promise<void> {
  if (notices.length === 0) return;
  const settings = getCommunitySettings(guild.id);

  for (const notice of notices) {
    const member =
      guild.members.cache.get(notice.userId) ??
      (await guild.members.fetch(notice.userId).catch(() => null));
    if (!member) continue;

    await applyLevelRewards(guild, member, Math.max(0, notice.level - 1), notice.level);

    await sendCommunityTemplate(
      settings.levelupChannelId,
      guild,
      settings.levelupMessage,
      member,
      'levelup',
      { level: notice.level, xp: notice.xp },
    );
  }
}
