import { PermissionFlagsBits, type Guild, type Role } from 'discord.js';
import { closeActiveCases, createCase } from '../cases.js';
import { COLORS } from '../embeds.js';
import { humanDuration } from '../format.js';
import { getModerationSettings, setMuteRoleId } from '../modSettings.js';
import {
  MAX_MUTE_MS,
  MAX_TIMEOUT_MS,
  checkTarget,
  dm,
  durationToMs,
  fail,
  fetchMember,
  ok,
  type ActionResult,
} from './helpers.js';

export async function timeoutUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  duration: string | number,
  reason: string,
): Promise<ActionResult> {
  const durationMs = durationToMs(duration);
  if (!durationMs) return fail('Неверный формат длительности. Пример: `10m`, `1h`, `2d`, `1w`.');
  if (durationMs > MAX_TIMEOUT_MS) return fail('Максимальный таймаут — 28 дней.');

  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);
  if (!member.moderatable) return fail('У бота нет прав заглушить этого участника.');

  try {
    await member.timeout(durationMs, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось выдать таймаут:', error);
    return fail('Discord отклонил таймаут. Проверьте права и иерархию ролей.');
  }

  await dm(
    member.user,
    `🔇 Тебе выдан таймаут на **${humanDuration(durationMs)}** на сервере **${guild.name}**.\n🧾 Причина: ${reason}`,
  );

  closeActiveCases(guild.id, userId, ['timeout'], `Новый таймаут: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'timeout',
    userId,
    moderatorId,
    reason,
    expiresAt: Date.now() + durationMs,
  });

  return ok(`🔇 ${member} заглушен на ${humanDuration(durationMs)}.`, modCase.id);
}

export async function untimeoutUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');
  if (!member.isCommunicationDisabled()) {
    return fail('У этого участника нет активного таймаута.');
  }
  if (!member.moderatable) {
    return fail('У бота нет прав снять таймаут с этого участника.');
  }

  try {
    await member.timeout(null, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось снять таймаут:', error);
    return fail('Discord отклонил снятие таймаута.');
  }

  await dm(
    member.user,
    `🔊 С тебя снят таймаут на сервере **${guild.name}**.\n🧾 Причина: ${reason}`,
  );

  closeActiveCases(guild.id, userId, ['timeout'], `Снятие таймаута: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'untimeout',
    userId,
    moderatorId,
    reason,
    active: false,
  });
  return ok(`🔊 С ${member} снят таймаут.`, modCase.id);
}

async function findMuteRole(guild: Guild): Promise<Role | null> {
  const settings = getModerationSettings(guild.id);
  if (settings.muteRoleId) {
    const existing = guild.roles.cache.get(settings.muteRoleId);
    if (existing && !existing.managed) return existing;
  }

  return (
    guild.roles.cache.find(
      (role) => role.name.toLowerCase() === 'muted' && !role.managed,
    ) ?? null
  );
}

async function applyMuteOverwrites(guild: Guild, role: Role): Promise<void> {
  const channels = [...guild.channels.cache.values()].filter(
    (channel) =>
      'permissionOverwrites' in channel &&
      (channel.isTextBased() || channel.isVoiceBased()),
  );

  await Promise.all(
    channels.map((channel) =>
      channel.permissionOverwrites
        .edit(
          role,
          {
            SendMessages: false,
            AddReactions: false,
            Speak: false,
          },
          { reason: 'Настройка роли Muted' },
        )
        .catch(() => undefined),
    ),
  );
}

async function ensureMuteRole(guild: Guild): Promise<Role | null> {
  const existing = await findMuteRole(guild);
  if (existing) {
    setMuteRoleId(guild.id, existing.id);
    return existing;
  }

  try {
    const role = await guild.roles.create({
      name: 'Muted',
      color: COLORS.gray,
      permissions: [],
      reason: 'Создание роли для мута',
    });
    await applyMuteOverwrites(guild, role);
    setMuteRoleId(guild.id, role.id);
    return role;
  } catch (error) {
    console.error('[moderation] не удалось создать роль Muted:', error);
    return null;
  }
}

export async function muteUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  duration: string | number | null,
  reason: string,
): Promise<ActionResult> {
  let durationMs: number | null = null;
  if (duration !== null && duration !== '') {
    durationMs = durationToMs(duration);
    if (!durationMs) return fail('Неверный формат длительности мута.');
    if (durationMs > MAX_MUTE_MS) return fail('Максимальный мут — 365 дней.');
  }

  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const problem = checkTarget(guild, member, moderatorId);
  if (problem) return fail(problem);

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return fail('Для мута нужно право бота «Управление ролями».');
  }
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return fail('Для мута нужно право бота «Управление каналами».');
  }

  const role = await ensureMuteRole(guild);
  if (!role) return fail('Не удалось создать или найти роль Muted. Проверьте право «Управление ролями».');
  if (member.roles.cache.has(role.id)) return fail('Участник уже заглушен.');

  try {
    await member.roles.add(role, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось выдать мут:', error);
    return fail('Discord отклонил выдачу мута. Проверьте права и иерархию ролей.');
  }

  await dm(
    member.user,
    `🔇 Тебе выдан мут${durationMs ? ` на **${humanDuration(durationMs)}**` : ''} на сервере **${guild.name}**.\n🧾 Причина: ${reason}`,
  );

  closeActiveCases(guild.id, userId, ['mute'], `Новый мут: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'mute',
    userId,
    moderatorId,
    reason,
    expiresAt: durationMs ? Date.now() + durationMs : null,
    extra: { roleId: role.id },
  });

  return ok(
    `🔇 ${member} заглушен${durationMs ? ` на ${humanDuration(durationMs)}` : ''}.`,
    modCase.id,
  );
}

export async function unmuteUser(
  guild: Guild,
  moderatorId: string,
  userId: string,
  reason: string,
): Promise<ActionResult> {
  const member = await fetchMember(guild, userId);
  if (!member) return fail('Участник не найден на сервере.');

  const role = await findMuteRole(guild);
  if (!role || !member.roles.cache.has(role.id)) {
    return fail('У этого участника нет активного мута.');
  }

  try {
    await member.roles.remove(role, `Модератор ${moderatorId}: ${reason}`);
  } catch (error) {
    console.error('[moderation] не удалось снять мут:', error);
    return fail('Discord отклонил снятие мута.');
  }

  await dm(
    member.user,
    `🔊 С тебя снят мут на сервере **${guild.name}**.\n🧾 Причина: ${reason}`,
  );

  closeActiveCases(guild.id, userId, ['mute'], `Снятие мута: ${reason}`);

  const modCase = createCase({
    guildId: guild.id,
    type: 'unmute',
    userId,
    moderatorId,
    reason,
    active: false,
  });
  return ok(`🔊 С ${member} снят мут.`, modCase.id);
}
