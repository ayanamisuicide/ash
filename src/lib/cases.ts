import { db, ensureGuild, parseJson, toJson, transaction } from '../storage/sqlite.js';

/**
 * Модерационные кейсы — единая история наказаний сервера.
 * В отличие от событийных логов, кейс живёт после действия и имеет номер,
 * по которому можно посмотреть/изменить наказание.
 */
export type CaseType =
  | 'ban'
  | 'tempban'
  | 'softban'
  | 'kick'
  | 'unban'
  | 'timeout'
  | 'untimeout'
  | 'mute'
  | 'unmute'
  | 'warn'
  | 'warnRemove'
  | 'note'
  | 'noteRemove'
  | 'voice'
  | 'nick'
  | 'role'
  | 'temprole'
  | 'lock'
  | 'unlock'
  | 'slowmode'
  | 'purge';

export interface ModCase {
  id: number;
  guildId: string;
  type: CaseType;
  userId: string | null;
  moderatorId: string;
  reason: string;
  createdAt: number;
  expiresAt: number | null;
  active: boolean;
  extra: Record<string, unknown>;
}

export interface CreateCaseInput {
  guildId: string;
  type: CaseType;
  userId?: string | null;
  moderatorId: string;
  reason: string;
  expiresAt?: number | null;
  active?: boolean;
  extra?: Record<string, unknown>;
}

interface CaseRow {
  guild_id: string;
  id: number;
  type: string;
  user_id: string | null;
  moderator_id: string;
  reason: string;
  created_at: number;
  expires_at: number | null;
  active: number;
  extra: string;
}

function rowToCase(row: CaseRow): ModCase {
  return {
    id: Number(row.id),
    guildId: row.guild_id,
    type: row.type as CaseType,
    userId: row.user_id,
    moderatorId: row.moderator_id,
    reason: row.reason,
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
    active: row.active === 1,
    extra: parseJson<Record<string, unknown>>(row.extra, {}),
  };
}

