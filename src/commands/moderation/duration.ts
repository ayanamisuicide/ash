import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { caseTypeLabel, getCase, updateCase } from '../../lib/cases.js';
import { addCaseEvent } from '../../lib/caseEvents.js';
import { parseDuration } from '../../lib/format.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('duration')
    .setDescription('Изменить срок временного наказания')
    .addIntegerOption((option) =>
      option.setName('case_id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
    )
    .addStringOption((option) =>
      option
        .setName('duration')
        .setDescription('Новый срок: 1h, 2d, 1w, permanent')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const caseId = interaction.options.getInteger('case_id', true);
    const input = interaction.options.getString('duration', true).trim();
    const existing = getCase(interaction.guild.id, caseId);

    if (!existing) {
      await replyActionResult(
        interaction,
        { ok: false, message: `Кейс #${caseId} не найден.` },
        { title: '⏳ Срок наказания' },
      );
      return;
    }

    if (!['ban', 'tempban', 'timeout', 'mute', 'temprole'].includes(existing.type)) {
      await replyActionResult(
        interaction,
        {
          ok: false,
          message: `Для кейса «${caseTypeLabel(existing.type)}» срок изменить нельзя.`,
        },
        { title: '⏳ Срок наказания' },
      );
      return;
    }

    const permanent = input === '0' || input.toLowerCase() === 'permanent';
    const durationMs = permanent ? null : parseDuration(input);
    if (!permanent && !durationMs) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Неверный формат. Пример: `1h`, `2d`, `1w`, `permanent`.' },
        { title: '⏳ Срок наказания' },
      );
      return;
    }

    const expiresAt = durationMs ? Date.now() + durationMs : null;
    const updated = updateCase(interaction.guild.id, caseId, {
      expiresAt,
      active: true,
    });
    if (updated) {
      addCaseEvent(interaction.guild.id, caseId, interaction.user.id, 'duration', {
        from: existing.expiresAt,
        to: expiresAt,
      });
    }

    await replyActionResult(
      interaction,
      {
        ok: Boolean(updated),
        message: updated
          ? `Срок кейса #${caseId} изменён: ${expiresAt ? `<t:${Math.floor(expiresAt / 1_000)}:f>` : 'бессрочно'}.`
          : `Не удалось изменить кейс #${caseId}.`,
        caseId,
      },
      { title: '⏳ Срок наказания' },
    );
  },
} satisfies Command;
