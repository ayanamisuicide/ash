import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2 } from '../../lib/card.js';
import { getLevelInfo, getMemberRanks } from '../../lib/community.js';
import { buildEmbed, formatEmbedDate } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';
import { progressBar } from '../../lib/responses.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Показать уровень и активность участника')
    .addUserOption((option) => option.setName('user').setDescription('Чей уровень')),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user') ?? interaction.user;
    const info = getLevelInfo(interaction.guild.id, user.id);
    const ranks = getMemberRanks(interaction.guild.id, user.id);

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
            { label: 'Сообщений', value: String(info.messages), block: false },
            {
              label: 'В голосе',
              value: humanDuration(info.voiceSeconds * 1_000),
              block: false,
            },
            {
              label: 'Место в топе',
              value: ranks.xp > 0 ? `#${ranks.xp}` : '—',
              block: false,
            },
          ],
          footer: `🔖 ID: ${user.id} · ${formatEmbedDate()}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
