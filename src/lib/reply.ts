import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { V2, card } from './card.js';
import type { ActionResult } from './moderation.js';

export interface ReplyOptions {
  title?: string;
  thumbnail?: string | null;
  footer?: string;
  ephemeral?: boolean;
}

/** Единый ответ на действие модерации: карточка успеха/ошибки + номер кейса */
export async function replyActionResult(
  interaction: ChatInputCommandInteraction<'cached'>,
  result: ActionResult,
  options: ReplyOptions = {},
): Promise<void> {
  const payload = {
    components: [
      card({
        tone: result.ok ? 'success' : 'danger',
        title: result.ok ? (options.title ?? 'Готово') : 'Ошибка',
        description: result.message,
        thumbnail: options.thumbnail ?? null,
        footer:
          options.footer ??
          (result.caseId ? `Кейс #${result.caseId}` : null),
        timestamp: false,
      }),
    ],
    flags: V2 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}
