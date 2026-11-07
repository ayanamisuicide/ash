import type { ContainerBuilder, Guild, GuildBasedChannel } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { getLogChannelId, isLogEventEnabled, type LogEventKey } from './logSettings.js';

/** Канал логов, настроенный командой /logs channel (или null) */
export function getLogChannel(guild: Guild): GuildBasedChannel | null {
  const channelId = getLogChannelId(guild.id);
  if (!channelId) return null;

  return guild.channels.cache.get(channelId) ?? null;
}

/**
 * Отправляет карточку(и) в канал логов, если событие разрешено настройками.
 * Без `eventKey` отправляет безусловно (служебные сообщения).
 */
export async function sendLog(
  guild: Guild | null,
  cards: ContainerBuilder | ContainerBuilder[],
  eventKey?: LogEventKey,
): Promise<void> {
  if (!guild) return;
  if (eventKey && !isLogEventEnabled(guild.id, eventKey)) return;

  const channel = getLogChannel(guild);
  if (!channel?.isTextBased()) return;

  await channel
    .send({
      components: Array.isArray(cards) ? cards : [cards],
      flags: MessageFlags.IsComponentsV2,
    })
    .catch((error: unknown) => {
      console.warn('[logger] не удалось отправить лог:', error);
    });
}
