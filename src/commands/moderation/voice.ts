import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, errorCard } from '../../lib/card.js';
import { voiceAction, type VoiceAction } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

const SUBCOMMANDS: Array<{ name: VoiceAction; description: string }> = [
  { name: 'kick', description: 'Отключить участника от голосового канала' },
  { name: 'move', description: 'Переместить участника в другой голосовой канал' },
  { name: 'mute', description: 'Заглушить участника в голосе' },
  { name: 'unmute', description: 'Разглушить участника в голосе' },
  { name: 'deafen', description: 'Оглушить участника' },
  { name: 'undeafen', description: 'Разоглушить участника' },
];

const ACTION_PERMISSIONS: Record<VoiceAction, bigint> = {
  kick: PermissionFlagsBits.MoveMembers,
  move: PermissionFlagsBits.MoveMembers,
  mute: PermissionFlagsBits.MuteMembers,
  unmute: PermissionFlagsBits.MuteMembers,
  deafen: PermissionFlagsBits.DeafenMembers,
  undeafen: PermissionFlagsBits.DeafenMembers,
};

export default {
  data: (() => {
    const builder = new SlashCommandBuilder()
      .setName('voice')
      .setDescription('Голосовая модерация');

    for (const item of SUBCOMMANDS) {
      builder.addSubcommand((sub) => {
        sub
          .setName(item.name)
          .setDescription(item.description)
          .addUserOption((option) =>
            option.setName('user').setDescription('Участник').setRequired(true),
          );

        if (item.name === 'move') {
          sub.addChannelOption((option) =>
            option
              .setName('channel')
              .setDescription('Куда переместить')
              .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
              .setRequired(true),
          );
        }

        return sub.addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        );
      });
    }

    return builder.setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);
  })(),

  async execute(interaction) {
    await interaction.deferReply();
    const action = interaction.options.getSubcommand(true) as VoiceAction;
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';
    const channel = interaction.options.getChannel('channel');
    const required = ACTION_PERMISSIONS[action];

    if (!interaction.memberPermissions?.has(required)) {
      await interaction.editReply({
        components: [
          errorCard(
            action === 'kick' || action === 'move'
              ? 'Нужно право «Перемещать участников».'
              : action === 'mute' || action === 'unmute'
                ? 'Нужно право «Заглушать участников».'
                : 'Нужно право «Оглушать участников».',
          ),
        ],
        flags: V2,
      });
      return;
    }

    const result = await voiceAction(
      interaction.guild,
      interaction.user.id,
      user.id,
      action,
      reason,
      channel?.id ?? null,
    );

    await replyActionResult(interaction, result, {
      title: '🔊 Голосовая модерация',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
