import type { User } from 'discord.js';
import { ChannelType, GuildVerificationLevel } from 'discord.js';

/** Упоминание и тег: "@user (user#1234)" — делает участника кликабельным */
export function fmtUser(user: User): string {
  return `${user} (${user.tag})`;
}

/** Относительное время: "5 минут назад" */
export function fmtRelative(date: Date | number): string {
  const ms = typeof date === 'number' ? date : date.getTime();
  return `<t:${Math.floor(ms / 1_000)}:R>`;
}

/** Обрезает текст под лимиты эмбеда */
export function truncate(text: string, max = 1024): string {
  const clean = text.trim();
  if (!clean) return '*пусто*';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Ссылка на сообщение */
export function messageLink(guildId: string, channelId: string, messageId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

/** Цитата для содержимого сообщений — выглядит аккуратнее блока кода */
export function quote(text: string, max = 1000): string {
  const clean = text.trim();
  if (!clean) return '> *пусто*';
  const body = clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
  const formatted = body
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return formatted.length > 4096 ? `${formatted.slice(0, 4095)}…` : formatted;
}

/** Человекочитаемый тип канала */
export function channelTypeLabel(type: ChannelType): string {
  const labels: Partial<Record<ChannelType, string>> = {
    [ChannelType.GuildText]: 'текстовый',
    [ChannelType.GuildVoice]: 'голосовой',
    [ChannelType.GuildCategory]: 'категория',
    [ChannelType.GuildAnnouncement]: 'анонсы',
    [ChannelType.GuildStageVoice]: 'трибуна',
    [ChannelType.GuildForum]: 'форум',
    [ChannelType.GuildMedia]: 'медиа',
  };
  return labels[type] ?? String(type);
}

/** Человекочитаемый уровень проверки сервера */
export function verificationLabel(level: GuildVerificationLevel): string {
  const labels: Record<GuildVerificationLevel, string> = {
    [GuildVerificationLevel.None]: 'нет',
    [GuildVerificationLevel.Low]: 'низкий',
    [GuildVerificationLevel.Medium]: 'средний',
    [GuildVerificationLevel.High]: 'высокий',
    [GuildVerificationLevel.VeryHigh]: 'максимальный',
  };
  return labels[level] ?? String(level);
}

// Удобно импортировать работу с логами из одного модуля
export { getLogChannel, sendLog } from './logger.js';
export { isLogEventEnabled } from './logSettings.js';
