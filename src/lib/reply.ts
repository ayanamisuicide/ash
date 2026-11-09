import { MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { V2, errorCard } from './card.js';
import { buildEmbed, caseFooter } from './embeds.js';
import type { ActionResult } from './moderation.js';
import { publicActionResponse, type PublicAction, type ResponseUser } from './responses.js';

export interface ReplyOptions {
  /** Заголовок для обычного ответа (когда action не передан). */
  title?: string;
  thumbnail?: string | null;
  footer?: string;
  ephemeral?: boolean;
  /** Тип действия — включает единый шаблон publicActionResponse. */
  action?: PublicAction;
  /** Участник, к которому применено действие. */
  target?: ResponseUser;
  /** Модератор, выполнивший действие. */
  moderator?: ResponseUser;
  /** Причина действия. */
  reason?: string;
}

/**
 * Единый ответ на действие модерации: карточка успеха/ошибки + номер кейса.
 * При передаче `action` и `target` использует общий шаблон публичных ответов.
 */
export async function replyActionResult(
  interaction: ChatInputCommandInteraction<'cached'>,
  result: ActionResult,
  options: ReplyOptions = {},
): Promise<void> {
  const useActionTemplate =
    result.ok && options.action !== undefined && options.target !== undefined;

  const view = useActionTemplate
    ? publicActionResponse(
        options.action as PublicAction,
        options.target as ResponseUser,
        options.moderator ?? interaction.user,
        options.reason ?? 'Без причины',
        result.caseId,
        result.message,
      )
    : result.ok
      ? buildEmbed({
          tone: 'success',
          title: options.title ?? 'Готово',
          description: result.message,
          thumbnail: options.thumbnail,
          footer: options.footer ?? caseFooter(result.caseId),
          timestamp: false,
        })
      : errorCard(result.message);

  const payload = {
    components: [view],
    flags: V2 | (options.ephemeral ? MessageFlags.Ephemeral : 0),
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}
