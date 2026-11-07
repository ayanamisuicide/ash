import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { caseTypeLabel, getCase } from '../../lib/cases.js';

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

    if (!modCase) {
      await interaction.editReply({
        components: [
          card({
            tone: 'danger',
            title: 'Кейс не найден',
            description: `Кейса #${id} на этом сервере нет.`,
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    const fields = [
      { label: 'Тип', value: caseTypeLabel(modCase.type), block: false },
      {
        label: 'Участник',
        value: modCase.userId ? `<@${modCase.userId}>` : '—',
        block: false,
      },
      { label: 'Модератор', value: `<@${modCase.moderatorId}>`, block: false },
      {
        label: 'Создан',
        value: `<t:${Math.floor(modCase.createdAt / 1_000)}:f>`,
        block: false,
      },
      {
        label: 'Истекает',
        value: modCase.expiresAt ? `<t:${Math.floor(modCase.expiresAt / 1_000)}:f>` : 'бессрочно',
        block: false,
      },
      { label: 'Активен', value: modCase.active ? 'да' : 'нет', block: false },
      { label: 'Причина', value: modCase.reason, block: true },
    ];

    if (typeof modCase.extra.channelId === 'string') {
      fields.push({
        label: 'Канал',
        value: `<#${modCase.extra.channelId}>`,
        block: false,
      });
    }
    if (typeof modCase.extra.roleId === 'string') {
      fields.push({ label: 'Роль', value: `<@&${modCase.extra.roleId}>`, block: false });
    }
    if (typeof modCase.extra.warnId === 'string') {
      fields.push({ label: 'ID варна', value: `\`${modCase.extra.warnId}\``, block: false });
    }
    if (typeof modCase.extra.count === 'number') {
      fields.push({ label: 'Количество', value: String(modCase.extra.count), block: false });
    }
    if (typeof modCase.extra.action === 'string') {
      fields.push({ label: 'Действие', value: modCase.extra.action, block: false });
    }
    if (typeof modCase.extra.closedReason === 'string') {
      fields.push({
        label: 'Закрыт',
        value: modCase.extra.closedReason,
        block: false,
      });
    }

    await interaction.editReply({
      components: [
        card({
          tone: modCase.active ? 'warn' : 'info',
          title: `📋 Кейс #${modCase.id}`,
          description: caseTypeLabel(modCase.type),
          fields,
          footer: `ID: ${modCase.userId ?? '—'}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
