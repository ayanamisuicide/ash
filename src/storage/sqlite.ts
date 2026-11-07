import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const rawDbFile = process.env.DB_FILE?.trim();
export const DB_FILE =
  !rawDbFile
    ? path.join(ROOT, 'data', 'bot.sqlite')
    : rawDbFile === ':memory:'
      ? rawDbFile
      : path.resolve(rawDbFile);

const LEGACY_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(ROOT, 'data', 'data.json');

export const BACKUP_DIR =
  DB_FILE === ':memory:'
    ? ''
    : process.env.DB_BACKUP_DIR
      ? path.resolve(process.env.DB_BACKUP_DIR)
      : path.join(path.dirname(DB_FILE), 'backups');

if (DB_FILE !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
}

export const db = new DatabaseSync(DB_FILE);
let backupTimer: NodeJS.Timeout | null = null;
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

interface Migration {
  version: number;
  up: () => void;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS guilds (
          id TEXT PRIMARY KEY,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS guild_logs (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          channel_id TEXT,
          categories TEXT NOT NULL DEFAULT '{}',
          events TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS warns (
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          moderator_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (guild_id, user_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_warns_guild_user
          ON warns(guild_id, user_id, created_at);

        CREATE TABLE IF NOT EXISTS cases (
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          id INTEGER NOT NULL,
          type TEXT NOT NULL,
          user_id TEXT,
          moderator_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          active INTEGER NOT NULL DEFAULT 1,
          extra TEXT NOT NULL DEFAULT '{}',
          PRIMARY KEY (guild_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_cases_guild_user
          ON cases(guild_id, user_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_cases_expires
          ON cases(active, expires_at);

        CREATE TABLE IF NOT EXISTS case_counters (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          next_id INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS notes (
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          id TEXT NOT NULL,
          text TEXT NOT NULL,
          author_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (guild_id, user_id, id)
        );
        CREATE INDEX IF NOT EXISTS idx_notes_guild_user
          ON notes(guild_id, user_id, created_at);

        CREATE TABLE IF NOT EXISTS appeals (
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          id INTEGER NOT NULL,
          user_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          channel_id TEXT,
          message_id TEXT,
          reviewed_by TEXT,
          reviewed_at INTEGER,
          PRIMARY KEY (guild_id, id)
        );

        CREATE TABLE IF NOT EXISTS appeal_counters (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          next_id INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS moderation_settings (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          immunity_roles TEXT NOT NULL DEFAULT '[]',
          report_channel_id TEXT,
          appeal_channel_id TEXT,
          mute_role_id TEXT,
          warn_actions TEXT NOT NULL DEFAULT '[]',
          automod TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS locks (
          guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
          channel_id TEXT NOT NULL,
          allow TEXT NOT NULL DEFAULT '0',
          deny TEXT NOT NULL DEFAULT '0',
          PRIMARY KEY (guild_id, channel_id)
        );
      `);
    },
  },
  {
    version: 2,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS security_settings (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          raid_config TEXT NOT NULL DEFAULT '{}',
          nuke_config TEXT NOT NULL DEFAULT '{}'
        );
      `);
    },
  },
  {
    version: 3,
    up: () => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS security_runtime (
          guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
          raid_until INTEGER NOT NULL DEFAULT 0,
          raid_joins TEXT NOT NULL DEFAULT '[]',
          nuke_state TEXT NOT NULL DEFAULT '{}',
          updated_at INTEGER NOT NULL DEFAULT 0
        );
      `);
    },
  },
];

function currentSchemaVersion(): number {
  const row = db.prepare('PRAGMA user_version').get() as
    | { user_version: number }
    | undefined;
  return Number(row?.user_version ?? 0);
}

function runMigrations(): void {
  let current = currentSchemaVersion();

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (migration.version <= current) continue;

    db.exec('BEGIN IMMEDIATE');
    try {
      migration.up();
      db.exec(`PRAGMA user_version = ${migration.version};`);
      db.exec('COMMIT');
      current = migration.version;
      console.log(`[db] миграция схемы ${migration.version} применена`);
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    }
  }
}

runMigrations();

export function ensureGuild(guildId: string): void {
  if (!guildId) return;
  db.prepare('INSERT OR IGNORE INTO guilds (id, created_at) VALUES (?, ?)').run(
    guildId,
    Date.now(),
  );
}

export function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function closeDatabase(): void {
  try {
    db.close();
  } catch (error) {
    console.error('[db] не удалось закрыть SQLite:', error);
  }
}

function pruneBackups(): void {
  if (!BACKUP_DIR) return;

  const rawKeep = Number(process.env.DB_BACKUP_KEEP ?? 7);
  const keep = Number.isFinite(rawKeep) && rawKeep >= 1 ? Math.floor(rawKeep) : 7;

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('bot-') && name.endsWith('.sqlite'))
    .sort();

  for (const name of files.slice(0, Math.max(0, files.length - keep))) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, name));
    } catch {
      // ignore cleanup errors
    }
  }
}

/** Делает консистентную копию SQLite через VACUUM INTO */
export function backupDatabase(): string | null {
  if (DB_FILE === ':memory:' || !BACKUP_DIR) return null;

  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(BACKUP_DIR, `bot-${stamp}.sqlite`);
    const escaped = target.replace(/'/g, "''");
    db.exec(`VACUUM INTO '${escaped}';`);
    pruneBackups();
    console.log(`[db] backup: ${target}`);
    return target;
  } catch (error) {
    console.error('[db] не удалось сделать backup:', error);
    return null;
  }
}

export function startDatabaseBackups(): void {
  if (DB_FILE === ':memory:' || backupTimer) return;

  const rawHours = Number(process.env.DB_BACKUP_INTERVAL_HOURS ?? 6);
  const hours = Number.isFinite(rawHours) && rawHours >= 0 ? rawHours : 6;

  if (hours === 0) {
    console.log('[db] авто-бэкап выключен');
    return;
  }

  backupDatabase();
  backupTimer = setInterval(() => backupDatabase(), hours * 3_600_000);
  backupTimer.unref?.();
  console.log(`[db] авто-бэкап каждые ${hours} ч`);
}

export function stopDatabaseBackups(): void {
  if (!backupTimer) return;
  clearInterval(backupTimer);
  backupTimer = null;
}

function getMeta(key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function loadLegacyJson(): Record<string, unknown> | null {
  for (const file of [LEGACY_FILE, `${LEGACY_FILE}.bak`]) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (file !== LEGACY_FILE) {
          console.warn('[db] основной JSON повреждён, миграция из backup');
        }
        return parsed as Record<string, unknown>;
      }
      console.warn(`[db] файл ${file} имеет неверный формат`);
    } catch (error) {
      console.warn(`[db] не удалось прочитать ${file}:`, error);
    }
  }
  return null;
}

function importLegacy(data: Record<string, unknown>): void {
  const guilds = asRecord(data.guilds);

  const insertLogs = db.prepare(`
    INSERT INTO guild_logs (guild_id, channel_id, categories, events)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      channel_id = excluded.channel_id,
      categories = excluded.categories,
      events = excluded.events
  `);
  const insertWarn = db.prepare(`
    INSERT OR IGNORE INTO warns
      (guild_id, user_id, id, moderator_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCase = db.prepare(`
    INSERT OR IGNORE INTO cases
      (guild_id, id, type, user_id, moderator_id, reason, created_at, expires_at, active, extra)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertCaseCounter = db.prepare(`
    INSERT INTO case_counters (guild_id, next_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET next_id = MAX(next_id, excluded.next_id)
  `);
  const insertNote = db.prepare(`
    INSERT OR IGNORE INTO notes
      (guild_id, user_id, id, text, author_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAppeal = db.prepare(`
    INSERT OR IGNORE INTO appeals
      (guild_id, id, user_id, reason, status, created_at, channel_id, message_id, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertAppealCounter = db.prepare(`
    INSERT INTO appeal_counters (guild_id, next_id) VALUES (?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET next_id = MAX(next_id, excluded.next_id)
  `);
  const upsertModeration = db.prepare(`
    INSERT INTO moderation_settings
      (guild_id, immunity_roles, report_channel_id, appeal_channel_id, mute_role_id, warn_actions, automod)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(guild_id) DO UPDATE SET
      immunity_roles = excluded.immunity_roles,
      report_channel_id = excluded.report_channel_id,
      appeal_channel_id = excluded.appeal_channel_id,
      mute_role_id = excluded.mute_role_id,
      warn_actions = excluded.warn_actions,
      automod = excluded.automod
  `);
  const insertLock = db.prepare(`
    INSERT OR REPLACE INTO locks (guild_id, channel_id, allow, deny)
    VALUES (?, ?, ?, ?)
  `);

  let importedGuilds = 0;
  let importedWarns = 0;
  let importedCases = 0;

  for (const [guildId, guildRaw] of Object.entries(guilds)) {
    if (!guildId) continue;
    ensureGuild(guildId);
    importedGuilds++;
    const guild = asRecord(guildRaw);

    const settings = asRecord(guild.settings);
    const logs = asRecord(guild.logs);
    const logsChannel =
      asString(logs.channelId) || asString(settings.logsChannel) || null;

    if (Object.keys(logs).length > 0 || logsChannel) {
      insertLogs.run(
        guildId,
        logsChannel,
        toJson(asRecord(logs.categories)),
        toJson(asRecord(logs.events)),
      );
    }

    const warns = asRecord(guild.warns);
    for (const [userId, listRaw] of Object.entries(warns)) {
      for (const warnRaw of asArray(listRaw)) {
        const warn = asRecord(warnRaw);
        insertWarn.run(
          guildId,
          userId,
          asString(warn.id) || Math.random().toString(36).slice(2, 8),
          asString(warn.moderatorId) || '0',
          asString(warn.reason) || 'Без причины',
          asNumber(warn.createdAt, Date.now()),
        );
        importedWarns++;
      }
    }

    const cases = asRecord(guild.cases);
    const caseItems = asArray(cases.items);
    let maxCaseId = 0;
    for (const caseRaw of caseItems) {
      const item = asRecord(caseRaw);
      const id = asNumber(item.id, 0);
      if (id <= 0) continue;
      maxCaseId = Math.max(maxCaseId, id);
      insertCase.run(
        guildId,
        id,
        asString(item.type) || 'warn',
        typeof item.userId === 'string' ? item.userId : null,
        asString(item.moderatorId) || '0',
        asString(item.reason) || 'Без причины',
        asNumber(item.createdAt, Date.now()),
        typeof item.expiresAt === 'number' ? item.expiresAt : null,
        asBoolean(item.active, true) ? 1 : 0,
        toJson(asRecord(item.extra)),
      );
      importedCases++;
    }
    if (Object.keys(cases).length > 0) {
      const nextId = Math.max(asNumber(cases.nextId, 1), maxCaseId + 1);
      upsertCaseCounter.run(guildId, nextId);
    }

    const notes = asRecord(guild.notes);
    for (const [userId, listRaw] of Object.entries(notes)) {
      for (const noteRaw of asArray(listRaw)) {
        const note = asRecord(noteRaw);
        insertNote.run(
          guildId,
          userId,
          asString(note.id) || Math.random().toString(36).slice(2, 8),
          asString(note.text) || '',
          asString(note.authorId) || '0',
          asNumber(note.createdAt, Date.now()),
        );
      }
    }

    const appeals = asRecord(guild.appeals);
    const appealItems = asArray(appeals.items);
    let maxAppealId = 0;
    for (const appealRaw of appealItems) {
      const item = asRecord(appealRaw);
      const id = asNumber(item.id, 0);
      if (id <= 0) continue;
      maxAppealId = Math.max(maxAppealId, id);
      insertAppeal.run(
        guildId,
        id,
        asString(item.userId) || '0',
        asString(item.reason) || '',
        asString(item.status) || 'pending',
        asNumber(item.createdAt, Date.now()),
        typeof item.channelId === 'string' ? item.channelId : null,
        typeof item.messageId === 'string' ? item.messageId : null,
        typeof item.reviewedBy === 'string' ? item.reviewedBy : null,
        typeof item.reviewedAt === 'number' ? item.reviewedAt : null,
      );
    }
    if (Object.keys(appeals).length > 0) {
      const nextId = Math.max(asNumber(appeals.nextId, 1), maxAppealId + 1);
      upsertAppealCounter.run(guildId, nextId);
    }

    const moderation = asRecord(guild.moderation);
    if (Object.keys(moderation).length > 0) {
      upsertModeration.run(
        guildId,
        toJson(asArray(moderation.immunityRoles)),
        typeof moderation.reportChannelId === 'string'
          ? moderation.reportChannelId
          : null,
        typeof moderation.appealChannelId === 'string'
          ? moderation.appealChannelId
          : null,
        typeof moderation.muteRoleId === 'string' ? moderation.muteRoleId : null,
        toJson(asArray(moderation.warnActions)),
        toJson(asRecord(moderation.automod)),
      );
    }

    const locks = asRecord(guild.locks);
    for (const [channelId, stateRaw] of Object.entries(locks)) {
      const state = asRecord(stateRaw);
      if (Object.keys(state).length === 0) continue;
      insertLock.run(
        guildId,
        channelId,
        asString(state.allow, '0'),
        asString(state.deny, '0'),
      );
    }
  }

  console.log(
    `[db] миграция JSON → SQLite: серверов ${importedGuilds}, варнов ${importedWarns}, кейсов ${importedCases}`,
  );
}

function migrateLegacyJson(): void {
  if (getMeta('legacy_json_migrated')) return;

  const existing = db
    .prepare('SELECT COUNT(*) AS count FROM guilds')
    .get() as { count: number } | undefined;
  if (Number(existing?.count ?? 0) > 0) {
    // База уже содержит данные (например, создана более ранней версией) —
    // не пытаемся повторно импортировать поверх неё.
    setMeta('legacy_json_migrated', 'existing-sqlite');
    return;
  }

  if (!fs.existsSync(LEGACY_FILE) && !fs.existsSync(`${LEGACY_FILE}.bak`)) {
    setMeta('legacy_json_migrated', 'no-legacy-file');
    return;
  }

  const legacy = loadLegacyJson();
  if (!legacy) {
    throw new Error(
      `[db] не удалось прочитать старый JSON (${LEGACY_FILE}). Исправьте файл или удалите его.`,
    );
  }

  transaction(() => {
    importLegacy(legacy);
    setMeta('legacy_json_migrated', new Date().toISOString());
  });
}

migrateLegacyJson();
