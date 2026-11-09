import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { showAppealModalForCase, showAppealPicker } from '../../features/appealsFlow.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { listAppeals } from '../../lib/appeals.js';
import { setAppealChannel } from '../../lib/modSettings.js';
import { truncate } from '../../lib/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Апелляции на наказания')
    .addSubcommand((sub) =>
      sub
        .setName('submit')
        .setDescription('Подать апелляцию на наказание')
        .addIntegerOption((option) =>
          option
            .setName('case')
            .setDescription('Номер кейса (если знаете; иначе бот покажет список)')
            .setMinValue(1),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Настроить канал апелляций')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал апелляций').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Показать ожидающие апелляции')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'submit') {
      const caseId = interaction.options.getInteger('case');
      if (caseId) await showAppealModalForCase(interaction, caseId);
      else await showAppealPicker(interaction);
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'channel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.editReply({
          components: [errorCard('Нужно право «Управление сервером».')],
          flags: V2,
        });
        return;
      }

      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }

      setAppealChannel(interaction.guild.id, channel.id);
      await interaction.editReply({
        components: [successCard('📨 Апелляции', `Канал апелляций: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'list') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.editReply({
          components: [errorCard('Нужно право «Управление сервером».')],
          flags: V2,
        });
        return;
      }

      const appeals = listAppeals(interaction.guild.id, 'pending');
      const fields = appeals.slice(0, 10).map((appeal) => ({
        label: `#${appeal.id} · <t:${Math.floor(appeal.createdAt / 1_000)}:d>`,
        value:
          `<@${appeal.userId}>` +
          (appeal.caseId ? ` · кейс #${appeal.caseId}` : '') +
          `\n${truncate(appeal.reason, 300)}`,
        block: true,
      }));

      await interaction.editReply({
        components: [
          card({
            tone: 'info',
            title: '📨 Ожидающие апелляции',
            description: `Всего: **${appeals.length}**`,
            fields:
              fields.length > 0
                ? fields
                : [{ label: 'Пусто', value: 'Ожидающих апелляций нет.', block: false }],
            timestamp: false,
          }),
        ],
        flags: V2,
      });
    }
  },
} satisfies Command;