export function createCase(input: CreateCaseInput): ModCase {
  ensureGuild(input.guildId);

  return transaction(() => {
    db.prepare('INSERT OR IGNORE INTO case_counters (guild_id, next_id) VALUES (?, 1)').run(
      input.guildId,
    );

    const counter = db
      .prepare('SELECT next_id FROM case_counters WHERE guild_id = ?')
      .get(input.guildId) as { next_id: number } | undefined;

    const id = Number(counter?.next_id ?? 1);
    db.prepare('UPDATE case_counters SET next_id = next_id + 1 WHERE guild_id = ?').run(
      input.guildId,
    );

    const entry: ModCase = {
      id,
      guildId: input.guildId,
      type: input.type,
      userId: input.userId ?? null,
      moderatorId: input.moderatorId,
      reason: input.reason,
      createdAt: Date.now(),
      expiresAt: input.expiresAt ?? null,
      active: input.active ?? true,
      extra: input.extra ?? {},
    };

    db.prepare(
      `
      INSERT INTO cases
        (guild_id, id, type, user_id, moderator_id, reason, created_at, expires_at, active, extra)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      entry.guildId,
      entry.id,
      entry.type,
      entry.userId,
      entry.moderatorId,
      entry.reason,
      entry.createdAt,
      entry.expiresAt,
      entry.active ? 1 : 0,
      toJson(entry.extra),
    );

    return entry;
  });
}

export function getCase(guildId: string, caseId: number): ModCase | null {
  const row = db
    .prepare('SELECT * FROM cases WHERE guild_id = ? AND id = ?')
    .get(guildId, caseId) as CaseRow | undefined;
  return row ? rowToCase(row) : null;
}

export function listCases(guildId: string, userId?: string | null, limit = 25): ModCase[] {
  const rows = userId
    ? (db
        .prepare('SELECT * FROM cases WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?')
        .all(guildId, userId, limit) as unknown as CaseRow[])
    : (db
        .prepare('SELECT * FROM cases WHERE guild_id = ? ORDER BY id DESC LIMIT ?')
        .all(guildId, limit) as unknown as CaseRow[]);

  return rows.map(rowToCase);
}

export interface CaseSearchOptions {
  /** Страница начиная с 1 */
  page?: number;
  /** Размер страницы, 1..100 */
  pageSize?: number;
  type?: CaseType | null;
  userId?: string | null;
  moderatorId?: string | null;
  active?: boolean | null;
  /** Поиск по причине, ID участника или модератора */
  query?: string | null;
}

export interface CaseSearchResult {
  items: ModCase[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/** Экранирует спецсимволы LIKE (\, %, _), чтобы поиск по «%» не находил всё подряд */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** Поиск кейсов с фильтрами и пагинацией для веб-панели */
export function searchCases(guildId: string, options: CaseSearchOptions = {}): CaseSearchResult {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 25)));

  const where = ['guild_id = ?'];
  const values: Array<string | number> = [guildId];

  if (options.type) {
    where.push('type = ?');
    values.push(options.type);
  }
  if (options.userId) {
    where.push('user_id = ?');
    values.push(options.userId);
  }
  if (options.moderatorId) {
    where.push('moderator_id = ?');
    values.push(options.moderatorId);
  }
  if (typeof options.active === 'boolean') {
    where.push('active = ?');
    values.push(options.active ? 1 : 0);
  }

  const query = options.query?.trim();
  if (query) {
    where.push(
      "(reason LIKE ? ESCAPE '\\' OR user_id LIKE ? ESCAPE '\\' OR moderator_id LIKE ? ESCAPE '\\')",
    );
    const like = `%${escapeLike(query)}%`;
    values.push(like, like, like);
  }

  const clause = where.join(' AND ');
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM cases WHERE ${clause}`)
    .get(...values) as { count: number } | undefined;
  const total = Number(totalRow?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const rows = db
    .prepare(`SELECT * FROM cases WHERE ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...values, pageSize, (page - 1) * pageSize) as unknown as CaseRow[];

  return {
    items: rows.map(rowToCase),
    total,
    page: Math.min(page, pages),
    pageSize,
    pages,
  };
}

export function updateCase(
  guildId: string,
  caseId: number,
  patch: Partial<Omit<ModCase, 'id' | 'guildId'>>,
): ModCase | null {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.type !== undefined) {
    sets.push('type = ?');
    values.push(patch.type);
  }
  if (patch.userId !== undefined) {
    sets.push('user_id = ?');
    values.push(patch.userId);
  }
  if (patch.moderatorId !== undefined) {
    sets.push('moderator_id = ?');
    values.push(patch.moderatorId);
  }
  if (patch.reason !== undefined) {
    sets.push('reason = ?');
    values.push(patch.reason);
  }
  if (patch.createdAt !== undefined) {
    sets.push('created_at = ?');
    values.push(patch.createdAt);
  }
  if (patch.expiresAt !== undefined) {
    sets.push('expires_at = ?');
    values.push(patch.expiresAt);
  }
  if (patch.active !== undefined) {
    sets.push('active = ?');
    values.push(patch.active ? 1 : 0);
  }
  if (patch.extra !== undefined) {
    sets.push('extra = ?');
    values.push(toJson(patch.extra));
  }

  if (sets.length === 0) return getCase(guildId, caseId);

  values.push(guildId, caseId);
  db.prepare(`UPDATE cases SET ${sets.join(', ')} WHERE guild_id = ? AND id = ?`).run(...values);

  return getCase(guildId, caseId);
}

export function closeCase(guildId: string, caseId: number, reason?: string): ModCase | null {
  const current = getCase(guildId, caseId);
  if (!current) return null;
  return updateCase(guildId, caseId, {
    active: false,
    extra: reason ? { ...current.extra, closedReason: reason } : current.extra,
  });
}

/** Активные кейсы с истёкшим сроком — для планировщика */
export function expiredCases(guildId: string, now = Date.now()): ModCase[] {
  const rows = db
    .prepare(
      `
      SELECT * FROM cases
      WHERE guild_id = ? AND active = 1 AND expires_at IS NOT NULL AND expires_at <= ?
      ORDER BY expires_at ASC
    `,
    )
    .all(guildId, now) as unknown as CaseRow[];

  return rows.map(rowToCase);
}

export function findCaseByWarnId(guildId: string, userId: string, warnId: string): ModCase | null {
  const rows = db
    .prepare(
      `
      SELECT * FROM cases
      WHERE guild_id = ? AND user_id = ? AND type = 'warn'
      ORDER BY id DESC
    `,
    )
    .all(guildId, userId) as unknown as CaseRow[];

  return rows.map(rowToCase).find((item) => item.extra.warnId === warnId) ?? null;
}

export function closeActiveCases(
  guildId: string,
  userId: string,
  types: CaseType[],
  reason?: string,
): number {
  if (types.length === 0) return 0;

  return transaction(() => {
    const placeholders = types.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
        SELECT * FROM cases
        WHERE guild_id = ? AND user_id = ? AND active = 1
          AND type IN (${placeholders})
      `,
      )
      .all(guildId, userId, ...types) as unknown as CaseRow[];

    for (const row of rows) {
      const item = rowToCase(row);
      updateCase(guildId, item.id, {
        active: false,
        extra: reason ? { ...item.extra, closedReason: reason } : item.extra,
      });
    }

    return rows.length;
  });
}

export function closeWarnCases(guildId: string, userId: string): ModCase[] {
  return transaction(() => {
    const rows = db
      .prepare(
        `
        SELECT * FROM cases
        WHERE guild_id = ? AND user_id = ? AND type = 'warn' AND active = 1
        ORDER BY id ASC
      `,
      )
      .all(guildId, userId) as unknown as CaseRow[];

    const closed: ModCase[] = [];
    for (const row of rows) {
      const item = rowToCase(row);
      const updated = updateCase(guildId, item.id, {
        active: false,
        extra: { ...item.extra, closedReason: 'Снятие предупреждений' },
      });
      if (updated) closed.push(updated);
    }

    return closed;
  });
}

const CASE_TYPE_VALUES: CaseType[] = [
  'ban',
  'tempban',
  'softban',
  'kick',
  'unban',
  'timeout',
  'untimeout',
  'mute',
  'unmute',
  'warn',
  'warnRemove',
  'note',
  'noteRemove',
  'voice',
  'nick',
  'role',
  'temprole',
  'lock',
  'unlock',
  'slowmode',
  'purge',
];

export interface CaseTypeCount {
  type: CaseType;
  count: number;
}

/**
 * Агрегированная статистика по типам кейсов.
 * Считается в SQL, чтобы не тянуть тысячи строк в память ради `/modstats`.
 */
export function countCasesByType(
  guildId: string,
  options: { moderatorId?: string | null } = {},
): CaseTypeCount[] {
  const values: Array<string> = [guildId];
  let where = 'guild_id = ?';
  if (options.moderatorId) {
    where += ' AND moderator_id = ?';
    values.push(options.moderatorId);
  }

  const rows = db
    .prepare(
      `
      SELECT type, COUNT(*) AS count
      FROM cases
      WHERE ${where}
      GROUP BY type
      ORDER BY count DESC
    `,
    )
    .all(...values) as unknown as Array<{ type: string; count: number }>;

  return rows.map((row) => ({ type: row.type as CaseType, count: Number(row.count) }));
}

export function isCaseType(value: unknown): value is CaseType {
  return typeof value === 'string' && CASE_TYPE_VALUES.includes(value as CaseType);
}

export function caseTypeLabel(type: CaseType): string {
  const labels: Record<CaseType, string> = {
    ban: 'Бан',
    tempban: 'Временный бан',
    softban: 'Софтбан',
    kick: 'Кик',
    unban: 'Разбан',
    timeout: 'Таймаут',
    untimeout: 'Снятие таймаута',
    mute: 'Мут',
    unmute: 'Снятие мута',
    warn: 'Предупреждение',
    warnRemove: 'Снятие предупреждения',
    note: 'Заметка',
    noteRemove: 'Удаление заметки',
    voice: 'Голосовое действие',
    nick: 'Изменение ника',
    role: 'Изменение роли',
    temprole: 'Временная роль',
    lock: 'Блокировка канала',
    unlock: 'Разблокировка канала',
    slowmode: 'Медленный режим',
    purge: 'Очистка сообщений',
  };
  return labels[type] ?? type;
}
