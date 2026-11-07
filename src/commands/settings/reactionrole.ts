import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildTextBasedChannel,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { addReactionRole, listReactionRoles, removeReactionRole } from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Роли по реакциям')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить реакционную роль')
        .addStringOption((option) =>
          option.setName('message_id').setDescription('ID сообщения').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('emoji').setDescription('Эмодзи').setRequired(true),
        )
        .addRoleOption((option) => option.setName('role').setDescription('Роль').setRequired(true))
        .addChannelOption((option) => option.setName('channel').setDescription('Канал сообщения')),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Убрать реакционную роль')
        .addStringOption((option) =>
          option.setName('message_id').setDescription('ID сообщения').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('emoji').setDescription('Эмодзи').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Список реакционных ролей'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'add') {
      const messageId = interaction.options.getString('message_id', true);
      const emoji = interaction.options.getString('emoji', true);
      const role = interaction.options.getRole('role', true);
      const channel =
        (interaction.options.getChannel('channel') as GuildTextBasedChannel | null) ??
        (interaction.channel as GuildTextBasedChannel | null);

      if (!channel?.isTextBased()) {
        await interaction.editReply({
          components: [errorCard('Нужен текстовый канал.')],
          flags: V2,
        });
        return;
      }

      if (role.id === interaction.guild.id || role.managed) {
        await interaction.editReply({
          components: [errorCard('Эту роль нельзя использовать.')],
          flags: V2,
        });
        return;
      }

      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) {
        await interaction.editReply({
          components: [errorCard('Сообщение не найдено.')],
          flags: V2,
        });
        return;
      }

      addReactionRole(guildId, message.id, emoji, role.id);
      await interaction.editReply({
        components: [
          successCard('🎭 Реакционные роли', `Сообщение \`${message.id}\` · ${emoji} → ${role}`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'remove') {
      const messageId = interaction.options.getString('message_id', true);
      const emoji = interaction.options.getString('emoji', true);
      const removed = removeReactionRole(guildId, messageId, emoji);
      await interaction.editReply({
        components: [
          removed
            ? successCard('🎭 Реакционные роли', 'Связка удалена.')
            : errorCard('Связка не найдена.'),
        ],
        flags: V2,
      });
      return;
    }

    const roles = listReactionRoles(guildId);
    const fields = roles.slice(0, 20).map((item) => ({
      label: `${item.emoji} → <@&${item.roleId}>`,
      value: `сообщение \`${item.messageId}\``,
      block: true,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '🎭 Реакционные роли',
          description: roles.length > 0 ? `Всего: **${roles.length}**` : 'Список пуст.',
          fields,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
