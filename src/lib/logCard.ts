import type { ContainerBuilder, Guild } from 'discord.js';
import { card } from './card.js';
import { COLORS } from './embeds.js';

export interface LogField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface LogCardOptions {
  title: string;
  color?: number;
  description?: string | null;
  /** Строка автора с аватаром: кто совершил действие */
  actor?: { name: string; iconURL?: string | null };
  thumbnail?: string | null;
  fields?: LogField[];
  /** Дополнительная подпись слева от названия сервера */
  footer?: string;
  timestamp?: Date | number;
  image?: string | null;
}

/**
 * Единый визуальный шаблон для всех логов.
 * Использует современные Components V2: контейнер, секции и разделители.
 */
export function logCard(guild: Guild, options: LogCardOptions): ContainerBuilder {
  return card({
    color: options.color ?? COLORS.primary,
    title: options.title,
    subtitle: options.actor?.name ?? null,
    description: options.description ?? null,
    fields: options.fields?.map((field) => ({
      label: field.name,
      value: field.value,
      block: !field.inline,
    })),
    thumbnail: options.thumbnail ?? options.actor?.iconURL ?? null,
    footer: options.footer ? `${options.footer} · ${guild.name}` : guild.name,
    timestamp: options.timestamp ?? Date.now(),
  });
}
