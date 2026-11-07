import { SlashCommandBuilder } from 'discord.js';
import { V2, infoCard } from '../../lib/card.js';
import type { Command } from '../../core/types.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Проверить задержку бота'),

  async execute(interaction) {
    const sent = await interaction.reply({
      components: [infoCard('🏓 Измеряю…', 'Секунду.')],
      flags: V2,
      fetchReply: true,
    });
    const rtt = sent.createdTimestamp - interaction.createdTimestamp;

    await interaction.editReply({
      components: [
        infoCard('🏓 Понг', undefined, [
          { label: 'Задержка API', value: `${Math.round(interaction.client.ws.ping)} мс` },
          { label: 'Круг', value: `${rtt} мс` },
        ]),
      ],
      flags: V2,
    });
  },
} satisfies Command;
