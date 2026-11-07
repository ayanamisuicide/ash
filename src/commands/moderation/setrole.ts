import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { buildConfirmationView, createConfirmation } from '../../lib/confirmations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Заменить все управляемые роли участника одной ролью')
    .addUserOption((option) =>
      option.setName('user').setDescription('Кому установить роль').setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName('role').setDescription('Какая роль должна остаться').setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const id = createConfirmation({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      kind: 'setrole',
      permission: PermissionFlagsBits.ManageRoles,
      payload: {
        userId: user.id,
        roleId: role.id,
        reason,
      },
    });

    await interaction.editReply(
      buildConfirmationView(
        id,
        '🎭 Подтверждение setrole',
        `Заменить все управляемые роли участника ${user} на ${role}?`,
        [
          { label: 'Участник', value: `${user}`, block: false },
          { label: 'Роль', value: `${role}`, block: false },
          { label: 'Причина', value: reason, block: true },
        ],
      ),
    );
  },
} satisfies Command;
