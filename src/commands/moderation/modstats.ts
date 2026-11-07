import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { caseTypeLabel, listCases, type CaseType } from '../../lib/cases.js';

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
    const all = listCases(interaction.guild.id, undefined, 10_000);
    const cases = moderator ? all.filter((modCase) => modCase.moderatorId === moderator.id) : all;

    const counts = new Map<string, number>();
    for (const modCase of cases) {
      counts.set(modCase.type, (counts.get(modCase.type) ?? 0) + 1);
    }

    if (interaction.options.getBoolean('export')) {
      const rows = [
        'type,label,count',
        ...[...counts.entries()].map(
          ([type, count]) => `${type},"${caseTypeLabel(type as CaseType)}",${count}`,
        ),
      ];
      const file = new AttachmentBuilder(Buffer.from(rows.join('\n'), 'utf8'), {
        name: `modstats-${interaction.guild.id}.csv`,
      });
      await interaction.editReply({
        content: `Кейсов: **${cases.length}**`,
        files: [file],
      });
      return;
    }

    const fields = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({
        label: caseTypeLabel(type as CaseType),
        value: String(count),
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
              ? [{ label: 'Всего кейсов', value: String(cases.length), block: false }, ...fields]
              : [{ label: 'Кейсов', value: '0', block: false }],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
