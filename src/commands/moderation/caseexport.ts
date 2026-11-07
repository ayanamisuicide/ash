import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, errorCard } from '../../lib/card.js';
import { listCases } from '../../lib/cases.js';

function csvEscape(value: string): string {
  return `"${value.replaceAll('"', '""').replaceAll('\n', ' ')}"`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('caseexport')
    .setDescription('Экспорт кейсов сервера в JSON или CSV')
    .addStringOption((option) =>
      option
        .setName('format')
        .setDescription('Формат файла')
        .addChoices({ name: 'JSON', value: 'json' }, { name: 'CSV', value: 'csv' })
        .setRequired(true),
    )
    .addUserOption((option) =>
      option.setName('user').setDescription('Только кейсы этого участника'),
    )
    .addIntegerOption((option) =>
      option
        .setName('limit')
        .setDescription('Сколько последних кейсов (1–10000)')
        .setMinValue(1)
        .setMaxValue(10_000),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const format = interaction.options.getString('format', true);
    const user = interaction.options.getUser('user');
    const limit = interaction.options.getInteger('limit') ?? 1_000;
    const cases = listCases(interaction.guild.id, user?.id, limit);

    if (cases.length === 0) {
      await interaction.editReply({
        components: [errorCard('Кейсов для экспорта нет.')],
        flags: V2,
      });
      return;
    }

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(cases, null, 2);
    } else {
      const header = [
        'id',
        'type',
        'userId',
        'moderatorId',
        'reason',
        'createdAt',
        'expiresAt',
        'active',
        'extra',
      ];
      const rows = cases.map((item) =>
        [
          String(item.id),
          item.type,
          item.userId ?? '',
          item.moderatorId,
          item.reason,
          new Date(item.createdAt).toISOString(),
          item.expiresAt ? new Date(item.expiresAt).toISOString() : '',
          item.active ? 'true' : 'false',
          JSON.stringify(item.extra),
        ]
          .map((value) => csvEscape(value))
          .join(','),
      );
      content = [header.join(','), ...rows].join('\n');
    }

    const extension = format === 'json' ? 'json' : 'csv';
    const file = new AttachmentBuilder(Buffer.from(content, 'utf8'), {
      name: `cases-${interaction.guild.id}.${extension}`,
    });

    await interaction.editReply({
      content: `Кейсов: **${cases.length}**`,
      files: [file],
    });
  },
} satisfies Command;
