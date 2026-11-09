const numberFormatter = new Intl.NumberFormat('ru-RU');
const relativeFormatter = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const timeFormatter = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function formatNumber(value: number): string {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatRelativeTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '—';

  const diff = timestamp - Date.now();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (abs < minute) return 'только что';
  if (abs < hour) return relativeFormatter.format(Math.round(diff / minute), 'minute');
  if (abs < day) return relativeFormatter.format(Math.round(diff / hour), 'hour');
  if (abs < 7 * day) return relativeFormatter.format(Math.round(diff / day), 'day');
  if (abs < 30 * day) return relativeFormatter.format(Math.round(diff / (7 * day)), 'week');
  if (abs < 365 * day) return relativeFormatter.format(Math.round(diff / (30 * day)), 'month');
  return relativeFormatter.format(Math.round(diff / (365 * day)), 'year');
}

export function formatDateTime(timestamp: number): string {
  return dateTimeFormatter.format(new Date(timestamp));
}

export function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

export function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const lastDigit = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (lastDigit > 1 && lastDigit < 5) return few;
  if (lastDigit === 1) return one;
  return many;
}

export function formatMembers(count: number): string {
  return `${formatNumber(count)} ${pluralizeRu(count, 'участник', 'участника', 'участников')}`;
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';

  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) return `${days} д ${hours} ч`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

export function pingTone(ping: number): 'success' | 'warning' | 'danger' {
  if (ping < 90) return 'success';
  if (ping < 160) return 'warning';
  return 'danger';
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}
