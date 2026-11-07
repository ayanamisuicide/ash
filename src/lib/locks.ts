import { db, ensureGuild } from '../storage/sqlite.js';

export interface LockState {
  allow: string;
  deny: string;
}

interface LockRow {
  channel_id: string;
  allow: string;
  deny: string;
}

export function getLock(guildId: string, channelId: string): LockState | null {
  const row = db
    .prepare('SELECT channel_id, allow, deny FROM locks WHERE guild_id = ? AND channel_id = ?')
    .get(guildId, channelId) as LockRow | undefined;

  return row ? { allow: row.allow, deny: row.deny } : null;
}

export function setLock(guildId: string, channelId: string, state: LockState): void {
  ensureGuild(guildId);
  db.prepare(`
    INSERT INTO locks (guild_id, channel_id, allow, deny)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, channel_id) DO UPDATE SET
      allow = excluded.allow,
      deny = excluded.deny
  `).run(guildId, channelId, state.allow, state.deny);
}

export function clearLock(guildId: string, channelId: string): void {
  db.prepare('DELETE FROM locks WHERE guild_id = ? AND channel_id = ?').run(
    guildId,
    channelId,
  );
}

export function listLocks(guildId: string): Record<string, LockState> {
  const rows = db
    .prepare('SELECT channel_id, allow, deny FROM locks WHERE guild_id = ?')
    .all(guildId) as unknown as LockRow[];

  const result: Record<string, LockState> = {};
  for (const row of rows) {
    result[row.channel_id] = { allow: row.allow, deny: row.deny };
  }
  return result;
}
