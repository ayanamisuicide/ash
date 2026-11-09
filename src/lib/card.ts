import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { COLORS } from './colors.js';

/** Настроение карточки: задаёт цвет акцентной полосы и emoji по умолчанию */
export type CardTone = 'accent' | 'success' | 'danger' | 'warn' | 'info' | 'neutral' | 'premium';

/** Цвет акцентной полосы для каждого настроения */
export const TONE_COLORS: Record<CardTone, number> = {
  accent: COLORS.accent,
  success: COLORS.success,
  danger: COLORS.danger,
  warn: COLORS.warn,
  info: COLORS.info,
  neutral: COLORS.neutral,
  premium: COLORS.premium,
};

/** Emoji, который автоматически добавляется в начало заголовка */
export const TONE_EMOJI: Record<CardTone, string> = {
  accent: '🔷',
  success: '✅',
  danger: '❌',
  warn: '⚠️',
  info: 'ℹ️',
  neutral: '🔷',
  premium: '⭐',
};

const LEADING_EMOJI_RE = /^(?:\p{Extended_Pictographic}|<a?:[A-Za-z0-9_]+:\d+>)/u;

/**
 * Добавляет emoji в начало заголовка, если его там ещё нет.
 * Понимает обычные Unicode-эмодзи и кастомные emoji Discord.
 */
export function withEmoji(title: string, emoji: string): string {
  const trimmed = title.trimStart();
  return LEADING_EMOJI_RE.test(trimmed) ? title : `${emoji} ${title}`;
}

export interface CardField {
  label: string;
  value: string;
  /** true — значение с новой строки (для длинных причин) */
  block?: boolean;
}

export interface CardOptions {
  tone?: CardTone;
  /** Переопределяет цвет акцентной полосы */
  color?: number;
  title: string;
  /** Переопределяет emoji, который добавляется в начало заголовка */
  emoji?: string;
  /** Мелкая строка под заголовком */
  subtitle?: string | null;
  description?: string | null;
  fields?: CardField[];
  thumbnail?: string | null;
  footer?: string | null;
  /** false — не показывать время */
  timestamp?: Date | number | false;
  buttons?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  /** Дополнительные строки компонентов (селекты и т.п.) */
  rows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export const V2 = MessageFlags.IsComponentsV2;

/** Флаги для нового сообщения: Components V2 + опционально ephemeral */
export function v2Flags(ephemeral = false): number {
  return MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0);
}

function clamp(text: string, max = 4000): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Единая карточка бота: цветная полоса, заголовок, аватар,
 * аккуратные строки «ключ: значение» и подпись.
 */
export function card(options: CardOptions): ContainerBuilder {
  const tone = options.tone ?? 'accent';
  const container = new ContainerBuilder().setAccentColor(options.color ?? TONE_COLORS[tone]);

  const title = withEmoji(options.title, options.emoji ?? TONE_EMOJI[tone]);
  const headerLines = [`## ${title}`];
  if (options.subtitle) headerLines.push(`-# ${options.subtitle}`);
  const headerText = new TextDisplayBuilder().setContent(headerLines.join('\n'));

  if (options.thumbnail) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(headerText)
      .setThumbnailAccessory(new ThumbnailBuilder({ media: { url: options.thumbnail } }));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(headerText);
  }
  container.addSeparatorComponents(new SeparatorBuilder({ divider: true }));

  if (options.description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(clamp(options.description)),
    );
  }

  if (options.fields?.length) {
    // Пары «ключ: значение» группируем по 3 в ряд, как inline-поля embed.
    // Поля с block: true всегда занимают отдельную строку.
    const lines: string[] = [];
    let inlineRow: string[] = [];

    const flushInline = (): void => {
      if (inlineRow.length === 0) return;
      lines.push(inlineRow.join(' · '));
      inlineRow = [];
    };

    for (const field of options.fields) {
      if (field.block) {
        flushInline();
        lines.push(`**${field.label}**\n${field.value}`);
        continue;
      }

      inlineRow.push(`**${field.label}:** ${field.value}`);
      if (inlineRow.length >= 3) flushInline();
    }
    flushInline();

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(clamp(lines.join('\n'))),
    );
  }

  const meta: string[] = [];
  if (options.footer) meta.push(options.footer);
  if (options.timestamp !== false) {
    const ms = options.timestamp ? new Date(options.timestamp).getTime() : Date.now();
    meta.push(`<t:${Math.floor(ms / 1_000)}:R>`);
  }
  if (meta.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder({ divider: false }));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${meta.join(' · ')}`),
    );
  }

  const rows = [...(options.rows ?? []), ...(options.buttons ?? [])];
  if (rows.length > 0) container.addActionRowComponents(...rows);

  return container;
}

/** Короткая карточка ошибки */
export function errorCard(message: string): ContainerBuilder {
  return card({
    tone: 'danger',
    title: 'Ошибка',
    description: message,
    timestamp: false,
  });
}

/** Короткая карточка успеха */
export function successCard(
  title: string,
  message: string,
  fields?: CardField[],
): ContainerBuilder {
  return card({
    tone: 'success',
    title,
    description: message,
    fields,
    timestamp: false,
  });
}

/** Информационная карточка */
export function infoCard(
  title: string,
  description?: string,
  fields?: CardField[],
): ContainerBuilder {
  return card({
    tone: 'info',
    title,
    description,
    fields,
    timestamp: false,
  });
}

/** Карточка предупреждения */
export function warnCard(
  title: string,
  description?: string,
  fields?: CardField[],
): ContainerBuilder {
  return card({
    tone: 'warn',
    title,
    description,
    fields,
    timestamp: false,
  });
}
