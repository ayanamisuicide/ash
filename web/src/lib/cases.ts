import type { CaseType } from '@/api/types';

/** Подписи совпадают с caseTypeLabel на бэкенде */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
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

export const CASE_TYPE_COLORS: Record<CaseType, string> = {
  ban: '#ff5f6d',
  tempban: '#ff7a85',
  softban: '#ff9aa2',
  kick: '#ffb020',
  unban: '#3dd68c',
  timeout: '#54b8ff',
  untimeout: '#7dd3fc',
  mute: '#a78bfa',
  unmute: '#c4b5fd',
  warn: '#ffb020',
  warnRemove: '#86efac',
  note: '#54b8ff',
  noteRemove: '#94a3b8',
  voice: '#8b5cf6',
  nick: '#6673ff',
  role: '#a78bfa',
  temprole: '#c084fc',
  lock: '#f472b6',
  unlock: '#3dd68c',
  slowmode: '#38bdf8',
  purge: '#94a3b8',
};

export type CaseTone = 'danger' | 'warn' | 'success' | 'info' | 'accent' | 'muted';

const CASE_TONES: Record<CaseType, CaseTone> = {
  ban: 'danger',
  tempban: 'danger',
  softban: 'danger',
  kick: 'warn',
  unban: 'success',
  timeout: 'info',
  untimeout: 'info',
  mute: 'info',
  unmute: 'info',
  warn: 'warn',
  warnRemove: 'success',
  note: 'info',
  noteRemove: 'muted',
  voice: 'accent',
  nick: 'accent',
  role: 'accent',
  temprole: 'accent',
  lock: 'accent',
  unlock: 'success',
  slowmode: 'info',
  purge: 'muted',
};

const CASE_BADGE_CLASSES: Record<CaseTone, string> = {
  danger: 'border-danger/25 bg-danger/10 text-danger',
  warn: 'border-warning/25 bg-warning/10 text-warning',
  success: 'border-success/25 bg-success/10 text-success',
  info: 'border-info/25 bg-info/10 text-info',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  muted: 'border-white/[0.08] bg-white/[0.04] text-muted-foreground',
};

export function caseTypeLabel(type: CaseType): string {
  return CASE_TYPE_LABELS[type] ?? type;
}

export function caseTypeColor(type: CaseType): string {
  return CASE_TYPE_COLORS[type] ?? '#6673ff';
}

export function caseTypeTone(type: CaseType): CaseTone {
  return CASE_TONES[type] ?? 'muted';
}

export function caseTypeBadgeClasses(type: CaseType): string {
  return CASE_BADGE_CLASSES[caseTypeTone(type)];
}
