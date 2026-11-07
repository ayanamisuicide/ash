import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { getLogChannel } from '../../lib/logger.js';
import { getModerationSettings, setReportChannel } from '../../lib/modSettings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('report')
    .setDescription('Жалоба на участника или настройка канала жалоб')
    .addSubcommand((sub) =>
      sub
        .setName('user')
        .setDescription('Пожаловаться на участника')
        .addUserOption((option) =>
          option.setName('user').setDescription('На кого жалоба').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setRequired(true).setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Настроить канал жалоб')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал жалоб').setRequired(true),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);

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

      setReportChannel(interaction.guild.id, channel.id);
      await interaction.editReply({
        components: [successCard('📨 Жалобы', `Канал жалоб: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);
    const settings = getModerationSettings(interaction.guild.id);
    const target =
      (settings.reportChannelId
        ? interaction.guild.channels.cache.get(settings.reportChannelId)
        : null) ?? getLogChannel(interaction.guild);

    if (!target || !target.isTextBased()) {
      await interaction.editReply({
        components: [
          errorCard(
            'Канал жалоб не настроен. Попросите администратора выполнить `/report channel`.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    const sent = await target
      .send({
        components: [
          card({
            tone: 'warn',
            title: '📨 Жалоба',
            description: reason,
            fields: [
              { label: 'На кого', value: `${user} (${user.tag})`, block: false },
              { label: 'Кто пожаловался', value: `${interaction.user}`, block: false },
              { label: 'Канал', value: `<#${interaction.channelId}>`, block: false },
            ],
            footer: `ID: ${user.id}`,
          }),
        ],
        flags: V2,
      })
      .catch(() => null);

    await interaction.editReply({
      components: [
        sent
          ? successCard('📨 Жалоба отправлена', 'Спасибо, модераторы увидят её.')
          : errorCard('Не удалось отправить жалобу в канал.'),
      ],
      flags: V2,
    });
  },
} satisfies Command;
