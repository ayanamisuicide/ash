import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import {
  getCommunitySettings,
  getLevelInfo,
  updateCommunitySettings,
} from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('leveling')
    .setDescription('Система уровней')
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Включить или выключить уровни')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Канал уведомлений о новом уровне')
        .addChannelOption((option) =>
          option.setName('channel').setDescription('Канал').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('message')
        .setDescription('Текст уведомления о новом уровне')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Шаблон: {user}, {level}, {xp}')
            .setRequired(true)
            .setMaxLength(500),
        ),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'enable') {
      const enabled = interaction.options.getBoolean('enabled', true);
      updateCommunitySettings(guildId, { levelingEnabled: enabled });
      await interaction.editReply({
        components: [
          successCard('📊 Уровни', enabled ? 'Система включена.' : 'Система выключена.'),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, { levelupChannelId: channel.id });
      await interaction.editReply({
        components: [successCard('📊 Уровни', `Канал: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'message') {
      const text = interaction.options.getString('text', true);
      updateCommunitySettings(guildId, { levelupMessage: text });
      await interaction.editReply({
        components: [successCard('📊 Уровни', 'Текст уведомления обновлён.')],
        flags: V2,
      });
      return;
    }

    const settings = getCommunitySettings(guildId);
    const info = getLevelInfo(guildId, interaction.user.id);
    await interaction.editReply({
      components: [
        card({
          tone: settings.levelingEnabled ? 'success' : 'neutral',
          title: '📊 Уровни',
          description: settings.levelingEnabled ? 'Включены' : 'Выключены',
          fields: [
            {
              label: 'Канал',
              value: settings.levelupChannelId ? `<#${settings.levelupChannelId}>` : 'не задан',
              block: false,
            },
            { label: 'Шаблон', value: `\`${settings.levelupMessage}\``, block: true },
            {
              label: 'Ваш уровень',
              value: `${info.level} · ${info.rest}/${info.needed} XP`,
              block: false,
            },
          ],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
