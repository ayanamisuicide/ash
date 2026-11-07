import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { createAppeal, findPendingAppeal, listAppeals, updateAppeal } from '../../lib/appeals.js';
import { getLogChannel } from '../../lib/logger.js';
import { getModerationSettings, setAppealChannel } from '../../lib/modSettings.js';
import { truncate } from '../../lib/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Апелляции на наказания')
    .addSubcommand((sub) =>
      sub
        .setName('submit')
        .setDescription('Подать апелляцию')
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Почему наказание стоит снять')
            .setRequired(true)
            .setMaxLength(1000),
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
        value: `<@${appeal.userId}>\n${truncate(appeal.reason, 300)}`,
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
      return;
    }

    const reason = interaction.options.getString('reason', true);
    const existing = findPendingAppeal(interaction.guild.id, interaction.user.id);
    if (existing) {
      await interaction.editReply({
        components: [
          errorCard(`У тебя уже есть апелляция #${existing.id} на рассмотрении. Дождись ответа.`),
        ],
        flags: V2,
      });
      return;
    }

    const settings = getModerationSettings(interaction.guild.id);
    const target =
      (settings.appealChannelId
        ? interaction.guild.channels.cache.get(settings.appealChannelId)
        : null) ?? getLogChannel(interaction.guild);

    if (!target || !target.isTextBased()) {
      await interaction.editReply({
        components: [
          errorCard(
            'Канал апелляций не настроен. Попросите администратора выполнить `/appeal channel`.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    const appeal = createAppeal(interaction.guild.id, interaction.user.id, reason);
    const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`appeal:approve:${interaction.guild.id}:${appeal.id}`)
        .setLabel('Одобрить')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`appeal:reject:${interaction.guild.id}:${appeal.id}`)
        .setLabel('Отклонить')
        .setEmoji('❌')
        .setStyle(ButtonStyle.Danger),
    );

    const message = await target
      .send({
        components: [
          card({
            tone: 'warn',
            title: `📨 Апелляция #${appeal.id}`,
            description: reason,
            fields: [
              { label: 'Пользователь', value: `${interaction.user}`, block: false },
              { label: 'ID', value: interaction.user.id, block: false },
            ],
            buttons: [row],
            footer: `Создана <t:${Math.floor(appeal.createdAt / 1_000)}:f>`,
            timestamp: false,
          }),
        ],
        flags: V2,
      })
      .catch(() => null);

    if (!message) {
      await interaction.editReply({
        components: [errorCard('Не удалось отправить апелляцию в канал.')],
        flags: V2,
      });
      return;
    }

    updateAppeal(interaction.guild.id, appeal.id, {
      channelId: target.id,
      messageId: message.id,
    });

    await interaction.editReply({
      components: [
        successCard('📨 Апелляция отправлена', `Апелляция #${appeal.id} отправлена модераторам.`),
      ],
      flags: V2,
    });
  },
} satisfies Command;
