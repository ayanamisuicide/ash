import type { AutomodAction, WarnActionType } from '@/api/types';
import { formatUptime } from '@/lib/format';

export const WARN_ACTION_LABELS: Record<WarnActionType, string> = {
  timeout: 'Таймаут',
  mute: 'Мут',
  kick: 'Кик',
  ban: 'Бан',
  tempban: 'Временный бан',
};

export const AUTOMOD_ACTION_LABELS: Record<AutomodAction, string> = {
  delete: 'Только удалить сообщение',
  warn: 'Выдать варн',
  timeout: 'Таймаут',
  mute: 'Мут',
  kick: 'Кик',
  ban: 'Бан',
};

export const AUTOMOD_ACTIONS: AutomodAction[] = [
  'delete',
  'warn',
  'timeout',
  'mute',
  'kick',
  'ban',
];

export function warnActionNeedsDuration(action: WarnActionType): boolean {
  return action === 'timeout' || action === 'mute' || action === 'tempban';
}

export function automodActionNeedsDuration(action: AutomodAction): boolean {
  return action === 'timeout' || action === 'mute';
}

/** "10m", "1h", "7d" -> миллисекунды; null при неверном формате */
export function parseDurationToMs(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;

  const match = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(text);
  if (!match || match.slice(1).every((value) => value === undefined)) return null;

  const [, weeks, days, hours, minutes, seconds] = match;
  const totalMs =
    Number(weeks ?? 0) * 604_800_000 +
    Number(days ?? 0) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000;

  return totalMs > 0 ? totalMs : null;
}

/** Миллисекунды -> компактная строка для input: "1d 2h" -> "1d2h" */
export function durationToInput(ms: number | null): string {
  if (!ms || ms <= 0) return '';
  let rest = Math.floor(ms / 1_000);
  const parts: string[] = [];
  const units: Array<[string, number]> = [
    ['d', 86_400],
    ['h', 3_600],
    ['m', 60],
    ['s', 1],
  ];
  for (const [suffix, size] of units) {
    const value = Math.floor(rest / size);
    if (value > 0) parts.push(`${value}${suffix}`);
    rest %= size;
  }
  return parts.join('');
}

export const AUTOMOD_TOGGLES = [
  {
    key: 'invites',
    label: 'Приглашения',
    description: 'Удалять Discord-инвайты',
  },
  {
    key: 'links',
    label: 'Ссылки',
    description: 'Удалять внешние ссылки',
  },
  {
    key: 'caps',
    label: 'CAPS',
    description: 'Ловить сообщения капсом',
  },
  {
    key: 'spam',
    label: 'Спам',
    description: 'Повторяющиеся сообщения',
  },
] as const;

export type AutomodToggleKey = (typeof AUTOMOD_TOGGLES)[number]['key'];

export function formatDurationMs(ms: number | null): string {
  if (!ms || ms <= 0) return '—';
  return formatUptime(Math.floor(ms / 1_000));
}
