/**
 * Парсит длительность вида "10m", "1h", "2d", "1w", "1w2d3h" в миллисекунды.
 * Возвращает null при неверном формате.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '');
  if (!text) return null;

  const match = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(
    text,
  );
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

/** Миллисекунды -> человекочитаемая строка ("2д 3ч 5м") */
export function humanDuration(ms: number): string {
  let seconds = Math.floor(ms / 1_000);
  const parts: string[] = [];
  const units: Array<[string, number]> = [
    ['д', 86_400],
    ['ч', 3_600],
    ['м', 60],
    ['с', 1],
  ];

  for (const [label, size] of units) {
    const value = Math.floor(seconds / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      seconds -= value * size;
    }
  }
  return parts.join(' ') || '0с';
}
