import type { Guild } from 'discord.js';
import { closeActiveCases, createCase } from '../cases.js';
import {
  clampDeleteSeconds,
  checkTarget,
  dm,
  fail,
  fetchMember,
  fetchUser,
  ok,
  type ActionResult,
} from './helpers.js';

export async function banUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
  deleteSeconds = 0,
  durationMs?: number | null,
): Promise<ActionResult> {
  if (userId === moderatorId) return fail('Нельзя забанить самого себя.');

  const user = await fetchUser(guild, userId);
  if (!user) return fail('Пользователь не найден.');
  if (user.id === guild.client.user?.id) return fail('Нельзя забанить бота.');

  const member = await fetchMember(guild, userId);
  if (member) {
    const problem = checkTarget(guild, member, moderatorId);
    if (problem) return fail(problem);
    if (!member.bannable) return fail('У бота нет прав забанить этого участника.');
  }

  const expiresAt = durationMs && durationMs > 0 ? Date.now() + Math.floor(durationMs) : null;

  await dm(
    user,
    `🔨 Ты забанен на сервере **${guild.name}**.\n🧾 Причина: ${reason}` +
      (expiresAt ? `\n⏳ До: <t:${Math.floor(expiresAt / 1_000)}:f>` : ''),
  );

  try {
    await guild.bans.create(userId, {
      reason: `Модератор ${moderatorId}: ${reason}`,
      deleteMessageSeconds: clampDeleteSeconds(deleteSeconds),
    });
  } catch (error) {
    console.error('[moderation] не удалось забанить:', error);
    return fail('Discord отклонил бан. Проверьте права и иерархию ролей.');
  }

  closeActiveCases(guild.id, userId, ['ban', 'tempban'], `Новый бан: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: expiresAt ? 'tempban' : 'ban',
    userId,
    moderatorId,
    reason,
    expiresAt,
  });

  return ok(
    `🔨 ${user} забанен${expiresAt ? ` до <t:${Math.floor(expiresAt / 1_000)}:f>` : ''}.`,
    modCase.id,
  );
}

export async function tempbanUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  durationMs: number,
  reason: string,
  deleteSeconds = 0,
): Promise<ActionResult> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return fail('Неверная длительность временного бана.');
  }
  return banUser(guild, moderatorId, userId, reason, deleteSeconds, durationMs);
}

export async function softbanUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
  deleteSeconds = 86_400,
): Promise<ActionResult> {
  if (userId === moderatorId) return fail('Нельзя забанить самого себя.');

  const user = await fetchUser(guild, userId);
  if (!user) return fail('Пользователь не найден.');
  if (user.id === guild.client.user?.id) return fail('Нельзя забанить бота.');

  const member = await fetchMember(guild, userId);
  if (member) {
    const problem = checkTarget(guild, member, moderatorId);
    if (problem) return fail(problem);
    if (!member.bannable) return fail('У бота нет прав забанить этого участника.');
  }

  await dm(
    user,
    `🧹 Ты софтбанен на сервере **${guild.name}** (сообщения удалены).\n🧾 Причина: ${reason}`,
  );

  try {
    await guild.bans.create(userId, {
      reason: `Софтбан (${moderatorId}): ${reason}`,
      deleteMessageSeconds: clampDeleteSeconds(deleteSeconds),
    });
    await guild.bans.remove(userId, `Софтбан (${moderatorId}): ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось выполнить софтбан:', error);
    return fail('Discord отклонил софтбан. Проверьте права и иерархию ролей.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'softban',
    userId,
    moderatorId,
    reason,
    active: false,
    extra: { deleteSeconds },
  });

  return ok(`🧹 ${user} софтбанен, сообщения за период удалены.`, modCase.id);
}

export async function massbanUsers(
  guild: Guild,
  moderatorId: string,
  userIds: string[],
  reason: string,
  deleteSeconds = 0,
): Promise<ActionResult> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return fail('Не указаны ID пользователей.');
  if (unique.length > 50) return fail('За один раз можно забанить не более 50 пользователей.');

  let success = 0;
  let failed = 0;

  for (const userId of unique) {
    if (!/^\d{17,20}$/.test(userId)) {
      failed++;
      continue;
    }
    const result = await banUser(guild, moderatorId, userId, reason, deleteSeconds);
    if (result.ok) success++;
    else failed++;
  }

  return success > 0
    ? ok(`Забанено: **${success}**. Не удалось: **${failed}**.`)
    : fail(`Не удалось забанить ни одного пользователя (ошибок: ${failed}).`);
}

export async function kickUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  if (userId === moderatorId) return fail('Нельзя кикнуть самого себя.');

  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);
  if (!member.kickable) return fail('У бота нет прав кикнуть этого участника.');

  await dm(member.user, `👢 Ты кикнут с сервера **${guild.name}**.\n🧾 Причина: ${reason}`);

  try {
    await member.kick(`Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось кикнуть:', error);
    return fail('Discord отклонил кик. Проверьте права и иерархию ролей.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'kick',
    userId,
    moderatorId,
    reason,
    active: false,
  });
  return ok(`👢 ${member} кикнут.`, modCase.id);
}

export async function unbanUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  const banned = await guild.bans.fetch(userId).catch(() => null);
  if (!banned) return fail('Этот пользователь не забанен.');

  try {
    await guild.bans.remove(userId, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось разбанить:', error);
    return fail('Discord отклонил разбан. Проверьте права бота.');
  }

  await dm(banned.user, `🔓 Ты разбанен на сервере **${guild.name}**.\n🧾 Причина: ${reason}`);

  closeActiveCases(guild.id, userId, ['ban', 'tempban'], `Разбан: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'unban',
    userId,
    moderatorId,
    reason,
    active: false,
  });
  return ok(`🔓 ${banned.user} разбанен.`, modCase.id);
}
