import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { getLeaderboard } from '../../lib/community.js';

const PAGE_SIZE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Таблица лидеров по XP')
    .addIntegerOption((option) => option.setName('page').setDescription('Страница').setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const page = interaction.options.getInteger('page') ?? 1;
    const rows = getLeaderboard(interaction.guild.id, 100);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const fields = slice.map((row, index) => ({
      label: `#${(safePage - 1) * PAGE_SIZE + index + 1}`,
      value: `<@${row.userId}> · уровень **${row.level}** · **${row.xp}** XP`,
      block: true,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '🏆 Топ по XP',
          description: rows.length === 0 ? 'Пока нет данных.' : `Участников: **${rows.length}**`,
          fields,
          footer: `Страница ${safePage} из ${totalPages}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
