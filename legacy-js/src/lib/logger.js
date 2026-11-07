import { db } from '../storage/db.js';

/** Отправляет эмбед в настроенный канал логов сервера */
export async function sendLog(guild, embeds) {
  const channelId = db.get(`guilds.${guild.id}.logs`, null);
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;
  await channel.send({ embeds }).catch(() => {});
}
