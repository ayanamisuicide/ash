import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ContainerBuilder,
  type Guild,
  type GuildMember,
  type MessageActionRowComponentBuilder,
  type User,
} from 'discord.js';
import { card, type CardField, type CardTone } from './card.js';
import { caseTypeLabel, type ModCase } from './cases.js';
import { COLORS } from './colors.js';
import { levelFromXp, xpNeeded, type Ticket } from './community.js';
import {
  buildEmbed,
  caseFooter,
  dmEmbed,
  formatEmbedDate,
  type DmEmbedData,
  type DmNotificationType,
} from './embeds.js';
import { logCard } from './logCard.js';

/** Пользователь, которого можно упомянуть в ответе. */
export type ResponseUser = User | GuildMember | string;

/** Публичные действия, для которых есть готовый заголовок и цвет. */
export type PublicAction =
  | 'warn'
  | 'ban'
  | 'tempban'
  | 'softban'
  | 'kick'
  | 'mute'
  | 'timeout'
  | 'unban'
  | 'unmute'
  | 'untimeout'
  | 'note'
  | 'noteRemove'
  | 'clearWarns'
  | 'lock'
  | 'unlock';

interface ActionDescriptor {
  title: string;
  tone: CardTone;
  emoji: string;
}

const ACTIONS: Record<PublicAction, ActionDescriptor> = {
  warn: { title: 'Предупреждение выдано', tone: 'warn', emoji: '⚠️' },
  ban: { title: 'Бан выдан', tone: 'danger', emoji: '🔨' },
  tempban: { title: 'Временный бан выдан', tone: 'danger', emoji: '⏳' },
  softban: { title: 'Софтбан выполнен', tone: 'danger', emoji: '🧹' },
  kick: { title: 'Кик выполнен', tone: 'danger', emoji: '👢' },
  mute: { title: 'Мут выдан', tone: 'warn', emoji: '🎤' },
  timeout: { title: 'Таймаут выдан', tone: 'warn', emoji: '⏰' },
  unban: { title: 'Разбан выполнен', tone: 'success', emoji: '🔓' },
  unmute: { title: 'Мут снят', tone: 'success', emoji: '🔊' },
  untimeout: { title: 'Таймаут снят', tone: 'success', emoji: '🔊' },
  note: { title: 'Заметка добавлена', tone: 'info', emoji: '📝' },
  noteRemove: { title: 'Заметка удалена', tone: 'neutral', emoji: '🗑️' },
  clearWarns: { title: 'Предупреждения сняты', tone: 'success', emoji: '🧽' },
  lock: { title: 'Канал заблокирован', tone: 'danger', emoji: '🔒' },
  unlock: { title: 'Канал разблокирован', tone: 'success', emoji: '🔓' },
};

interface UserInfo {
  id: string;
  avatar: string | null;
  mention: string;
}

function guildIcon(guild: Guild | null | undefined): string | null {
  const fn = (
    guild as unknown as {
      iconURL?: (options?: { size?: number }) => string | null;
    } | null
  )?.iconURL;

  return typeof fn === 'function' ? fn.call(guild, { size: 256 }) : null;
}

function userInfo(target: ResponseUser): UserInfo {
  if (typeof target === 'string') {
    return {
      id: target,
      avatar: null,
      mention: /^\d{17,20}$/.test(target) ? `<@${target}>` : target,
    };
  }

  const user = 'user' in target ? target.user : target;
  const avatarFn = (
    user as unknown as {
      displayAvatarURL?: (options?: { size?: number }) => string;
    }
  ).displayAvatarURL;

  return {
    id: user.id,
    avatar: typeof avatarFn === 'function' ? avatarFn.call(user, { size: 128 }) : null,
    mention: `<@${user.id}>`,
  };
}

/** Кнопка «Просмотреть кейс» — открывает карточку кейса в эфемерном ответе. */
export function viewCaseButton(caseId: number): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`case:view:${caseId}`)
      .setLabel('Просмотреть кейс')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Кнопка «Отменить действие» — доступна администраторам. */
export function undoActionButton(
  caseId: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`case:undo:${caseId}`)
      .setLabel('Отменить действие')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Ряд кнопок кейса: просмотр и (опционально) отмена действия. */
