import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import {
  getCommunitySettings,
  listTempVoices,
  updateCommunitySettings,
} from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tempvoice')
    .setDescription('Временные голосовые каналы')
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Настроить канал «зайти, чтобы создать»')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Голосовой канал')
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Выключить временные каналы'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isVoiceBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен голосовой канал.')],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, { tempVoiceChannelId: channel.id });
      await interaction.editReply({
        components: [successCard('🔊 TempVoice', `Канал-триггер: <#${channel.id}>.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'disable') {
      updateCommunitySettings(guildId, { tempVoiceChannelId: null });
      await interaction.editReply({
        components: [successCard('🔊 TempVoice', 'Временные каналы выключены.')],
        flags: V2,
      });
      return;
    }

    const settings = getCommunitySettings(guildId);
    const active = listTempVoices(guildId);
    await interaction.editReply({
      components: [
        card({
          tone: settings.tempVoiceChannelId ? 'success' : 'neutral',
          title: '🔊 TempVoice',
          description: settings.tempVoiceChannelId
            ? `Триггер: <#${settings.tempVoiceChannelId}>`
            : 'Выключено',
          fields: [
            {
              label: 'Активных каналов',
              value: String(active.length),
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
