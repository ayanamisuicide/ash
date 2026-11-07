import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { massbanUsers } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

const DELETE_CHOICES = [
  { name: 'не удалять', value: '0' },
  { name: 'последний час', value: '3600' },
  { name: 'последние 24 часа', value: '86400' },
  { name: 'последние 7 дней', value: '604800' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('massban')
    .setDescription('Забанить несколько пользователей по ID')
    .addStringOption((option) =>
      option
        .setName('users')
        .setDescription('ID через запятую или пробел (до 50)')
        .setRequired(true),
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
    const input = interaction.options.getString('users', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const deleteSeconds = Number(
      interaction.options.getString('delete_messages') ?? '0',
    );

    const ids = input.split(/[\s,]+/).map((id) => id.trim()).filter(Boolean);
    const result = await massbanUsers(
      interaction.guild,
      interaction.user.id,
      ids,
      reason,
      Number.isFinite(deleteSeconds) ? deleteSeconds : 0,
    );

    await replyActionResult(interaction, result, { title: '🔨 Массовый бан' });
  },
} satisfies Command;
