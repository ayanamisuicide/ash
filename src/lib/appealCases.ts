import { caseTypeLabel, searchCases, type CaseType, type ModCase } from './cases.js';

/** Наказания, которые пользователь может обжаловать. */
const APPEALABLE_TYPES: CaseType[] = [
  'ban',
  'tempban',
  'softban',
  'kick',
  'timeout',
  'mute',
  'warn',
  'temprole',
  'voice',
];

const RECENT_MS = 30 * 86_400_000;

export function isAppealableCase(item: ModCase): boolean {
  return Boolean(item.userId) && APPEALABLE_TYPES.includes(item.type);
}

export function appealableCaseLabel(item: ModCase): string {
  return `#${item.id} · ${caseTypeLabel(item.type)}`;
}

/**
 * Активные наказания + недавно завершённые (кик/софтбан), чтобы можно было
 * обжаловать не только то, что ещё действует.
 */
export function listAppealableCases(guildId: string, userId: string): ModCase[] {
  const { items } = searchCases(guildId, { userId, pageSize: 100 });
  const now = Date.now();

  return items
    .filter((item) => isAppealableCase(item))
    .filter((item) => item.active || now - item.createdAt <= RECENT_MS)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.id - a.id)
    .slice(0, 25);
}

/** Для DM-апелляции: последний активный бан/временный бан пользователя. */
export function findLatestBanCase(guildId: string, userId: string): ModCase | null {
  const { items } = searchCases(guildId, { userId, pageSize: 50 });
  return (
    items.find((item) => (item.type === 'ban' || item.type === 'tempban') && item.active) ?? null
  );
}
