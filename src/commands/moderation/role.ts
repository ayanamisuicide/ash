import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { buildConfirmationView, createConfirmation } from '../../lib/confirmations.js';
import { parseDuration } from '../../lib/format.js';
import { truncate } from '../../lib/logging.js';
import { roleAction, tempRole } from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';

export default {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Управление ролями участника')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Выдать роль')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Снять одну роль')
        .addUserOption((option) =>
          option.setName('user').setDescription('С кого').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Снять все управляемые роли')
        .addUserOption((option) =>
          option.setName('user').setDescription('С кого снять все роли').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Заменить все управляемые роли одной')
        .addUserOption((option) =>
          option.setName('user').setDescription('Кому установить роль').setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какая роль должна остаться').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('temp')
        .setDescription('Выдать роль на время')
        .addUserOption((option) => option.setName('user').setDescription('Кому').setRequired(true))
        .addRoleOption((option) =>
          option.setName('role').setDescription('Какую роль').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('Длительность: 1h, 2d, 1w').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('reason').setDescription('Причина').setMaxLength(450),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Показать роли участника')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чьи роли показать').setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const ephemeral = sub === 'clear' || sub === 'set' || sub === 'list';
    await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'Без причины';

    if (sub === 'list') {
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        await replyActionResult(
          interaction,
          { ok: false, message: 'Участник не найден на сервере.' },
          { title: '🎭 Роли участника' },
        );
        return;
      }

      const roles = [...member.roles.cache.values()]
        .filter((role) => role.id !== interaction.guild.id)
        .sort((a, b) => b.position - a.position);
      const description =
        roles.length > 0
          ? truncate(roles.map((role) => `<@&${role.id}>`).join(' '), 3_500)
          : 'У участника нет ролей.';

      await interaction.editReply({
        components: [
          card({
            tone: 'info',
            title: '🎭 Роли участника',
            description,
            thumbnail: user.displayAvatarURL(),
            fields: [
              { label: 'Участник', value: `${user}`, block: false },
              { label: 'Всего', value: String(roles.length), block: false },
            ],
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'clear') {
      const confirmationId = createConfirmation({
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        kind: 'roleclear',
        permission: PermissionFlagsBits.ManageRoles,
        payload: { userId: user.id, reason },
      });

      await interaction.editReply(
        buildConfirmationView(
          confirmationId,
          '🎭 Снять все роли?',
          `Снять все управляемые роли с ${user}? Managed-роли интеграций останутся.`,
          [
            { label: 'Участник', value: `${user}`, block: false },
            { label: 'Причина', value: reason, block: true },
          ],
        ),
      );
      return;
    }

    const role = interaction.options.getRole('role', true);

    if (sub === 'set') {
      const confirmationId = createConfirmation({
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        kind: 'setrole',
        permission: PermissionFlagsBits.ManageRoles,
        payload: { userId: user.id, roleId: role.id, reason },
      });

      await interaction.editReply(
        buildConfirmationView(
          confirmationId,
          '🎭 Заменить все роли?',
          `Заменить все управляемые роли участника ${user} на ${role}?`,
          [
            { label: 'Участник', value: `${user}`, block: false },
            { label: 'Роль', value: `${role}`, block: false },
            { label: 'Причина', value: reason, block: true },
          ],
        ),
      );
      return;
    }

    if (sub === 'temp') {
      const durationMs = parseDuration(interaction.options.getString('duration', true));
      if (!durationMs) {
        await replyActionResult(
          interaction,
          { ok: false, message: 'Неверный формат. Пример: `1h`, `2d`, `1w`.' },
          { title: '🎭 Временная роль' },
        );
        return;
      }

      const result = await tempRole(
        interaction.guild,
        interaction.user.id,
        user.id,
        role.id,
        durationMs,
        reason,
      );
      await replyActionResult(interaction, result, {
        title: '🎭 Временная роль',
        thumbnail: user.displayAvatarURL(),
      });
      return;
    }

    const result = await roleAction(
      interaction.guild,
      interaction.user.id,
      user.id,
      role.id,
      sub === 'add' ? 'add' : 'remove',
      reason,
    );

    await replyActionResult(interaction, result, {
      title: sub === 'add' ? '🎭 Выдача роли' : '🎭 Снятие роли',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
