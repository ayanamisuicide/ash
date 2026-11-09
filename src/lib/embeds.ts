import type {
  ActionRowBuilder,
  ContainerBuilder,
  Guild,
  MessageActionRowComponentBuilder,
} from 'discord.js';
import { card, type CardField, type CardOptions, type CardTone } from './card.js';
import { COLORS } from './colors.js';

/**
 * Палитра вынесена в `colors.ts`, чтобы `card.ts` и `embeds.ts` не создавали
 * циклический импорт. Публичный API остался прежним: `import { COLORS } from './embeds.js'`.
 */
export { COLORS };
export type { ColorName } from './colors.js';
export type { CardField, CardTone } from './card.js';

/**
 * В Components V2 обычные `EmbedBuilder` не используются: их заменяют
 * контейнеры с акцентной полосой. Поэтому `buildEmbed()` возвращает
 * `ContainerBuilder`, который можно сразу передать в `components`.
 *
 * @example
 * await interaction.reply({
 *   components: [successEmbed('Готово', 'Настройки сохранены.')],
 *   flags: V2,
 * });
 */
export interface BuildEmbedOptions {
  /** Настроение карточки. По умолчанию — accent. */
  tone?: CardTone;
  /** Заголовок. Emoji добавляется автоматически, если его ещё нет. */
  title: string;
  /** Переопределяет emoji заголовка. */
  emoji?: string;
  description?: string | null;
  fields?: CardField[];
  footer?: string | null;
  /** false — не добавлять относительное время в подпись. */
  timestamp?: Date | number | false;
  thumbnail?: string | null;
  buttons?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  rows?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  /** Переопределяет цвет акцентной полосы. */
  color?: number;
}

/**
 * Универсальный билдер карточек с едиными стилями ProBot.
 *
 * @example
 * const view = buildEmbed({
 *   tone: 'info',
 *   title: 'Статус',
 *   fields: [{ label: 'Пинг', value: '42 мс' }],
 * });
 */
export function buildEmbed(options: BuildEmbedOptions): ContainerBuilder {
  const cardOptions: CardOptions = {
    tone: options.tone ?? 'accent',
    color: options.color,
    title: options.title,
    emoji: options.emoji,
    description: options.description,
    fields: options.fields,
    footer: options.footer,
    timestamp: options.timestamp,
    thumbnail: options.thumbnail,
    buttons: options.buttons,
    rows: options.rows,
  };

  return card(cardOptions);
}

/** Карточка успешного действия: ✅ + success-цвет. */
export function successEmbed(
  title: string,
  description = '',
  fields?: CardField[],
): ContainerBuilder {
  return buildEmbed({
    tone: 'success',
    title,
    description,
    fields,
    timestamp: false,
  });
}

/** Карточка ошибки: ❌ + danger-цвет. */
export function errorEmbed(title: string, description: string): ContainerBuilder {
  return buildEmbed({
    tone: 'danger',
    title,
    description,
    timestamp: false,
  });
}

/** Информационная карточка: ℹ️ + info-цвет. */
export function infoEmbed(title: string, description = '', fields?: CardField[]): ContainerBuilder {
  return buildEmbed({
    tone: 'info',
    title,
    description,
    fields,
    timestamp: false,
  });
}

/** Карточка предупреждения: ⚠️ + warn-цвет. */
export function warnEmbed(title: string, description = '', fields?: CardField[]): ContainerBuilder {
  return buildEmbed({
    tone: 'warn',
    title,
    description,
    fields,
    timestamp: false,
  });
}

/** Типы событий, для которых есть готовый DM-шаблон. */
export type DmNotificationType =
  | 'warn'
  | 'warnRemove'
  | 'ban'
  | 'tempban'
  | 'softban'
  | 'kick'
  | 'mute'
  | 'timeout'
  | 'unban'
  | 'unmute'
  | 'untimeout'
  | 'info'
  | 'appealApproved'
  | 'appealRejected';

export interface DmEmbedData {
  reason?: string | null;
  duration?: string | null;
  expiresAt?: Date | number | null;
  caseId?: number | null;
  /** Переопределяет основной текст шаблона. */
  description?: string | null;
  /** Переопределяет заголовок шаблона. */
  title?: string;
  /** Переопределяет emoji заголовка. */
  emoji?: string;
  /** Переопределяет цвет полосы. */
  tone?: CardTone;
  fields?: CardField[];
  buttons?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
  footer?: string | null;
  timestamp?: Date | number | false;
  thumbnail?: string | null;
}

interface DmTemplate {
  emoji: string;
  title: string;
  tone: CardTone;
  description: (guildName: string) => string;
  /** Добавить подсказку про апелляцию для наказаний. */
  appealHint?: boolean;
}

