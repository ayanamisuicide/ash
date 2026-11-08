import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { V2, card } from '../../lib/card.js';
import { findCaseByWarnId } from '../../lib/cases.js';
import { fitFields, truncate } from '../../lib/logging.js';
import { getWarns } from '../../lib/warns.js';
import type { Command } from '../../core/types.js';

const MAX_SHOWN = 10;

export default {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Показать предупреждения участника')
    .addUserOption((option) =>
      option.setName('user').setDescription('Чьи предупреждения').setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const user = interaction.options.getUser('user', true);
    const warns = getWarns(interaction.guild.id, user.id);

    const fields = warns.slice(0, MAX_SHOWN).map((warn) => {
      const modCase = findCaseByWarnId(interaction.guild.id, user.id, warn.id);
      return {
        label: `#${warn.id} · кейс #${modCase?.id ?? '—'} · <t:${Math.floor(warn.createdAt / 1_000)}:d>`,
        value: `${truncate(warn.reason, 900)}\n-# Выдал: <@${warn.moderatorId}>`,
        block: true,
      };
    });

    if (warns.length === 0) {
      fields.push({ label: 'Пока пусто', value: 'Предупреждений нет. 🎉', block: false });
    }

    await interaction.editReply({
      components: [
        card({
          tone: warns.length ? 'warn' : 'success',
          title: '📋 Предупреждения',
          description: `${user} · **${warns.length}**`,
          thumbnail: user.displayAvatarURL(),
          fields: fitFields(fields),
          footer:
            warns.length > MAX_SHOWN
              ? `Показаны первые ${MAX_SHOWN} из ${warns.length} · ID: ${user.id}`
              : `ID: ${user.id}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
