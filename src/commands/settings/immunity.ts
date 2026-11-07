import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import {
  addImmunityRole,
  clearImmunityRoles,
  getImmunityRoles,
  removeImmunityRole,
} from '../../lib/modSettings.js';

export default {
  data: new SlashCommandBuilder()
    .setName('immunity')
    .setDescription('Роли, на которые не действует модерация')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить роль в иммунитет')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Роль').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Убрать роль из иммунитета')
        .addRoleOption((option) =>
          option.setName('role').setDescription('Роль').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Показать роли иммунитета'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Очистить список иммунитета'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const role = interaction.options.getRole('role');

    if (sub === 'add' && role) {
      if (role.id === interaction.guild.id) {
        await interaction.editReply({
          components: [errorCard('Нельзя добавить @everyone в иммунитет.')],
          flags: V2,
        });
        return;
      }
      const added = addImmunityRole(interaction.guild.id, role.id);
      await interaction.editReply({
        components: [
          added
            ? successCard('🛡️ Иммунитет', `${role} добавлена в список.`)
            : errorCard(`${role} уже в списке иммунитета.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'remove' && role) {
      const removed = removeImmunityRole(interaction.guild.id, role.id);
      await interaction.editReply({
        components: [
          removed
            ? successCard('🛡️ Иммунитет', `${role} убрана из списка.`)
            : errorCard(`${role} не найдена в списке иммунитета.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'clear') {
      clearImmunityRoles(interaction.guild.id);
      await interaction.editReply({
        components: [successCard('🛡️ Иммунитет', 'Список иммунитета очищен.')],
        flags: V2,
      });
      return;
    }

    const roles = getImmunityRoles(interaction.guild.id);
    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '🛡️ Иммунитет',
          description:
            roles.length > 0
              ? roles.map((id) => `<@&${id}>`).join('\n')
              : 'Список пуст.',
          footer: `Ролей: ${roles.length}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
