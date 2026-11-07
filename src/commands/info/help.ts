import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { card, v2Flags } from '../../lib/card.js';
import type { BotClient } from '../../core/client.js';

const PAGE_SIZE = 8;

export default {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Список доступных команд')
    .addStringOption((option) =>
      option.setName('query').setDescription('Поиск по названию или описанию'),
    )
    .addIntegerOption((option) => option.setName('page').setDescription('Страница').setMinValue(1)),

  async execute(interaction) {
    const client = interaction.client as BotClient;
    const query = interaction.options.getString('query')?.trim().toLowerCase() ?? '';
    const requestedPage = interaction.options.getInteger('page') ?? 1;

    const commands = [...client.commands.values()]
      .filter((command) => {
        if (!query) return true;
        const haystack = `${command.data.name} ${command.data.description}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => a.data.name.localeCompare(b.data.name));

    const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
    const page = Math.min(Math.max(requestedPage, 1), totalPages);
    const slice = commands.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    await interaction.reply({
      components: [
        card({
          tone: 'info',
          title: '📖 Команды',
          description:
            commands.length > 0
              ? `Найдено: **${commands.length}**${query ? ` по запросу \`${query}\`` : ''}`
              : 'Ничего не найдено.',
          fields: slice.map((command) => ({
            label: `/${command.data.name}`,
            value: command.data.description,
            block: true,
          })),
          footer: `Страница ${page} из ${totalPages}`,
          timestamp: false,
        }),
      ],
      flags: v2Flags(true),
    });
  },
} satisfies Command;
