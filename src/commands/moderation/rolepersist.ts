import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import {
  clearPersistedRoles,
  getPersistedRoles,
  removePersistedRole,
  setPersistedRoles,
} from '../../lib/rolepersist.js';

export default {
  data: new SlashCommandBuilder()
    .setName('rolepersist')
    .setDescription('Роли, которые возвращаются после повторного захода')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить роль в список')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Убрать роль из списка')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Показать роли')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чьи роли').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Очистить список')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чьи роли').setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role');

    if (sub === 'add' && role) {
      if (role.id === interaction.guild.id || role.managed) {
        await interaction.editReply({
          components: [errorCard('Эту роль нельзя сохранять.')],
          flags: V2,
        });
        return;
      }

      const current = getPersistedRoles(interaction.guild.id, user.id);
      setPersistedRoles(interaction.guild.id, user.id, [...current, role.id]);
      await interaction.editReply({
        components: [successCard('🔁 Rolepersist', `${role} добавлена в список ${user}.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'remove' && role) {
      const removed = removePersistedRole(interaction.guild.id, user.id, role.id);
      await interaction.editReply({
        components: [
          removed
            ? successCard('🔁 Rolepersist', `${role} убрана из списка ${user}.`)
            : errorCard(`${role} не найдена в списке.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'clear') {
      clearPersistedRoles(interaction.guild.id, user.id);
      await interaction.editReply({
        components: [successCard('🔁 Rolepersist', `Список ролей ${user} очищен.`)],
        flags: V2,
      });
      return;
    }

    const roles = getPersistedRoles(interaction.guild.id, user.id);
    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '🔁 Rolepersist',
          description:
            roles.length > 0 ? roles.map((roleId) => `<@&${roleId}>`).join('\n') : 'Список пуст.',
          footer: `Ролей: ${roles.length} · ID: ${user.id}`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
