import type { Guild } from 'discord.js';
import type { BotClient } from '../core/client.js';
import { COLORS } from './embeds.js';
import { logCard } from './logCard.js';
import { sendLog } from './logger.js';
import { caseTypeLabel, closeCase, expiredCases, type ModCase } from './cases.js';
import { getModerationSettings } from './modSettings.js';

const TICK_MS = 30_000;
const processing = new Set<string>();
let timer: NodeJS.Timeout | null = null;

export function startScheduler(client: BotClient): void {
  if (timer) return;
  timer = setInterval(() => {
    void tick(client);
  }, TICK_MS);
  void tick(client);
  console.log('[scheduler] проверка временных наказаний запущена');
}

export function stopScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

async function tick(client: BotClient): Promise<void> {
  try {
    for (const guild of client.guilds.cache.values()) {
      const cases = expiredCases(guild.id);
      for (const modCase of cases) {
        const key = `${guild.id}:${modCase.id}`;
        if (processing.has(key)) continue;
        processing.add(key);

        try {
          const ok = await expireCase(guild, modCase);
          if (ok) await closeAndLog(guild, modCase);
          else console.warn(`[scheduler] не удалось снять кейс #${modCase.id}, повтор`);
        } catch (error) {
          console.error(`[scheduler] ошибка истечения кейса #${modCase.id}:`, error);
        } finally {
          processing.delete(key);
        }
      }
    }
  } catch (error) {
    console.error('[scheduler] ошибка проверки наказаний:', error);
  }
}

/** Возвращает true, если наказание снято и кейс можно закрыть */
async function expireCase(guild: Guild, modCase: ModCase): Promise<boolean> {
  const reason = 'Срок наказания истёк';
  const userId = modCase.userId;
  if (!userId) return true;

  switch (modCase.type) {
    case 'tempban': {
      let banned = false;
      try {
        await guild.bans.fetch(userId);
        banned = true;
      } catch (error) {
        const code = (error as { code?: number }).code;
        if (code !== 10026) {
          console.error('[scheduler] не удалось проверить временный бан:', error);
          return false;
        }
      }

      if (!banned) return true;
      try {
        await guild.bans.remove(userId, reason);
        return true;
      } catch (error) {
        console.error('[scheduler] не удалось снять временный бан:', error);
        return false;
      }
    }

    case 'timeout': {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return true;
      try {
        await member.timeout(null, reason);
        return true;
      } catch (error) {
        console.error('[scheduler] не удалось снять таймаут:', error);
        return false;
      }
    }

    case 'mute': {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return true;

      const settings = getModerationSettings(guild.id);
      const roleId =
        typeof modCase.extra.roleId === 'string'
          ? modCase.extra.roleId
          : settings.muteRoleId;
      const role = roleId ? guild.roles.cache.get(roleId) : null;
      if (!role || !member.roles.cache.has(role.id)) return true;

      try {
        await member.roles.remove(role, reason);
        return true;
      } catch (error) {
        console.error('[scheduler] не удалось снять мут:', error);
        return false;
      }
    }

    case 'temprole': {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return true;

      const roleId =
        typeof modCase.extra.roleId === 'string' ? modCase.extra.roleId : null;
      const role = roleId ? guild.roles.cache.get(roleId) : null;
      if (!role || !member.roles.cache.has(role.id)) return true;

      try {
        await member.roles.remove(role, reason);
        return true;
      } catch (error) {
        console.error('[scheduler] не удалось снять временную роль:', error);
        return false;
      }
    }

    default:
      return true;
  }
}

async function closeAndLog(guild: Guild, modCase: ModCase): Promise<void> {
  closeCase(guild.id, modCase.id, 'Срок наказания истёк');

  await sendLog(
    guild,
    logCard(guild, {
      title: '⏳ Временное наказание истекло',
      color: COLORS.success,
      fields: [
        { name: 'Кейс', value: `#${modCase.id}`, inline: true },
        { name: 'Тип', value: caseTypeLabel(modCase.type), inline: true },
        { name: 'Участник', value: modCase.userId ? `<@${modCase.userId}>` : '—', inline: true },
        { name: 'Причина', value: modCase.reason },
      ],
      footer: modCase.userId ? `ID: ${modCase.userId}` : undefined,
    }),
    'moderationExpire',
  );
}
