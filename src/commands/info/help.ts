import { SlashCommandBuilder } from 'discord.js';
import { infoCard, v2Flags } from '../../lib/card.js';
import type { Command } from '../../core/types.js';
import type { BotClient } from '../../core/client.js';

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Список доступных команд'),

  async execute(interaction) {
    const client = interaction.client as BotClient;
    const commands = [...client.commands.values()].sort((a, b) =>
      a.data.name.localeCompare(b.data.name),
    );

    await interaction.reply({
      components: [
        infoCard(
          '📖 Команды',
          commands
            .map((command) => `**/${command.data.name}** — ${command.data.description}`)
            .join('\n') || 'Команды не загружены.',
        ),
      ],
      flags: v2Flags(true),
    });
  },
} satisfies Command;
