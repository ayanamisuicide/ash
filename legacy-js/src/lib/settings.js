import { db } from '../storage/db.js';

/** Возвращает все настройки сервера (объект, может быть пустым) */
export function getSettings(guildId) {
  return db.get(`guilds.${guildId}`, {});
}

/** Записывает настройку сервера, например setSetting(id, 'autorole', '123') */
export function setSetting(guildId, key, value) {
  db.set(`guilds.${guildId}.${key}`, value);
}
