import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard } from '../../lib/card.js';
import { updateCommunitySettings } from '../../lib/community.js';
import { closeTicketCommand } from '../../features/tickets.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Система тикетов')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Настроить тикеты')
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Категория для тикетов')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addChannelOption((option) => option.setName('log').setDescription('Канал логов тикетов'))
        .addRoleOption((option) => option.setName('support').setDescription('Роль поддержки')),
    )
    .addSubcommand((sub) =>
      sub.setName('panel').setDescription('Отправить панель создания тикетов'),
    )
    .addSubcommand((sub) => sub.setName('close').setDescription('Закрыть текущий тикет')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'setup') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          components: [errorCard('Нужно право «Управление сервером».')],
          flags: V2 | MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const category = interaction.options.getChannel('category', true);
      const log = interaction.options.getChannel('log');
      const support = interaction.options.getRole('support');

      updateCommunitySettings(interaction.guild.id, {
        ticketCategoryId: category.id,
        ticketLogChannelId: log?.id ?? null,
        ticketSupportRoleId: support?.id ?? null,
      });

      await interaction.editReply({
        components: [
          card({
            tone: 'success',
            title: '🎫 Тикеты',
            description: 'Настройки сохранены.',
            fields: [
              { label: 'Категория', value: `<#${category.id}>`, block: false },
              { label: 'Лог', value: log ? `<#${log.id}>` : 'не задан', block: false },
              {
                label: 'Поддержка',
                value: support ? `${support}` : 'не задана',
                block: false,
              },
            ],
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'panel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
          components: [errorCard('Нужно право «Управление сервером».')],
          flags: V2 | MessageFlags.Ephemeral,
        });
        return;
      }

      const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:open')
          .setLabel('Открыть тикет')
          .setEmoji('🎫')
          .setStyle(ButtonStyle.Primary),
      );

      await interaction.reply({
        components: [
          card({
            tone: 'info',
            title: '🎫 Поддержка',
            description: 'Нажмите кнопку, чтобы открыть тикет.',
            buttons: [row],
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isThread()) {
      await interaction.editReply({
        components: [errorCard('Команда работает только в текстовом канале тикета.')],
        flags: V2,
      });
      return;
    }

    const result = await closeTicketCommand(
      interaction.guild,
      channel,
      interaction.user.id,
      Boolean(
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild),
      ),
    );

    await interaction.editReply({
      components: [
        result.ok
          ? card({
              tone: 'success',
              title: '🎫 Тикет закрыт',
              description: result.message,
              timestamp: false,
            })
          : errorCard(result.message),
      ],
      flags: V2,
    });

    if (result.ok) {
      setTimeout(() => {
        void channel.delete('Тикет закрыт').catch(() => undefined);
      }, 3_000);
    }
  },
} satisfies Command;
