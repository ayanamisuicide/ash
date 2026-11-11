import type { Guild, GuildMember } from 'discord.js';
import { getCommunitySettings } from './community.js';

/**
 * Выдаёт роли за уровни, которые участник перешагнул с прошлого уровня.
 * При включённой замене снимает предыдущие награды, оставляя самую высокую.
 */
export async function applyLevelRewards(
  guild: Guild,
  member: GuildMember,
  fromLevel: number,
  toLevel: number,
): Promise<string[]> {
  const settings = getCommunitySettings(guild.id);
  if (settings.levelRewards.length === 0 || toLevel <= fromLevel) return [];

  const crossed = settings.levelRewards
    .filter((reward) => reward.level > fromLevel && reward.level <= toLevel)
    .sort((a, b) => a.level - b.level);
  if (crossed.length === 0) return [];

  const applied: string[] = [];

  for (const reward of crossed) {
    const role =
      guild.roles.cache.get(reward.roleId) ??
      (await guild.roles.fetch(reward.roleId).catch(() => null));
    if (!role || role.managed || member.roles.cache.has(role.id)) continue;

    try {
      await member.roles.add(role, `Награда за уровень ${reward.level}`);
      applied.push(role.id);
    } catch (error) {
      console.error(
        `[levels] не удалось выдать роль ${role.id} за уровень ${reward.level}:`,
        error,
      );
    }
  }

  if (settings.levelRewardsReplacePrevious) {
    const keep = settings.levelRewards
      .filter((reward) => reward.level <= toLevel)
      .sort((a, b) => b.level - a.level)[0]?.roleId;

    for (const reward of settings.levelRewards) {
      if (reward.level > toLevel || reward.roleId === keep) continue;
      const role = guild.roles.cache.get(reward.roleId);
      if (!role || !member.roles.cache.has(role.id)) continue;

      try {
        await member.roles.remove(role, `Замена награды за уровень ${toLevel}`);
      } catch (error) {
        console.error(`[levels] не удалось снять роль ${role.id}:`, error);
      }
    }
  }

  return applied;
}
