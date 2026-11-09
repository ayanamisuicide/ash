import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2 } from '../../lib/card.js';
import { getLevelInfo } from '../../lib/community.js';
import { buildEmbed, formatEmbedDate } from '../../lib/embeds.js';
import { progressBar } from '../../lib/responses.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Показать уровень участника')
    .addUserOption((option) => option.setName('user').setDescription('Чей уровень')),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') ?? interaction.user;
    const info = getLevelInfo(interaction.guild.id, user.id);

    await interaction.editReply({
      components: [
        buildEmbed({
          tone: 'premium',
          title: 'Уровень',
          emoji: '⭐',
          description: `${user} · **${info.level}** уровень`,
          thumbnail: user.displayAvatarURL(),
          fields: [
            { label: 'Уровень', value: String(info.level), block: false },
            { label: 'XP', value: String(info.xp), block: false },
            { label: 'До следующего', value: `${info.needed - info.rest} XP`, block: false },
            { label: 'Прогресс', value: progressBar(info.rest, info.needed), block: true },
          ],
          footer: `🔖 ID: ${user.id} · ${formatEmbedDate()}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