export function caseActionsRow(
  caseId: number,
  withUndo = false,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`case:view:${caseId}`)
      .setLabel('Просмотреть кейс')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
  );

  if (withUndo) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`case:undo:${caseId}`)
        .setLabel('Отменить действие')
        .setEmoji('↩️')
        .setStyle(ButtonStyle.Danger),
    );
  }

  return row;
}

/** Действия, которые безопасно откатывать кнопкой «Отменить действие». */
const UNDOABLE_ACTIONS: Partial<Record<PublicAction, true>> = {
  warn: true,
  ban: true,
  tempban: true,
  mute: true,
  timeout: true,
};

/** Кнопка «Закрыть тикет» для карточки тикета. */
export function ticketCloseButton(): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Закрыть тикет')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

/**
 * Публичный ответ на действие модератора.
 *
 * @example
 * const view = publicActionResponse(
 *   'warn',
 *   user,
 *   interaction.user,
 *   'Флуд в чате',
 *   42,
 *   result.message,
 * );
 * await interaction.editReply({ components: [view], flags: V2 });
 */
export function publicActionResponse(
  action: PublicAction,
  target: ResponseUser,
  moderator: ResponseUser,
  reason: string,
  caseId?: number | null,
  details?: string | null,
): ContainerBuilder {
  const descriptor = ACTIONS[action];
  const targetData = userInfo(target);
  const moderatorData = userInfo(moderator);

  const fields: CardField[] = [
    { label: 'Участник', value: targetData.mention, block: false },
    { label: 'Модератор', value: moderatorData.mention, block: false },
  ];
  if (caseId) fields.push({ label: 'Кейс', value: `#${caseId}`, block: false });
  fields.push({ label: 'Причина', value: reason.trim() || 'Без причины', block: true });

  return buildEmbed({
    tone: descriptor.tone,
    title: descriptor.title,
    emoji: descriptor.emoji,
    description: details?.trim() || null,
    fields,
    thumbnail: targetData.avatar,
    footer: caseFooter(caseId),
    timestamp: false,
    buttons: caseId ? [caseActionsRow(caseId, UNDOABLE_ACTIONS[action] === true)] : undefined,
  });
}

/** DM-уведомление участнику (обёртка над `dmEmbed`). */
export function dmNotification(
  type: DmNotificationType,
  guild: Guild | string,
  data: DmEmbedData = {},
): ContainerBuilder {
  return dmEmbed(type, guild, data);
}

/** Названия и цвета известных событий для логов. */
export type LogEventName =
  | 'warn'
  | 'warnRemove'
  | 'warnEscalation'
  | 'ban'
  | 'tempban'
  | 'softban'
  | 'kick'
  | 'unban'
  | 'mute'
  | 'unmute'
  | 'timeout'
  | 'untimeout'
  | 'note'
  | 'noteRemove'
  | 'automod'
  | 'raidAlert'
  | 'raidAction'
  | 'nukeAlert'
  | 'nukeAction'
  | 'ticketOpen'
  | 'ticketClose'
  | 'appealUpdate'
  | 'system';

const LOG_EVENTS: Record<LogEventName, { title: string; tone: CardTone }> = {
  warn: { title: '⚠️ Предупреждение', tone: 'warn' },
  warnRemove: { title: '🧽 Предупреждение снято', tone: 'success' },
  warnEscalation: { title: '⚙️ Автонаказание по варнам', tone: 'danger' },
  ban: { title: '🔨 Бан', tone: 'danger' },
  tempban: { title: '⏳ Временный бан', tone: 'danger' },
  softban: { title: '🧹 Софтбан', tone: 'danger' },
  kick: { title: '👢 Кик', tone: 'danger' },
  unban: { title: '🔓 Разбан', tone: 'success' },
  mute: { title: '🎤 Мут', tone: 'warn' },
  unmute: { title: '🔊 Мут снят', tone: 'success' },
  timeout: { title: '⏰ Таймаут', tone: 'warn' },
  untimeout: { title: '🔊 Таймаут снят', tone: 'success' },
  note: { title: '📝 Заметка добавлена', tone: 'info' },
  noteRemove: { title: '🗑️ Заметка удалена', tone: 'neutral' },
  automod: { title: '⚙️ Автомодерация', tone: 'warn' },
  raidAlert: { title: '🚨 Антирейд', tone: 'danger' },
  raidAction: { title: '🛡️ Антирейд: действие', tone: 'danger' },
  nukeAlert: { title: '🚨 Анти-нак', tone: 'danger' },
  nukeAction: { title: '🛡️ Анти-нак: действие', tone: 'danger' },
  ticketOpen: { title: '🎫 Тикет открыт', tone: 'success' },
  ticketClose: { title: '🎫 Тикет закрыт', tone: 'neutral' },
  appealUpdate: { title: '📨 Апелляция', tone: 'info' },
  system: { title: '🔷 Система', tone: 'neutral' },
};

