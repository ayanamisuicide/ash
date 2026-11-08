import crypto from 'node:crypto';
import type { DiscordUser } from './discord.js';
export interface Session {
  id: string;
  user: DiscordUser;
  csrf: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Серверные сессии в памяти. При рестарте панели пользователи просто
 * авторизуются заново — отдельная таблица в SQLite для этого не нужна.
 */
export class SessionStore {
  private readonly sessions = new Map<string, Session>();

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
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string | null | undefined): Session | null {
    if (!id) return null;
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      return null;
    }
    session.lastSeenAt = Date.now();
    return session;
  }

  destroy(id: string | null | undefined): void {
    if (id) this.sessions.delete(id);
  }

  prune(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }
}

export function csrfMatches(session: Session, token: unknown): boolean {
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(session.csrf);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
