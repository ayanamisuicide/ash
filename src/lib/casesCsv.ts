import { caseTypeLabel, type ModCase } from './cases.js';

/** Значения с разделителем, кавычками или переводом строки берём в кавычки. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvDate(timestamp: number | null): string {
  if (!timestamp) return '';
  return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * CSV для Excel: разделитель «;», CRLF и BOM добавляет вызывающая сторона.
 * Колонки — то, что реально есть в таблице кейсов.
 */
export function casesToCsv(items: ModCase[]): string {
  const lines = [
    ['ID', 'Тип', 'Участник', 'Модератор', 'Причина', 'Создан', 'Истекает', 'Активен']
      .map(csvCell)
      .join(';'),
  ];

  for (const item of items) {
    lines.push(
      [
        item.id,
        caseTypeLabel(item.type),
        item.userId,
        item.moderatorId,
        item.reason,
        csvDate(item.createdAt),
        csvDate(item.expiresAt),
        item.active ? 'да' : 'нет',
      ]
        .map(csvCell)
        .join(';'),
    );
  }

  return lines.join('\r\n');
}