export interface LogEntryData {
  guild: Guild;
  /** Кто выполнил действие. */
  actor?: ResponseUser | null;
  /** На кого направлено действие. */
  target?: ResponseUser | null;
  reason?: string | null;
  caseId?: number | null;
  description?: string | null;
  fields?: CardField[];
  footer?: string;
  timestamp?: Date | number;
  thumbnail?: string | null;
  color?: number;
  /** Показывает администраторам кнопку «Отменить действие» для этого кейса. */
  undoCaseId?: number | null;
}

/**
 * Единый лог-ответ. Использует `logCard()` и автоматически добавляет
 * участника, сотрудника, кейс и причину.
 *
 * @example
 * await sendLog(guild, logEntry('warn', {
 *   guild,
 *   target: user,
 *   actor: interaction.user,
 *   reason: 'Флуд',
 *   caseId: 42,
 * }), 'warnAdd');
 */
export function logEntry(event: LogEventName, data: LogEntryData): ContainerBuilder {
  const config = LOG_EVENTS[event];
  const target = data.target ? userInfo(data.target) : null;
  const actor = data.actor ? userInfo(data.actor) : null;

  const fields: CardField[] = [];
  if (target) fields.push({ label: 'Участник', value: target.mention, block: false });
  if (actor) fields.push({ label: 'Сотрудник', value: actor.mention, block: false });
  if (data.caseId) fields.push({ label: 'Кейс', value: `#${data.caseId}`, block: false });
  if (data.fields?.length) fields.push(...data.fields);
  if (data.reason) fields.push({ label: 'Причина', value: data.reason, block: true });

  return logCard(data.guild, {
    title: config.title,
    color: data.color ?? COLORS[config.tone],
    description: data.description,
    thumbnail: data.thumbnail ?? target?.avatar ?? actor?.avatar ?? null,
    fields: fields.map((field) => ({
      name: field.label,
      value: field.value,
      inline: !field.block,
    })),
    footer:
      data.footer ??
      (data.caseId ? `🔖 Кейс #${data.caseId}` : target ? `ID: ${target.id}` : undefined),
    timestamp: data.timestamp,
    buttons: data.undoCaseId ? [undoActionButton(data.undoCaseId)] : undefined,
  });
}

export interface AutomodResponseData {
  action?: string;
  channelId?: string;
  result?: string;
  content?: string;
  severity?: 'warn' | 'danger';
  caseId?: number;
}

/**
 * Карточка срабатывания автомодерации.
 *
 * @example
 * await sendLog(guild, automodResponse('спам', message.author, reason, {
 *   action: 'таймаут',
 *   channelId: message.channelId,
 * }), 'automodExecution');
 */
export function automodResponse(
  rule: string,
  target: ResponseUser,
  reason: string,
  data: AutomodResponseData = {},
): ContainerBuilder {
  const targetData = userInfo(target);
  const fields: CardField[] = [
    { label: 'Участник', value: targetData.mention, block: false },
    { label: 'Правило', value: rule, block: false },
  ];
  if (data.action) fields.push({ label: 'Действие', value: data.action, block: false });
  if (data.channelId) fields.push({ label: 'Канал', value: `<#${data.channelId}>`, block: false });
  if (data.caseId) fields.push({ label: 'Кейс', value: `#${data.caseId}`, block: false });
  if (data.result) fields.push({ label: 'Результат', value: data.result, block: true });
  fields.push({ label: 'Причина', value: reason, block: true });

  const content = data.content?.trim();
  return buildEmbed({
    tone: data.severity ?? 'warn',
    title: `Автомодерация: ${rule}`,
    emoji: '⚙️',
    description: content ? `> ${content.slice(0, 600).replaceAll('\n', '\n> ')}` : null,
    fields,
    thumbnail: targetData.avatar,
    footer: `🔖 Автомодерация · ${formatEmbedDate()}`,
    timestamp: false,
  });
}

