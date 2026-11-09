import type { AuditLogEvent, Guild, GuildAuditLogsEntry, User } from 'discord.js';

const TTL_MS = 3_000;
const RETRY_DELAY_MS = 1_200;
const FRESH_MS = 30_000;
const MAX_CACHE = 300;

const cache = new Map<string, { at: number; entries: GuildAuditLogsEntry[] }>();

async function fetchEntries(
  guild: Guild,
  type: AuditLogEvent,
  force = false,
): Promise<GuildAuditLogsEntry[]> {
  const key = `${guild.id}:${type}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.entries;

  const logs = await guild.fetchAuditLogs({ type, limit: 10 }).catch(() => null);

  const entries = logs ? [...logs.entries.values()] : [];
  cache.set(key, { at: Date.now(), entries });
  if (cache.size > MAX_CACHE) cache.clear();
  return entries;
}

/**
 * Ищет свежую запись аудита нужного типа.
 * Discord добавляет запись с небольшой задержкой, поэтому делаем 1–2 попытки.
 */
export async function findAuditEntry(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string | null,
  retries = 1,
): Promise<GuildAuditLogsEntry | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const entries = await fetchEntries(guild, type, attempt > 0);
    const recent = entries.filter((entry) => Date.now() - entry.createdTimestamp < FRESH_MS);
    const match = targetId ? recent.find((entry) => entry.targetId === targetId) : recent[0];

    if (match) return match;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return null;
}

export interface AuditInfo {
  executor: User | null;
  reason: string | null;
}

interface AuditActor {
  id: string;
  tag?: string | null;
  username?: string | null;
}

const MODERATOR_REASON = /^Модератор\s+(\d{17,20}):\s*([\s\S]*)$/;

/**
 * Discord хранит причину так, как её передали в API: `Модератор 123: текст`.
 * В логах вместо сырого ID показываем тег исполнителя, а если его нет —
 * кликабельное упоминание.
 */
export function formatAuditReason(reason: string | null, actor: AuditActor | null): string | null {
  if (!reason) return null;

  return reason.replace(MODERATOR_REASON, (_match, id: string, text: string) => {
    const label = actor && actor.id === id ? actor.tag || actor.username || `<@${id}>` : `<@${id}>`;
    return `Модератор ${label}: ${text}`;
  });
}

/** Возвращает исполнителя и причину действия из аудита */
export async function auditInfo(
  guild: Guild,
  type: AuditLogEvent,
  targetId?: string | null,
  retries = 1,
): Promise<AuditInfo> {
  const entry = await findAuditEntry(guild, type, targetId, retries);
  const executor = entry?.executor;
  const user = executor && !executor.partial ? executor : null;
  return {
    executor: user,
    reason: formatAuditReason(entry?.reason ?? null, user),
  };
}
