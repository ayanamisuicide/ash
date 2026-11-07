import type { GuildTextBasedChannel } from 'discord.js';
import { purgeMessages, type ActionResult } from '../../lib/moderation.js';

// Меню и команды используют один и тот же модерационный сервис.
export {
  banUser,
  kickUser,
  unbanUser,
  timeoutUser,
  untimeoutUser,
  warnUser,
  clearWarnsAction,
} from '../../lib/moderation.js';

export type { ActionResult };

/** Совместимый со старым меню адаптер очистки сообщений */
export async function clearMessages(
  channel: GuildTextBasedChannel,
  amount: number,
  targetUserId?: string | null,
  moderatorId?: string,
): Promise<ActionResult> {
  return purgeMessages(channel, { amount, userId: targetUserId, moderatorId });
}