/**
 * Приветствие участника.
 *
 * @example
 * await channel.send({
 *   components: [welcomeMessage(member.user, guild, guild.memberCount)],
 *   flags: V2,
 * });
 */
export function welcomeMessage(
  user: ResponseUser,
  guild: Guild,
  memberCount: number,
  text?: string | null,
): ContainerBuilder {
  const userData = userInfo(user);
  const description =
    text?.trim() ||
    `**${userData.mention}**, добро пожаловать на сервер **${guild.name}**!\n` +
      `Ты **${memberCount}-й** участник сервера.`;

  return buildEmbed({
    tone: 'accent',
    title: 'Добро пожаловать!',
    emoji: '👋',
    description,
    thumbnail: guildIcon(guild) ?? userData.avatar,
    fields: [
      { label: 'Участник', value: userData.mention, block: false },
      { label: 'Сервер', value: guild.name, block: false },
      { label: 'Участников', value: String(memberCount), block: false },
    ],
    footer: `🔖 Участник #${memberCount} · ${formatEmbedDate()}`,
    timestamp: false,
  });
}

/** Прощание с участником. */
export function goodbyeMessage(
  user: ResponseUser,
  guild: Guild,
  text?: string | null,
): ContainerBuilder {
  const userData = userInfo(user);
  const description =
    text?.trim() ||
    `**${userData.mention}** покинул(а) сервер **${guild.name}**.\n` + 'Надеемся увидеться снова!';

  return buildEmbed({
    tone: 'neutral',
    title: 'До свидания!',
    emoji: '👋',
    description,
    thumbnail: userData.avatar,
    fields: [
      { label: 'Участник', value: userData.mention, block: false },
      { label: 'Сервер', value: guild.name, block: false },
      { label: 'Участников', value: String(guild.memberCount), block: false },
    ],
    footer: `🔖 ${formatEmbedDate()}`,
    timestamp: false,
  });
}

/** Визуальный прогресс-бар для уровней и достижений. */
export function progressBar(value: number, max: number, length = 10): string {
  const safeMax = Math.max(1, max);
  const ratio = Math.min(1, Math.max(0, value / safeMax));
  const filled = Math.round(ratio * length);
  return `${'█'.repeat(filled)}${'░'.repeat(Math.max(0, length - filled))} ${Math.round(
    ratio * 100,
  )}%`;
}

/**
 * Уведомление о новом уровне.
 *
 * @example
 * await channel.send({
 *   components: [levelUpMessage(member.user, 12, 1450)],
 *   flags: V2,
 * });
 */
export function levelUpMessage(
  user: ResponseUser,
  level: number,
  xp: number,
  text?: string | null,
): ContainerBuilder {
  const userData = userInfo(user);
  const info = levelFromXp(xp);
  const actualLevel = info.level || level;
  const needed = xpNeeded(actualLevel);
  const progress = progressBar(info.rest, needed);

  return buildEmbed({
    tone: 'premium',
    title: 'Новый уровень!',
    emoji: '🎉',
    description: text?.trim() || `**${userData.mention}** достиг(ла) **${actualLevel}** уровня!`,
    thumbnail: userData.avatar,
    fields: [
      { label: 'Уровень', value: String(actualLevel), block: false },
      { label: 'Всего XP', value: String(xp), block: false },
      { label: 'До следующего', value: `${Math.max(0, needed - info.rest)} XP`, block: false },
      { label: 'Прогресс', value: progress, block: true },
    ],
    footer: `🔖 Уровень ${actualLevel} · ${formatEmbedDate()}`,
    timestamp: false,
  });
}

