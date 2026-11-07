import { PermissionFlagsBits } from 'discord.js';
import { getSettings } from './settings.js';

// discord.gg/..., discord.com/invite/..., dsc.gg/... и т.п.
const INVITE_RE = /(?:discord\.(?:gg|io|me|li|link)|discord(?:app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;

const MODERATE_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
];

/**
 * Проверяет сообщение по автомодерации сервера.
 * Возвращает null, если всё чисто, либо { reason } при нарушении.
 */
export function runAutomod(message) {
  const s = getSettings(message.guild.id).automod ?? {};

  // Модераторов не трогаем
  const perms = message.member?.permissions;
  if (perms && MODERATE_PERMS.some((p) => perms.has(p))) return null;

  const content = message.content ?? '';
  if (!content) return null;

  if (s.invites?.enabled && INVITE_RE.test(content)) {
    return { reason: 'реклама (приглашение)' };
  }

  const words = s.words?.list ?? [];
  if (s.words?.enabled && words.some((w) => content.toLowerCase().includes(w.toLowerCase()))) {
    return { reason: 'запрещённое слово' };
  }

  if (s.mentions?.enabled && message.mentions.users.size >= (s.mentions.max ?? 4)) {
    return { reason: `спам упоминаниями (максимум ${s.mentions.max ?? 4})` };
  }

  if (s.caps?.enabled) {
    const letters = content.replace(/[^\p{L}]/gu, '');
    if (letters.length >= 10) {
      const caps = content.replace(/[^\p{Lu}\p{Lt}]/gu, '').length / letters.length;
      if (caps >= 0.7) return { reason: 'КАПС' };
    }
  }

  return null;
}
