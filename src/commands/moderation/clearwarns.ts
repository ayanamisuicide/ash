import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { clearWarnsAction } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Снять предупреждения участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('С кого снять').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('warn_id').setDescription('ID конкретного предупреждения (иначе — все)'),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const warnId = interaction.options.getString('warn_id');

    const result = await clearWarnsAction(interaction.guild, interaction.user.id, user.id, warnId);

    await replyActionResult(interaction, result, {
      title: result.ok
        ? warnId
          ? '🧽 Предупреждение снято'
          : '🧽 Предупреждения сняты'
        : 'Ошибка',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
