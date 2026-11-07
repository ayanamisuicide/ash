import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { parseDuration } from '../../lib/format.js';
import { roleAction, tempRole } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Управление ролями участника')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Выдать роль')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Снять роль')
        .addUserOption((option) =>
          option.setName('user').setDescription('С кого').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('temp')
        .setDescription('Выдать роль на время')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('Длительность: 1h, 2d, 1w').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand(true);
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    if (sub === 'temp') {
      const durationMs = parseDuration(interaction.options.getString('duration', true));
      if (!durationMs) {
        await replyActionResult(
          interaction,
          { ok: false, message: 'Неверный формат. Пример: `1h`, `2d`, `1w`.' },
          { title: '🎭 Временная роль' },
        );
        return;
      }

      const result = await tempRole(
        interaction.guild,
        interaction.user.id,
        user.id,
        role.id,
        durationMs,
        reason,
      );
      await replyActionResult(interaction, result, {
        title: '🎭 Временная роль',
        thumbnail: user.displayAvatarURL(),
      });
      return;
    }

    const result = await roleAction(
      interaction.guild,
      interaction.user.id,
      user.id,
      role.id,
      sub === 'add' ? 'add' : 'remove',
      reason,
    );

    await replyActionResult(interaction, result, {
      title: '🎭 Роли',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
