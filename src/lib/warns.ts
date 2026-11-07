import { db, ensureGuild } from '../storage/sqlite.js';

export interface Warn {
  id: string;
  reason: string;
  moderatorId: string;
  createdAt: number;
}

interface WarnRow {
  id: string;
  reason: string;
  moderator_id: string;
  created_at: number;
}

function rowToWarn(row: WarnRow): Warn {
  return {
    id: row.id,
    reason: row.reason,
    moderatorId: row.moderator_id,
    createdAt: row.created_at,
  };
}

export function getWarns(guildId: string, userId: string): Warn[] {
  const rows = db
    .prepare(`
      SELECT id, reason, moderator_id, created_at
      FROM warns
      WHERE guild_id = ? AND user_id = ?
      ORDER BY created_at ASC, id ASC
    `)
    .all(guildId, userId) as unknown as WarnRow[];

  return rows.map(rowToWarn);
}

/** Добавляет предупреждение и возвращает его вместе с новым количеством */
export function addWarn(
  guildId: string,
  userId: string,
  moderatorId: string,
  reason: string,
): { total: number; warn: Warn } {
  ensureGuild(guildId);
  const warn: Warn = {
    id: Math.random().toString(36).slice(2, 8),
    reason,
    moderatorId,
    createdAt: Date.now(),
  };

  db.prepare(`
    INSERT INTO warns (guild_id, user_id, id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(guildId, userId, warn.id, warn.moderatorId, warn.reason, warn.createdAt);

  const row = db
    .prepare('SELECT COUNT(*) AS count FROM warns WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId) as { count: number } | undefined;

  return { total: Number(row?.count ?? 0), warn };
}

/** Удаляет одно предупреждение по id. Возвращает удалённое или null */
export function removeWarn(guildId: string, userId: string, warnId: string): Warn | null {
  const row = db
    .prepare(`
      SELECT id, reason, moderator_id, created_at
      FROM warns
      WHERE guild_id = ? AND user_id = ? AND id = ?
    `)
    .get(guildId, userId, warnId) as WarnRow | undefined;

  if (!row) return null;

  db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ? AND id = ?').run(
    guildId,
    userId,
    warnId,
  );
  return rowToWarn(row);
}

/** Полностью очищает предупреждения пользователя и возвращает снятые */
export function clearWarns(guildId: string, userId: string): Warn[] {
  const warnings = getWarns(guildId, userId);
  db.prepare('DELETE FROM warns WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  return warnings;
}