const DM_TEMPLATES: Record<DmNotificationType, DmTemplate> = {
  warn: {
    emoji: '⚠️',
    title: 'Предупреждение',
    tone: 'warn',
    description: (guild) => `Вам выдано предупреждение на сервере **${guild}**.`,
  },
  warnRemove: {
    emoji: '🧽',
    title: 'Предупреждение снято',
    tone: 'success',
    description: (guild) => `С вас снято предупреждение на сервере **${guild}**.`,
  },
  ban: {
    emoji: '🔨',
    title: 'Доступ к серверу закрыт',
    tone: 'danger',
    description: (guild) => `Вы забанены на сервере **${guild}**.`,
    appealHint: true,
  },
  tempban: {
    emoji: '⏳',
    title: 'Временный бан',
    tone: 'danger',
    description: (guild) => `Ваш доступ к серверу **${guild}** временно ограничен.`,
    appealHint: true,
  },
  softban: {
    emoji: '🧹',
    title: 'Софтбан',
    tone: 'danger',
    description: (guild) =>
      `Вы были исключены с сервера **${guild}**, ваши недавние сообщения удалены.`,
  },
  kick: {
    emoji: '👢',
    title: 'Кик',
    tone: 'danger',
    description: (guild) => `Вы были исключены с сервера **${guild}**.`,
  },
  mute: {
    emoji: '🎤',
    title: 'Мут',
    tone: 'warn',
    description: (guild) => `Вам ограничен доступ к чату на сервере **${guild}**.`,
    appealHint: true,
  },
  timeout: {
    emoji: '⏰',
    title: 'Таймаут',
    tone: 'warn',
    description: (guild) => `Вам выдан таймаут на сервере **${guild}**.`,
    appealHint: true,
  },
  unban: {
    emoji: '🔓',
    title: 'Разбан',
    tone: 'success',
    description: (guild) => `Ваш доступ к серверу **${guild}** восстановлен.`,
  },
  unmute: {
    emoji: '🔊',
    title: 'Мут снят',
    tone: 'success',
    description: (guild) => `С вас снят мут на сервере **${guild}**.`,
  },
  untimeout: {
    emoji: '🔊',
    title: 'Таймаут снят',
    tone: 'success',
    description: (guild) => `С вас снят таймаут на сервере **${guild}**.`,
  },
  info: {
    emoji: '🔷',
    title: 'Уведомление',
    tone: 'info',
    description: (guild) => `Уведомление с сервера **${guild}**.`,
  },
  appealApproved: {
    emoji: '✅',
    title: 'Апелляция одобрена',
    tone: 'success',
    description: (guild) => `Ваша апелляция на сервере **${guild}** одобрена.`,
  },
  appealRejected: {
    emoji: '❌',
    title: 'Апелляция отклонена',
    tone: 'danger',
    description: (guild) => `Ваша апелляция на сервере **${guild}** отклонена.`,
  },
};

/** Форматирует дату в виде `09.11.2026, 14:32`. */
export function formatEmbedDate(value: Date | number = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Единая подпись-футер: `🔖 Кейс #123 · 09.11.2026, 14:32`. */
export function caseFooter(caseId?: number | null, date: Date | number = new Date()): string {
  const moment = formatEmbedDate(date);
  return caseId ? `🔖 Кейс #${caseId} · ${moment}` : `🔖 ${moment}`;
}

function successMessage(value: Date | number | false | undefined): Date | number | false {
  return value === undefined ? false : value;
}

/**
 * DM-уведомление участнику в едином стиле.
 *
 * @example
 * await user.send({
 *   components: [
 *     dmEmbed('warn', guild, { reason: 'Флуд', caseId: 42 }),
 *   ],
 *   flags: V2,
 * });
 */
export function dmEmbed(
  type: DmNotificationType,
  guild: Guild | string,
  data: DmEmbedData = {},
): ContainerBuilder {
  const template = DM_TEMPLATES[type];
  const guildName = typeof guild === 'string' ? guild : guild.name;

  let description = data.description ?? template.description(guildName);
  if (template.appealHint) {
    description +=
      '\n\n📨 Если вы считаете наказание несправедливым, ' +
      (data.buttons?.length
        ? 'нажмите кнопку ниже, чтобы подать апелляцию.'
        : 'обратитесь к администрации сервера.');
  }

  const fields: CardField[] = [];
  if (data.reason) fields.push({ label: 'Причина', value: data.reason, block: true });
  if (data.duration) fields.push({ label: 'Длительность', value: data.duration, block: false });
  if (data.expiresAt) {
    const ms = new Date(data.expiresAt).getTime();
    fields.push({
      label: 'Действует до',
      value: `<t:${Math.floor(ms / 1_000)}:f>`,
      block: false,
    });
  }
  if (data.caseId) fields.push({ label: 'Кейс', value: `#${data.caseId}`, block: false });
  if (data.fields?.length) fields.push(...data.fields);

  return buildEmbed({
    tone: data.tone ?? template.tone,
    title: data.title ?? template.title,
    emoji: data.emoji ?? template.emoji,
    description,
    fields,
    thumbnail: data.thumbnail,
    footer: data.footer ?? caseFooter(data.caseId),
    timestamp: successMessage(data.timestamp),
    buttons: data.buttons,
  });
}
