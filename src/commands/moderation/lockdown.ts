import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { buildConfirmationView, createConfirmation } from '../../lib/confirmations.js';

export default {
  data: new SlashCommandBuilder()
    .setName('lockdown')
    .setDescription('Заблокировать или разблокировать все текстовые каналы')
    .addBooleanOption((option) =>
      option
        .setName('enabled')
        .setDescription('true — заблокировать, false — разблокировать')
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName('reason').setDescription('Причина').setMaxLength(450),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const enabled = interaction.options.getBoolean('enabled', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    const id = createConfirmation({
      guildId: interaction.guild.id,
      userId: interaction.user.id,
      kind: 'lockdown',
      permission: PermissionFlagsBits.ManageChannels,
      payload: { enabled, reason },
    });

    await interaction.editReply(
      buildConfirmationView(
        id,
        enabled ? '🔒 Подтверждение lockdown' : '🔓 Подтверждение снятия lockdown',
        enabled
          ? 'Заблокировать **все текстовые каналы** сервера?'
          : 'Разблокировать **все каналы**, заблокированные ботом?',
        [{ label: 'Причина', value: reason, block: true }],
      ),
    );
  },
} satisfies Command;
