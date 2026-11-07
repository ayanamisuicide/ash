import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { setNickname } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setnick')
    .setDescription('Изменить или сбросить ник участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('Участник').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('nickname').setDescription('Новый ник (пусто — сбросить)').setMaxLength(32),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const nickname = interaction.options.getString('nickname');
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const result = await setNickname(
      interaction.guild,
      interaction.user.id,
      user.id,
      nickname,
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '📛 Ник',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
