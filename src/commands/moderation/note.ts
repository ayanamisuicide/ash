import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { getNotes } from '../../lib/notes.js';
import {
  noteAddAction,
  noteClearAction,
  noteRemoveAction,
} from '../../lib/moderation.js';
import { replyActionResult } from '../../lib/reply.js';
import { truncate } from '../../lib/logging.js';

export default {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Внутренние заметки о пользователе')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить заметку')
        .addUserOption((option) =>
          option.setName('user').setDescription('О ком заметка').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('text').setDescription('Текст заметки').setRequired(true).setMaxLength(1000),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('list')
        .setDescription('Показать заметки')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чьи заметки').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Удалить заметку по ID')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чья заметка').setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('id').setDescription('ID заметки').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('clear')
        .setDescription('Удалить все заметки пользователя')
        .addUserOption((option) =>
          option.setName('user').setDescription('Чьи заметки').setRequired(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const user = interaction.options.getUser('user', true);

    if (sub === 'list') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const notes = getNotes(interaction.guild.id, user.id);

      const fields = notes.slice(0, 20).map((note) => ({
        label: `\`${note.id}\` · <t:${Math.floor(note.createdAt / 1_000)}:d>`,
        value: `${truncate(note.text, 800)}\n-# Автор: <@${note.authorId}>`,
        block: true,
      }));

      await interaction.editReply({
        components: [
          card({
            tone: notes.length > 0 ? 'info' : 'success',
            title: '📝 Заметки',
            description: `${user} · **${notes.length}**`,
            thumbnail: user.displayAvatarURL(),
            fields:
              fields.length > 0
                ? fields
                : [{ label: 'Пока пусто', value: 'Заметок нет.', block: false }],
            footer: `ID: ${user.id}`,
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    await interaction.deferReply();

    if (sub === 'add') {
      const text = interaction.options.getString('text', true);
      const result = await noteAddAction(
        interaction.guild,
        interaction.user.id,
        user.id,
        text,
      );
      await replyActionResult(interaction, result, {
        title: '📝 Заметка',
        thumbnail: user.displayAvatarURL(),
      });
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id', true);
      const result = await noteRemoveAction(
        interaction.guild,
        interaction.user.id,
        user.id,
        id,
      );
      await replyActionResult(interaction, result, {
        title: '📝 Удаление заметки',
        thumbnail: user.displayAvatarURL(),
      });
      return;
    }

    const result = await noteClearAction(
      interaction.guild,
      interaction.user.id,
      user.id,
    );
    await replyActionResult(interaction, result, {
      title: '📝 Очистка заметок',
      thumbnail: user.displayAvatarURL(),
    });
  },
} satisfies Command;
