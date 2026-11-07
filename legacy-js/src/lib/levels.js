import { db } from '../storage/db.js';
import { getSettings } from './settings.js';
import { baseEmbed, COLORS } from './embeds.js';

/** Кулдаун выдачи XP: 60 секунд между сообщениями одного пользователя */
export const XP_COOLDOWN = 60_000;

const cooldowns = new Map();

/** Сколько XP нужно, чтобы пройти с уровня `level` на следующий */
export function xpNeeded(level) {
  return 5 * level * level + 50 * level + 100;
}

/** По общему количеству XP возвращает { level, rest } */
export function calcLevels(xp) {
  let level = 0;
  let rest = xp;
  while (rest >= xpNeeded(level)) {
    rest -= xpNeeded(level);
    level++;
  }
  return { level, rest };
}

export function getUserXpPath(guildId, userId) {
  return `guilds.${guildId}.users.${userId}`;
}

/** Основной обработчик: начисляет XP и анонсирует лвл-ап */
export async function handleXP(message) {
  const settings = getSettings(message.guild.id);
  if (settings.xp?.enabled === false) return;

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();
  if ((cooldowns.get(key) ?? 0) > now) return;
  cooldowns.set(key, now);
  if (cooldowns.size > 5_000) cooldowns.clear();

  const min = settings.xp?.min ?? 15;
  const max = settings.xp?.max ?? 25;
  const step = Math.floor(Math.random() * (max - min + 1)) + min;

  const path = getUserXpPath(message.guild.id, message.author.id);
  const data = db.get(path, { xp: 0 });
  const before = calcLevels(data.xp).level;

  data.xp += step;
  data.at = now;
  db.set(path, data);

  const after = calcLevels(data.xp).level;
  if (after > before) {
    const channelId = db.get(`guilds.${message.guild.id}.levelupchannel`, null);
    const channel = (channelId && message.guild.channels.cache.get(channelId)) || message.channel;
    await channel
      .send({
        embeds: [
          baseEmbed(COLORS.success).setDescription(
            `🎉 **${message.author}** повысил(а) уровень до **${after}**!`,
          ),
        ],
      })
      .catch(() => {});
  }
}
