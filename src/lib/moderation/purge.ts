import type { GuildTextBasedChannel, Message } from 'discord.js';
import { markBulkDeleteReason } from '../bulkDeleteReason.js';
import { createCase } from '../cases.js';
import { FOURTEEN_DAYS_MS, MAX_PURGE, fail, ok, type ActionResult } from './helpers.js';

export interface PurgeOptions {
  amount: number;
  userId?: string | null;
  bots?: boolean;
  contains?: string;
  regex?: string;
  embeds?: boolean;
  files?: boolean;
  links?: boolean;
  images?: boolean;
  moderatorId?: string;
  reason?: string;
}

export async function purgeMessages(
  channel: GuildTextBasedChannel,
  options: PurgeOptions,
): Promise<ActionResult> {
  if (!('bulkDelete' in channel)) {
    return fail('Очистка работает только в текстовом канале.');
  }

  const amount = Math.max(1, Math.min(Math.floor(options.amount), MAX_PURGE));
  const needsScan = Boolean(
    options.userId ||
    options.bots ||
    options.contains ||
    options.regex ||
    options.embeds ||
    options.files ||
    options.links ||
    options.images,
  );
  const fetchLimit = needsScan ? Math.min(MAX_PURGE, Math.max(amount * 4, 100)) : amount;

  let regex: RegExp | null = null;
  if (options.regex) {
    try {
      regex = new RegExp(options.regex, 'i');
    } catch {
      return fail('Некорректное регулярное выражение.');
    }
  }

  const collected = new Map<string, Message>();
  let before: string | undefined;

  while (collected.size < fetchLimit) {
    const batch = await channel.messages
      .fetch({
        limit: Math.min(100, fetchLimit - collected.size),
        ...(before ? { before } : {}),
      })
      .catch(() => null);

    if (!batch || batch.size === 0) break;
    for (const [id, message] of batch) collected.set(id, message);
    before = [...batch.keys()].at(-1);
    if (batch.size < 100) break;
  }

  const filtered = [...collected.values()]
    .filter((message) => {
      if (message.pinned) return false;
      if (Date.now() - message.createdTimestamp >= FOURTEEN_DAYS_MS) return false;
      if (options.userId && message.author.id !== options.userId) return false;
      if (options.bots && !message.author.bot) return false;

      const content = message.content ?? '';
      if (options.contains && !content.toLowerCase().includes(options.contains.toLowerCase())) {
        return false;
      }
      if (regex && !regex.test(content)) return false;
      if (options.embeds && message.embeds.length === 0) return false;
      if (options.files && message.attachments.size === 0) return false;
      if (options.links && !/https?:\/\//i.test(content)) return false;
      if (
        options.images &&
        !message.attachments.some(
          (attachment) => attachment.contentType?.startsWith('image/') ?? false,
        )
      ) {
        return false;
      }
      return true;
    })
    .slice(0, amount);

  if (filtered.length === 0) return fail('Нечего удалять: подходящих сообщений не найдено.');

  let deleted = 0;
  for (let index = 0; index < filtered.length; index += 100) {
    const chunk = filtered.slice(index, index + 100);

    // Bulk delete не поддерживает audit reason — передаём причину событию лога.
    if (options.moderatorId) {
      markBulkDeleteReason(channel.id, {
        reason: options.reason ?? 'Массовая очистка сообщений',
        moderatorId: options.moderatorId,
      });
    }

    const result = await channel.bulkDelete(chunk, true).catch(() => null);
    if (!result) break;
    deleted += result.size;
  }

  if (deleted === 0) return fail('Не удалось удалить сообщения.');

  if (options.moderatorId) {
    const modCase = createCase({
      guildId: channel.guild.id,
      type: 'purge',
      userId: options.userId ?? null,
      moderatorId: options.moderatorId,
      reason: options.reason ?? `Удалено сообщений: ${deleted}`,
      active: false,
      extra: { channelId: channel.id, count: deleted },
    });
    return ok(`Удалено сообщений: **${deleted}**.`, modCase.id);
  }

  return ok(`Удалено сообщений: **${deleted}**.`);
}
