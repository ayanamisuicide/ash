/**
 * Парсит длительность вида "10m", "1h", "2d", "1w", "30s" в миллисекунды.
 * Возвращает null, если формат неверный.
 */
export function parseDuration(str) {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(String(str).trim());
  if (!m) return null;
  const mult = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return Number(m[1]) * mult[m[2].toLowerCase()];
}

/** Миллисекунды -> человекочитаемая строка ("2д 3ч 5м") */
export function humanDuration(ms) {
  let s = Math.floor(ms / 1000);
  const parts = [];
  const units = [['д', 86400], ['ч', 3600], ['м', 60], ['с', 1]];
  for (const [label, size] of units) {
    const value = Math.floor(s / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      s -= value * size;
    }
  }
  return parts.join(' ') || '0с';
}

/**
 * Заменяет плейсхолдеры в шаблоне:
 * {user} -> упоминание, {username} -> ник, {server} -> название сервера,
 * {memberCount} -> число участников
 */
export function fillTemplate(template, ctx) {
  return String(template)
    .replaceAll('{user}', ctx.user ?? '')
    .replaceAll('{username}', ctx.username ?? '')
    .replaceAll('{server}', ctx.server ?? '')
    .replaceAll('{memberCount}', String(ctx.memberCount ?? ''));
}

/** Полоса прогресса 0..1 */
export function progressBar(ratio, length = 10) {
  const clamped = Math.max(0, Math.min(1, ratio));
  const full = Math.round(clamped * length);
  return '▰'.repeat(full) + '▱'.repeat(length - full);
}
