import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2 } from '../../lib/card.js';
import {
  getLeaderboard,
  type LeaderboardMetric,
  type LeaderboardRow,
} from '../../lib/community.js';
import { buildEmbed } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';

const PAGE_SIZE = 10;

const METRICS: Record<
  LeaderboardMetric,
  { title: string; emoji: string; describe: (row: LeaderboardRow) => string }
> = {
  xp: {
    title: 'Топ по XP',
    emoji: '🏆',
    describe: (row) => `Уровень **${row.level}** · **${row.xp}** XP`,
  },
  messages: {
    title: 'Топ по сообщениям',
    emoji: '💬',
    describe: (row) => `**${row.messages}** сообщений · Уровень **${row.level}**`,
  },
  voice: {
    title: 'Топ по времени в голосе',
    emoji: '🎧',
    describe: (row) => `**${humanDuration(row.voiceSeconds * 1_000)}** в голосе`,
  },
};

export default {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Таблица лидеров по активности')
    .addStringOption((option) =>
      option
        .setName('metric')
        .setDescription('Что считаем')
        .addChoices(
          { name: 'XP и уровни', value: 'xp' },
          { name: 'Сообщения', value: 'messages' },
          { name: 'Время в голосе', value: 'voice' },
        ),
    )
    .addIntegerOption((option) => option.setName('page').setDescription('Страница').setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const metric = (interaction.options.getString('metric') ?? 'xp') as LeaderboardMetric;
    const view = METRICS[metric] ?? METRICS.xp;
    const page = interaction.options.getInteger('page') ?? 1;
    const rows = getLeaderboard(interaction.guild.id, 100, metric);
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    const medals = ['🥇', '🥈', '🥉'];
    const fields = slice.map((row, index) => ({
      label: `${medals[index] ?? `#${(safePage - 1) * PAGE_SIZE + index + 1}`} <@${row.userId}>`,
      value: view.describe(row),
      block: true,
    }));

    await interaction.editReply({
      components: [
        buildEmbed({
          tone: 'premium',
          title: view.title,
          emoji: view.emoji,
          description: rows.length === 0 ? 'Пока нет данных.' : `Участников: **${rows.length}**`,
          fields,
          footer: `🔖 Страница ${safePage} из ${totalPages}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
