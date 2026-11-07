import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { parseDuration } from '../../lib/format.js';
import { tempbanUser } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

const DELETE_CHOICES = [
  { name: 'не удалять', value: '0' },
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('tempban')
    .setDescription('Забанить участника на время')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кого забанить').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('duration').setDescription('Длительность: 1h, 2d, 1w').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .addStringOption((option) =>
      option
        .setName('delete_messages')
        .setDescription('Удалить сообщения за период')
        .addChoices(...DELETE_CHOICES),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    await interaction.deferReply();
    const user = interaction.options.getUser('user', true);
    const durationInput = interaction.options.getString('duration', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(interaction.options.getString('delete_messages') ?? '0');
    const durationMs = parseDuration(durationInput);

    if (!durationMs) {
      await replyActionResult(
        interaction,
        { ok: false, message: 'Неверный формат. Пример: `1h`, `2d`, `1w`.' },
        { title: '⏳ Временный бан' },
      );
      return;
    }

    const result = await tempbanUser(
      interaction.guild,
      interaction.user.id,
      user.id,
      durationMs,
      reason,
      Number.isFinite(deleteSeconds) ? deleteSeconds : 0,
    );

    await replyActionResult(interaction, result, {
      title: '⏳ Временный бан',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
