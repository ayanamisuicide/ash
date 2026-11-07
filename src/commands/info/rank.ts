import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { getLevelInfo } from '../../lib/community.js';

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
        card({
          tone: 'info',
          title: '📊 Уровень',
          description: `${user} · **${info.level}** уровень`,
          thumbnail: user.displayAvatarURL(),
          fields: [
            { label: 'XP', value: `${info.xp}`, block: false },
            { label: 'До следующего', value: `${info.needed - info.rest} XP`, block: false },
            { label: 'Прогресс', value: `${info.rest}/${info.needed}`, block: false },
          ],
          footer: `ID: ${user.id}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
