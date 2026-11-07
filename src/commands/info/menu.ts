import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { v2Flags } from '../../lib/card.js';
import { buildMainView } from '../../features/menu/views.js';

export default {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription('Интерактивная панель управления ботом'),

  async execute(interaction) {
    await interaction.reply({
      components: buildMainView(interaction.guild).components,
      flags: v2Flags(true),
    });
  },
} satisfies Command;
