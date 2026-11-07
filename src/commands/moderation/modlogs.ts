import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { caseTypeLabel, listCases } from '../../lib/cases.js';
import { truncate } from '../../lib/logging.js';

const PAGE_SIZE = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('История модерации участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('Чья история').setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName('page').setDescription('Страница').setMinValue(1),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user', true);
    const page = interaction.options.getInteger('page') ?? 1;
    const all = listCases(interaction.guild.id, user.id, 1000);
    const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = all.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

    if (all.length === 0) {
      await interaction.editReply({
        components: [
          card({
            tone: 'info',
            title: '📋 История модерации',
            description: `${user} — кейсов нет.`,
            thumbnail: user.displayAvatarURL(),
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    const fields = slice.map((modCase) => ({
      label: `#${modCase.id} · ${caseTypeLabel(modCase.type)} · <t:${Math.floor(modCase.createdAt / 1_000)}:d>`,
      value: `${truncate(modCase.reason, 400)}\n-# Модератор: <@${modCase.moderatorId}>${modCase.active ? ' · активно' : ''}`,
      block: true,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '📋 История модерации',
          description: `${user} · всего кейсов: **${all.length}**`,
          thumbnail: user.displayAvatarURL(),
          fields,
          footer: `Страница ${safePage} из ${totalPages} · ID: ${user.id}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
