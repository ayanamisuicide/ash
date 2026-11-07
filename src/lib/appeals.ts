import { db, ensureGuild, transaction } from '../storage/sqlite.js';

export type AppealStatus = 'pending' | 'approved' | 'rejected';

export interface Appeal {
  id: number;
  guildId: string;
  userId: string;
  reason: string;
  status: AppealStatus;
  createdAt: number;
  channelId: string | null;
  messageId: string | null;
  reviewedBy: string | null;
  reviewedAt: number | null;
}

interface AppealRow {
  guild_id: string;
  id: number;
  user_id: string;
  reason: string;
  status: string;
  created_at: number;
  channel_id: string | null;
  message_id: string | null;
  reviewed_by: string | null;
  reviewed_at: number | null;
}

function rowToAppeal(row: AppealRow): Appeal {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    userId: row.user_id,
    reason: row.reason,
    status: row.status as AppealStatus,
    createdAt: Number(row.created_at),
    channelId: row.channel_id,
    messageId: row.message_id,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at === null ? null : Number(row.reviewed_at),
  };
}

export function createAppeal(guildId: string, userId: string, reason: string): Appeal {
  ensureGuild(guildId);

  return transaction(() => {
    db.prepare('INSERT OR IGNORE INTO appeal_counters (guild_id, next_id) VALUES (?, 1)').run(
      guildId,
    );

    const counter = db
      .prepare('SELECT next_id FROM appeal_counters WHERE guild_id = ?')
      .get(guildId) as { next_id: number } | undefined;

    const id = Number(counter?.next_id ?? 1);
    db.prepare('UPDATE appeal_counters SET next_id = next_id + 1 WHERE guild_id = ?').run(guildId);

    const appeal: Appeal = {
      id,
      guildId,
      userId,
      reason,
      status: 'pending',
      createdAt: Date.now(),
      channelId: null,
      messageId: null,
      reviewedBy: null,
      reviewedAt: null,
    };

    db.prepare(
      `
      INSERT INTO appeals
        (guild_id, id, user_id, reason, status, created_at, channel_id, message_id, reviewed_by, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      appeal.guildId,
      appeal.id,
      appeal.userId,
      appeal.reason,
      appeal.status,
      appeal.createdAt,
      appeal.channelId,
      appeal.messageId,
      appeal.reviewedBy,
      appeal.reviewedAt,
    );

    return appeal;
  });
}

export function getAppeal(guildId: string, appealId: number): Appeal | null {
  const row = db
    .prepare('SELECT * FROM appeals WHERE guild_id = ? AND id = ?')
    .get(guildId, appealId) as AppealRow | undefined;
  return row ? rowToAppeal(row) : null;
}

export function updateAppeal(
  guildId: string,
  appealId: number,
  patch: Partial<Omit<Appeal, 'id' | 'guildId'>>,
): Appeal | null {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.userId !== undefined) {
    sets.push('user_id = ?');
    values.push(patch.userId);
  }
  if (patch.reason !== undefined) {
    sets.push('reason = ?');
    values.push(patch.reason);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
  }
  if (patch.createdAt !== undefined) {
    sets.push('created_at = ?');
    values.push(patch.createdAt);
  }
  if (patch.channelId !== undefined) {
    sets.push('channel_id = ?');
    values.push(patch.channelId);
  }
  if (patch.messageId !== undefined) {
    sets.push('message_id = ?');
    values.push(patch.messageId);
  }
  if (patch.reviewedBy !== undefined) {
    sets.push('reviewed_by = ?');
    values.push(patch.reviewedBy);
  }
  if (patch.reviewedAt !== undefined) {
    sets.push('reviewed_at = ?');
    values.push(patch.reviewedAt);
  }

  if (sets.length === 0) return getAppeal(guildId, appealId);

  values.push(guildId, appealId);
  db.prepare(`UPDATE appeals SET ${sets.join(', ')} WHERE guild_id = ? AND id = ?`).run(...values);

  return getAppeal(guildId, appealId);
}

export function findPendingAppeal(guildId: string, userId: string): Appeal | null {
  const row = db
    .prepare(
      `
      SELECT * FROM appeals
      WHERE guild_id = ? AND user_id = ? AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `,
    )
    .get(guildId, userId) as AppealRow | undefined;
  return row ? rowToAppeal(row) : null;
}

export function listAppeals(guildId: string, status?: AppealStatus): Appeal[] {
  const rows = status
    ? (db
        .prepare('SELECT * FROM appeals WHERE guild_id = ? AND status = ? ORDER BY id DESC')
        .all(guildId, status) as unknown as AppealRow[])
    : (db
        .prepare('SELECT * FROM appeals WHERE guild_id = ? ORDER BY id DESC')
        .all(guildId) as unknown as AppealRow[]);

  return rows.map(rowToAppeal);
}
