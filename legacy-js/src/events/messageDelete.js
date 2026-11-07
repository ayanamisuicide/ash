import { sendLog } from '../lib/logger.js';
import { baseEmbed, COLORS } from '../lib/embeds.js';

export default {
  name: 'messageDelete',
  async execute(message) {
    try {
      if (!message.guild || message.author?.bot) return;
      const content = message.content || '(без текста)';
      await sendLog(
        message.guild,
        baseEmbed(COLORS.danger)
          .setTitle('Сообщения удалены')
          .setDescription(
            `🗑️ **Сообщения:** ${message.author ?? '?'}\n` +
              `**Канал:** ${message.channel}\n` +
              `**Текст:** ${content.slice(0, 1500)}`,
          )
          .setFooter({ text: `ID: ${message.author?.id ?? '?'}` }),
      );
    } catch (err) {
      console.error('[bot] messageDelete:', err);
    }
  },
};
