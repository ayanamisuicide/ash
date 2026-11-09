/**
 * Discord не принимает audit-log reason для bulk delete. Поэтому запоминаем
 * причину очистки на несколько секунд и подставляем её в событие
 * MessageBulkDelete, чтобы обычный лог не оставался без причины.
 */
export interface BulkDeleteReason {
  reason: string;
  moderatorId: string;
}

interface PendingReason {
  value: BulkDeleteReason;
  expiresAt: number;
}

const TTL_MS = 10_000;
const MAX_PENDING_PER_CHANNEL = 20;
const pending = new Map<string, PendingReason[]>();

export function markBulkDeleteReason(channelId: string, value: BulkDeleteReason): void {
  const entries = pending.get(channelId) ?? [];
  const now = Date.now();

  entries.push({ value, expiresAt: now + TTL_MS });
  pending.set(channelId, entries.slice(-MAX_PENDING_PER_CHANNEL));

  if (pending.size > 100) {
    for (const [key, list] of pending) {
      const alive = list.filter((entry) => entry.expiresAt >= now);
      if (alive.length === 0) pending.delete(key);
      else pending.set(key, alive);
    }
  }
}

export function consumeBulkDeleteReason(channelId: string): BulkDeleteReason | null {
  const entries = pending.get(channelId);
  if (!entries) return null;

  const now = Date.now();
  while (entries.length > 0) {
    const entry = entries.shift();
    if (!entry) break;
    if (entry.expiresAt >= now) {
      if (entries.length === 0) pending.delete(channelId);
      return entry.value;
    }
  }

  pending.delete(channelId);
  return null;
}
