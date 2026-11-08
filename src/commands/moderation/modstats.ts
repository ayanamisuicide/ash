import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { caseTypeLabel, countCasesByType } from '../../lib/cases.js';

export default {
  data: new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('Статистика модерации')
    .addUserOption((option) =>
      option.setName('moderator').setDescription('Только по конкретному модератору'),
    )
    .addBooleanOption((option) => option.setName('export').setDescription('Экспортировать в CSV'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const moderator = interaction.options.getUser('moderator');
    const counts = countCasesByType(interaction.guild.id, { moderatorId: moderator?.id });
    const total = counts.reduce((sum, item) => sum + item.count, 0);

    if (interaction.options.getBoolean('export')) {
      const rows = [
        'type,label,count',
        ...counts.map((item) => `${item.type},"${caseTypeLabel(item.type)}",${item.count}`),
      ];
      const file = new AttachmentBuilder(Buffer.from(rows.join('\n'), 'utf8'), {
        name: `modstats-${interaction.guild.id}.csv`,
      });
      await interaction.editReply({
        content: `Кейсов: **${total}**`,
        files: [file],
      });
      return;
    }

    const fields = counts.map((item) => ({
      label: caseTypeLabel(item.type),
      value: String(item.count),
      block: false,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '📊 Статистика модерации',
          description: moderator ? `Модератор: ${moderator}` : 'По всему серверу',
          thumbnail: moderator?.displayAvatarURL() ?? interaction.guild.iconURL(),
          fields:
            fields.length > 0
              ? [{ label: 'Всего кейсов', value: String(total), block: false }, ...fields]
              : [{ label: 'Кейсов', value: '0', block: false }],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
