import crypto from 'node:crypto';
import { db } from '../storage/sqlite.js';
import type { DiscordUser } from './discord.js';
export interface Session {
  id: string;
  user: DiscordUser;
  csrf: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

interface SessionRow {
  id: string;
  user_id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  csrf: string;
  created_at: number;
  expires_at: number;
  last_seen_at: number;
}

/** last_seen_at пишем в SQLite не чаще раза в минуту, чтобы не нагружать БД. */
const LAST_SEEN_WRITE_MS = 60_000;

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    user: {
      id: row.user_id,
      username: row.username,
      globalName: row.global_name,
      avatar: row.avatar,
    },
    csrf: row.csrf,
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}

/**
 * Серверные сессии в SQLite. Вход через Discord переживает перезапуск бота:
 * кука хранит только случайный id, профиль и CSRF-токен лежат в таблице
 * web_sessions и удаляются по истечении TTL.
 */
export class SessionStore {
  constructor(private readonly ttlMs: number) {}

  create(user: DiscordUser): Session {
    const now = Date.now();
    const session: Session = {
      id: randomToken(32),
      user,
      csrf: randomToken(24),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      lastSeenAt: now,
    };

    db.prepare(
      `INSERT INTO web_sessions
        (id, user_id, username, global_name, avatar, csrf, created_at, expires_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session.id,
      user.id,
      user.username,
      user.globalName,
      user.avatar,
      session.csrf,
      session.createdAt,
      session.expiresAt,
      session.lastSeenAt,
    );

    return session;
  }

  get(id: string | null | undefined): Session | null {
    if (!id) return null;

    const row = db
      .prepare(
        `SELECT id, user_id, username, global_name, avatar, csrf,
                created_at, expires_at, last_seen_at
           FROM web_sessions
          WHERE id = ?`,
      )
      .get(id) as SessionRow | undefined;

    if (!row) return null;

    const now = Date.now();
    if (Number(row.expires_at) <= now) {
      this.destroy(id);
      return null;
    }

    if (now - Number(row.last_seen_at) >= LAST_SEEN_WRITE_MS) {
      db.prepare('UPDATE web_sessions SET last_seen_at = ? WHERE id = ?').run(now, id);
    }

    const session = rowToSession(row);
    session.lastSeenAt = now;
    return session;
  }

  destroy(id: string | null | undefined): void {
    if (id) db.prepare('DELETE FROM web_sessions WHERE id = ?').run(id);
  }

  prune(): void {
    db.prepare('DELETE FROM web_sessions WHERE expires_at <= ?').run(Date.now());
  }
}

export function csrfMatches(session: Session, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(session.csrf);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
