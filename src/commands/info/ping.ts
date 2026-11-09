import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, infoCard } from '../../lib/card.js';
import { buildEmbed, formatEmbedDate } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Проверить задержку бота'),

  async execute(interaction) {
    const sent = await interaction.reply({
      components: [infoCard('🏓 Измеряю…', 'Секунду.')],
      flags: V2,
      fetchReply: true,
    });
    const rtt = sent.createdTimestamp - interaction.createdTimestamp;
    const client = interaction.client;

    await interaction.editReply({
      components: [
        buildEmbed({
          tone: 'accent',
          title: 'Понг',
          emoji: '🏓',
          description: '🟢 Соединение с Discord стабильно.',
          fields: [
            { label: 'Задержка API', value: `${Math.round(client.ws.ping)} мс`, block: false },
            { label: 'Круг', value: `${rtt} мс`, block: false },
            { label: 'Аптайм', value: humanDuration(client.uptime ?? 0), block: false },
          ],
          footer: `🔖 ${formatEmbedDate()}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
