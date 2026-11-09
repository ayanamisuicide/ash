import type {
  ActionRowBuilder,
  ContainerBuilder,
  Guild,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { card } from './card.js';

export interface LogField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface LogCardOptions {
  title: string;
  /** Готовый цвет акцентной полосы. Имеет приоритет над tone. */
  color?: number;
  /** Настроение лога: accent/success/danger/warn/info/neutral/premium. */
  tone?: 'accent' | 'success' | 'danger' | 'warn' | 'info' | 'neutral' | 'premium';
  description?: string | null;
  /** Строка автора с аватаром: кто совершил действие */
  actor?: { name: string; iconURL?: string | null };
  thumbnail?: string | null;
  fields?: LogField[];
  /** Дополнительная подпись слева от названия сервера */
  footer?: string;
  timestamp?: Date | number;
  image?: string | null;
  /** Кнопки действий под логом (например, «Отменить действие»). */
  buttons?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

/**
 * Единый визуальный шаблон для всех логов.
 * Использует современные Components V2: контейнер, секции и разделители.
 */
export function logCard(guild: Guild, options: LogCardOptions): ContainerBuilder {
  return card({
    tone: options.tone ?? 'accent',
    color: options.color,
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
    buttons: options.buttons,
  });
}
