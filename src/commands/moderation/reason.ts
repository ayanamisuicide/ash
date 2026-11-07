import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { getCase, updateCase } from '../../lib/cases.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reason')
    .setDescription('Изменить причину модерационного кейса')
    .addIntegerOption((option) =>
      option.setName('case_id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Новая причина').setRequired(true).setMaxLength(500),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const caseId = interaction.options.getInteger('case_id', true);
    const reason = interaction.options.getString('reason', true);
    const existing = getCase(interaction.guild.id, caseId);

    if (!existing) {
      await replyActionResult(
        interaction,
        { ok: false, message: `Кейс #${caseId} не найден.` },
        { title: '✏️ Причина кейса' },
      );
      return;
    }

    const updated = updateCase(interaction.guild.id, caseId, { reason });
    await replyActionResult(
      interaction,
      {
        ok: Boolean(updated),
        message: updated
          ? `Причина кейса #${caseId} изменена.`
          : `Не удалось изменить кейс #${caseId}.`,
        caseId,
      },
      { title: '✏️ Причина кейса' },
    );
  },
} satisfies Command;
