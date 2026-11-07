import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, successCard } from '../../lib/card.js';
import { getCommunitySettings, updateCommunitySettings } from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Роли, которые выдаются при входе')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить роль')
        .addRoleOption((option) => option.setName('role').setDescription('Роль').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Убрать роль')
        .addRoleOption((option) => option.setName('role').setDescription('Роль').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Показать роли'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Очистить список'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;
    const current = getCommunitySettings(guildId).autoroleIds;

    if (sub === 'add') {
      const role = interaction.options.getRole('role', true);
      if (role.id === interaction.guild.id || role.managed) {
        await interaction.editReply({
          components: [
            card({ tone: 'danger', title: 'Ошибка', description: 'Эту роль нельзя использовать.' }),
          ],
          flags: V2,
        });
        return;
      }
      updateCommunitySettings(guildId, {
        autoroleIds: current.includes(role.id) ? current : [...current, role.id],
      });
      await interaction.editReply({
        components: [successCard('🎭 Autorole', `${role} добавлена.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'remove') {
      const role = interaction.options.getRole('role', true);
      updateCommunitySettings(guildId, {
        autoroleIds: current.filter((id) => id !== role.id),
      });
      await interaction.editReply({
        components: [successCard('🎭 Autorole', `${role} убрана.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'clear') {
      updateCommunitySettings(guildId, { autoroleIds: [] });
      await interaction.editReply({
        components: [successCard('🎭 Autorole', 'Список очищен.')],
        flags: V2,
      });
      return;
    }

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '🎭 Autorole',
          description:
            current.length > 0
              ? current.map((roleId) => `<@&${roleId}>`).join('\n')
              : 'Список пуст.',
          footer: `Ролей: ${current.length}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
