import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, errorCard, successCard } from '../../lib/card.js';
import { getCommunitySettings, updateCommunitySettings } from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Приветствия и прощания')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Канал приветствий')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Текст приветствия')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Шаблон: {user}, {guild}, {memberCount}')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('goodbye_channel')
        .setDescription('Канал прощаний')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('goodbye_message')
        .setDescription('Текст прощания')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Шаблон: {user}, {guild}, {memberCount}')
            .setRequired(true)
            .setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Выключить приветствия и прощания'),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, { welcomeChannelId: channel.id });
      await interaction.editReply({
        components: [successCard('👋 Приветствия', `Канал: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      updateCommunitySettings(guildId, { welcomeMessage: text });
      await interaction.editReply({
        components: [successCard('👋 Приветствия', 'Текст приветствия обновлён.')],
        flags: V2,
      });
      return;
    }

    if (sub === 'goodbye_channel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, { goodbyeChannelId: channel.id });
      await interaction.editReply({
        components: [successCard('👋 Прощания', `Канал: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'goodbye_message') {
      const text = interaction.options.getString('text', true);
      updateCommunitySettings(guildId, { goodbyeMessage: text });
      await interaction.editReply({
        components: [successCard('👋 Прощания', 'Текст прощания обновлён.')],
        flags: V2,
      });
      return;
    }

    if (sub === 'disable') {
      updateCommunitySettings(guildId, {
        welcomeChannelId: null,
        goodbyeChannelId: null,
      });
      await interaction.editReply({
        components: [successCard('👋 Приветствия', 'Приветствия и прощания выключены.')],
        flags: V2,
      });
      return;
    }

    const settings = getCommunitySettings(guildId);
    await interaction.editReply({
      components: [
        successCard(
          '👋 Приветствия',
          [
            `Приветствия: ${settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : '❌'}`,
            `Прощания: ${settings.goodbyeChannelId ? `<#${settings.goodbyeChannelId}>` : '❌'}`,
            `Шаблон входа: \`${settings.welcomeMessage}\``,
            `Шаблон выхода: \`${settings.goodbyeMessage}\``,
          ].join('\n'),
        ),
      ],
      flags: V2,
    });
  },
} satisfies Command;
