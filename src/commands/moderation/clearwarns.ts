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
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина снятия').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const warnId = interaction.options.getString('warn_id');
    const reason = interaction.options.getString('reason') ?? 'Снятие предупреждений';

    const result = await clearWarnsAction(
      interaction.guild,
      interaction.user.id,
      user.id,
      warnId,
      reason,
    );

    await replyActionResult(interaction, result, {
      action: 'clearWarns',
      target: user,
      moderator: interaction.user,
      reason,
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
