import type { Guild } from 'discord.js';
import type { Appeal } from './appeals.js';
import { closeCase, getCase } from './cases.js';
import { clearWarnsAction, unbanUser, unmuteUser, untimeoutUser } from './moderation.js';

export interface AppealResolution {
  ok: boolean;
  message: string;
}

/** Наказание уже снято/истекло — это не ошибка при одобрении апелляции. */
function alreadyResolved(message: string): boolean {
  return /не забанен|нет активного мута|нет активного таймаута|не найдено|нет предупреждений/i.test(
    message,
  );
}

async function resolveLegacy(
  guild: Guild,
  moderatorId: string,
  appeal: Appeal,
): Promise<AppealResolution> {
  const reason = `Апелляция #${appeal.id} одобрена`;
  const actions: string[] = [];

  const unban = await unbanUser(guild, moderatorId, appeal.userId, reason);
  if (unban.ok) actions.push('бан снят');
  else if (!alreadyResolved(unban.message)) return unban;

  const unmute = await unmuteUser(guild, moderatorId, appeal.userId, reason);
  if (unmute.ok) actions.push('мут снят');
  else if (!alreadyResolved(unmute.message)) return unmute;

  return {
    ok: true,
    message:
      actions.length > 0
        ? `Апелляция #${appeal.id} одобрена: ${actions.join(', ')}.`
        : `Апелляция #${appeal.id} одобрена. Наказания уже не действовали.`,
  };
}

/**
 * Снимает именно то наказание, на которое ссылается апелляция.
 * Для legacy-апелляций без caseId сохраняется прежнее поведение: бан + мут.
 */
export async function resolveAppealPunishment(
  guild: Guild,
  moderatorId: string,
  appeal: Appeal,
): Promise<AppealResolution> {
  if (!appeal.caseId) return resolveLegacy(guild, moderatorId, appeal);

  const modCase = getCase(guild.id, appeal.caseId);
  if (!modCase) {
    return {
      ok: true,
      message: `Апелляция #${appeal.id} одобрена. Кейс #${appeal.caseId} не найден, автоматических действий нет.`,
    };
  }

  const reason = `Апелляция #${appeal.id} одобрена`;

  switch (modCase.type) {
    case 'ban':
    case 'tempban': {
      const unban = await unbanUser(guild, moderatorId, appeal.userId, reason);
      if (!unban.ok && !alreadyResolved(unban.message)) return unban;

      // На бане мог остаться мут — снимаем, как и раньше.
      const unmute = await unmuteUser(guild, moderatorId, appeal.userId, reason);
      if (!unmute.ok && !alreadyResolved(unmute.message)) return unmute;

      return { ok: true, message: `Апелляция #${appeal.id} одобрена: бан снят.` };
    }

    case 'mute': {
      const result = await unmuteUser(guild, moderatorId, appeal.userId, reason);
      if (!result.ok && !alreadyResolved(result.message)) return result;
      return { ok: true, message: `Апелляция #${appeal.id} одобрена: мут снят.` };
    }

    case 'timeout': {
      const result = await untimeoutUser(guild, moderatorId, appeal.userId, reason);
      if (!result.ok && !alreadyResolved(result.message)) return result;
      return { ok: true, message: `Апелляция #${appeal.id} одобрена: таймаут снят.` };
    }

    case 'warn': {
      const warnId = typeof modCase.extra.warnId === 'string' ? modCase.extra.warnId : null;
      if (warnId) {
        const result = await clearWarnsAction(guild, moderatorId, appeal.userId, warnId, reason);
        if (!result.ok && !alreadyResolved(result.message)) return result;
        return { ok: true, message: `Апелляция #${appeal.id} одобрена: варн снят.` };
      }

      if (modCase.active) closeCase(guild.id, modCase.id, reason);
      return { ok: true, message: `Апелляция #${appeal.id} одобрена: кейс варна закрыт.` };
    }

    case 'temprole': {
      const roleId = typeof modCase.extra.roleId === 'string' ? modCase.extra.roleId : null;
      if (roleId) {
        const [member, role] = await Promise.all([
          guild.members.fetch(appeal.userId).catch(() => null),
          Promise.resolve(guild.roles.cache.get(roleId) ?? null),
        ]);
        if (member && role) {
          await member.roles.remove(role, reason).catch(() => null);
        }
      }
      if (modCase.active) closeCase(guild.id, modCase.id, reason);
      return { ok: true, message: `Апелляция #${appeal.id} одобрена: временная роль снята.` };
    }

    case 'kick':
    case 'softban': {
      if (modCase.active) closeCase(guild.id, modCase.id, reason);
      return {
        ok: true,
        message: `Апелляция #${appeal.id} одобрена. Наказание уже завершено.`,
      };
    }

    default: {
      if (modCase.active) {
        closeCase(guild.id, modCase.id, reason);
        return {
          ok: true,
          message: `Апелляция #${appeal.id} одобрена. Кейс #${modCase.id} закрыт.`,
        };
      }
      return {
        ok: true,
        message: `Апелляция #${appeal.id} одобрена. Наказание уже завершено.`,
      };
    }
  }
}
