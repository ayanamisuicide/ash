import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, errorCard } from '../../lib/card.js';
import { getCase } from '../../lib/cases.js';
import { caseDetailsCard } from '../../lib/responses.js';

export default {
  data: new SlashCommandBuilder()
    .setName('case')
    .setDescription('Показать модерационный кейс по номеру')
    .addIntegerOption((option) =>
      option.setName('id').setDescription('Номер кейса').setRequired(true).setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.options.getInteger('id', true);
    const modCase = getCase(interaction.guild.id, id);

    await interaction.editReply({
      components: [
        modCase ? caseDetailsCard(modCase) : errorCard(`Кейса #${id} на этом сервере нет.`),
      ],
      flags: V2,
    });
  },
} satisfies Command;