export interface TicketCreatedData {
  guild?: Guild;
  category?: string | null;
  supportRoleId?: string | null;
}

/**
 * Карточка созданного тикета с кнопкой закрытия.
 *
 * @example
 * await channel.send({
 *   components: [ticketCreated(ticket, { guild, category: category.name })],
 *   flags: V2,
 * });
 */
export function ticketCreated(ticket: Ticket, data: TicketCreatedData = {}): ContainerBuilder {
  const fields: CardField[] = [
    { label: 'Создатель', value: `<@${ticket.userId}>`, block: false },
    { label: 'Категория', value: data.category?.trim() || 'не задана', block: false },
    { label: 'Статус', value: ticket.status === 'open' ? '🟢 Открыт' : '🔒 Закрыт', block: false },
  ];
  if (data.supportRoleId) {
    fields.push({ label: 'Поддержка', value: `<@&${data.supportRoleId}>`, block: false });
  }

  return buildEmbed({
    tone: 'info',
    title: 'Тикет создан',
    emoji: '🎫',
    description:
      'Спасибо за обращение! Опишите проблему подробнее — команда поддержки ответит в этом канале.',
    fields,
    thumbnail: guildIcon(data.guild),
    footer: `🔖 Тикет · ${formatEmbedDate(ticket.createdAt)}`,
    timestamp: false,
    buttons: [ticketCloseButton()],
  });
}

/** Короткая карточка ошибки с техническим кодом в подписи. */
export function errorMessage(code: string, message: string): ContainerBuilder {
  return buildEmbed({
    tone: 'danger',
    title: 'Ошибка',
    emoji: '❌',
    description: message,
    footer: `🔖 Код: ${code} · ${formatEmbedDate()}`,
    timestamp: false,
  });
}

/** Карточка модерационного кейса — для `/case` и кнопки «Просмотреть кейс». */
export function caseDetailsCard(modCase: ModCase): ContainerBuilder {
  const fields: CardField[] = [
    { label: 'Тип', value: caseTypeLabel(modCase.type), block: false },
    { label: 'Участник', value: modCase.userId ? `<@${modCase.userId}>` : '—', block: false },
    { label: 'Модератор', value: `<@${modCase.moderatorId}>`, block: false },
    { label: 'Создан', value: `<t:${Math.floor(modCase.createdAt / 1_000)}:f>`, block: false },
    {
      label: 'Истекает',
      value: modCase.expiresAt ? `<t:${Math.floor(modCase.expiresAt / 1_000)}:f>` : 'бессрочно',
      block: false,
    },
    { label: 'Активен', value: modCase.active ? 'да' : 'нет', block: false },
    { label: 'Причина', value: modCase.reason, block: true },
  ];

  if (typeof modCase.extra.channelId === 'string') {
    fields.push({ label: 'Канал', value: `<#${modCase.extra.channelId}>`, block: false });
  }
  if (typeof modCase.extra.roleId === 'string') {
    fields.push({ label: 'Роль', value: `<@&${modCase.extra.roleId}>`, block: false });
  }
  if (typeof modCase.extra.warnId === 'string') {
    fields.push({ label: 'ID варна', value: `\`${modCase.extra.warnId}\``, block: false });
  }
  if (typeof modCase.extra.count === 'number') {
    fields.push({ label: 'Количество', value: String(modCase.extra.count), block: false });
  }
  if (typeof modCase.extra.action === 'string') {
    fields.push({ label: 'Действие', value: modCase.extra.action, block: false });
  }
  if (typeof modCase.extra.closedReason === 'string') {
    fields.push({ label: 'Закрыт', value: modCase.extra.closedReason, block: false });
  }

  return buildEmbed({
    tone: modCase.active ? 'warn' : 'info',
    title: `Кейс #${modCase.id}`,
    emoji: '📋',
    description: caseTypeLabel(modCase.type),
    fields,
    footer: `🔖 ID: ${modCase.userId ?? '—'} · ${formatEmbedDate(modCase.createdAt)}`,
    timestamp: false,
  });
}

/** Экспорт для удобства: некоторые модули используют card() напрямую. */
export { card };
