import type { Guild } from 'discord.js';
import { createCase } from '../cases.js';
import { humanDuration } from '../format.js';
import { checkTarget, fail, fetchMember, ok, type ActionResult } from './helpers.js';

export async function setNickname(
  guild: Guild,
  moderatorId: string,
  userId: string,
  nickname: string | null,
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  try {
    await member.setNickname(nickname, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось изменить ник:', error);
    return fail('Не удалось изменить ник. Проверьте право «Управление никами».');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'nick',
    userId,
    moderatorId,
    reason,
    active: false,
    extra: { nickname },
  });
  return ok(
    nickname ? `Ник ${member} изменён на **${nickname}**.` : `Ник ${member} сброшен.`,
    modCase.id,
  );
}

export async function roleAction(
  guild: Guild,
  moderatorId: string,
  userId: string,
  roleId: string,
  action: 'add' | 'remove',
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const role = guild.roles.cache.get(roleId);
  if (!role) return fail('Роль не найдена.');
  if (role.id === guild.id) return fail('Нельзя управлять ролью @everyone.');
  if (role.managed) return fail('Эту роль управляет интеграция, её нельзя менять вручную.');

  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return fail('Эта роль не ниже роли бота — поднимите роль бота выше.');
  }

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  const hasRole = member.roles.cache.has(role.id);
  if (action === 'add' && hasRole) {
    return fail(`У участника уже есть роль ${role}.`);
  }
  if (action === 'remove' && !hasRole) {
    return fail(`У участника нет роли ${role}.`);
  }

  try {
    if (action === 'add') {
      await member.roles.add(role, `Модератор ${moderatorId}: ${reason}`);
    } else {
      await member.roles.remove(role, `Модератор ${moderatorId}: ${reason}`);
    }
  } catch (error) {
    console.error('[moderation] не удалось изменить роль:', error);
    return fail('Discord отклонил изменение роли.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'role',
    userId,
    moderatorId,
    reason,
    active: false,
    extra: { action, roleId },
  });
  return ok(
    action === 'add' ? `Роль ${role} выдана ${member}.` : `Роль ${role} снята с ${member}.`,
    modCase.id,
  );
}

/** Заменяет все управляемые роли участника одной указанной ролью */
export async function setRole(
  guild: Guild,
  moderatorId: string,
  userId: string,
  roleId: string,
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const role = guild.roles.cache.get(roleId);
  if (!role) return fail('Роль не найдена.');
  if (role.id === guild.id) return fail('Нельзя управлять ролью @everyone.');
  if (role.managed) return fail('Эту роль управляет интеграция, её нельзя менять вручную.');

  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return fail('Эта роль не ниже роли бота — поднимите роль бота выше.');
  }

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  const toRemove = member.roles.cache.filter(
    (item) => item.id !== guild.id && item.id !== role.id && !item.managed,
  );

  try {
    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role, `Модератор ${moderatorId}: setrole ${role.name} (${reason})`);
    }
    if (toRemove.size > 0) {
      await member.roles.remove(
        toRemove,
        `Модератор ${moderatorId}: setrole ${role.name} (${reason})`,
      );
    }
  } catch (error) {
    console.error('[moderation] не удалось установить роль:', error);
    return fail('Discord отклонил изменение ролей.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'role',
    userId,
    moderatorId,
    reason,
    active: false,
    extra: { action: 'set', roleId, removed: toRemove.size },
  });

  return ok(`Роли ${member} заменены на ${role} (снято: **${toRemove.size}**).`, modCase.id);
}

export async function tempRole(
  guild: Guild,
  moderatorId: string,
  userId: string,
  roleId: string,
  durationMs: number,
  reason: string,
): Promise<ActionResult> {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return fail('Неверная длительность временной роли.');
  }

  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const role = guild.roles.cache.get(roleId);
  if (!role) return fail('Роль не найдена.');
  if (role.id === guild.id) return fail('Нельзя управлять ролью @everyone.');
  if (role.managed) return fail('Эту роль управляет интеграция, её нельзя менять вручную.');

  const me = guild.members.me;
  if (me && role.position >= me.roles.highest.position) {
    return fail('Эта роль не ниже роли бота — поднимите роль бота выше.');
  }

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);
  if (member.roles.cache.has(role.id)) {
    return fail(`У участника уже есть роль ${role}.`);
  }

  try {
    await member.roles.add(role, `Временная роль (${moderatorId}): ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось выдать временную роль:', error);
    return fail('Discord отклонил выдачу роли.');
  }

  const modCase = createCase({
    guildId: guild.id,
    type: 'temprole',
    userId,
    moderatorId,
    reason,
    expiresAt: Date.now() + durationMs,
    extra: { roleId },
  });
  return ok(`Роль ${role} выдана ${member} на ${humanDuration(durationMs)}.`, modCase.id);
}
