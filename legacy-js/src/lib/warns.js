import { db } from '../storage/db.js';

export function getWarns(guildId, userId) {
  return db.get(`guilds.${guildId}.warns.${userId}`, []);
}

/** Добавляет предупреждение, возвращает новое количество */
export function addWarn(guildId, userId, moderatorId, reason) {
  const warns = getWarns(guildId, userId);
  warns.push({
    id: Date.now().toString(36),
    reason,
    moderatorId,
    at: Date.now(),
  });
  db.set(`guilds.${guildId}.warns.${userId}`, warns);
  return warns.length;
}

/** Удаляет предупреждение по id, возвращает удалённое или null */
export function removeWarn(guildId, userId, warnId) {
  const warns = getWarns(guildId, userId);
  const index = warns.findIndex((w) => w.id === warnId);
  if (index === -1) return null;
  const [removed] = warns.splice(index, 1);
  db.set(`guilds.${guildId}.warns.${userId}`, warns);
  return removed;
}
