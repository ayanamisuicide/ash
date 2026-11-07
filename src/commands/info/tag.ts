import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { deleteTag, getTag, listTags, setTag } from '../../lib/community.js';

export default {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Теги/кастомные ответы')
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('Показать тег')
        .addStringOption((option) =>
          option.setName('name').setDescription('Название').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Список тегов'))
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Создать или изменить тег')
        .addStringOption((option) =>
          option.setName('name').setDescription('Название').setRequired(true).setMaxLength(50),
        )
        .addStringOption((option) =>
          option
            .setName('content')
            .setDescription('Содержимое')
            .setRequired(true)
            .setMaxLength(1900),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Удалить тег')
        .addStringOption((option) =>
          option.setName('name').setDescription('Название').setRequired(true),
        ),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'show') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const name = interaction.options.getString('name', true);
      const tag = getTag(guildId, name);
      await interaction.editReply({
        components: [
          tag
            ? card({
                tone: 'info',
                title: `🏷️ ${tag.name}`,
                description: tag.content,
                footer: `Автор: <@${tag.authorId}>`,
                timestamp: false,
              })
            : errorCard(`Тег \`${name}\` не найден.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const tags = listTags(guildId);
      await interaction.editReply({
        components: [
          card({
            tone: 'info',
            title: '🏷️ Теги',
            description:
              tags.length > 0 ? tags.map((tag) => `\`${tag.name}\``).join(', ') : 'Тегов пока нет.',
            footer: `Всего: ${tags.length}`,
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        components: [errorCard('Нужно право «Управление сервером».')],
        flags: V2 | MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (sub === 'add') {
      const name = interaction.options.getString('name', true);
      const content = interaction.options.getString('content', true);
      const tag = setTag(guildId, name, content, interaction.user.id);
      await interaction.editReply({
        components: [successCard('🏷️ Тег', `Тег \`${tag.name}\` сохранён.`)],
        flags: V2,
      });
      return;
    }

    const name = interaction.options.getString('name', true);
    const removed = deleteTag(guildId, name);
    await interaction.editReply({
      components: [
        removed
          ? successCard('🏷️ Тег', `Тег \`${name}\` удалён.`)
          : errorCard(`Тег \`${name}\` не найден.`),
      ],
      flags: V2,
    });
  },
} satisfies Command;
