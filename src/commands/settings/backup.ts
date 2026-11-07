import fs from 'node:fs';
import path from 'node:path';
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { BACKUP_DIR, backupDatabase } from '../../storage/sqlite.js';

function backupFiles(): string[] {
  if (!BACKUP_DIR || !fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('bot-') && name.endsWith('.sqlite'))
    .sort();
}

export default {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('Бэкапы SQLite')
    .addSubcommand((sub) => sub.setName('create').setDescription('Создать бэкап сейчас'))
    .addSubcommand((sub) => sub.setName('list').setDescription('Показать последние бэкапы'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'create') {
      const file = backupDatabase();
      if (!file) {
        await interaction.editReply({
          components: [errorCard('Не удалось создать бэкап. Проверьте логи.')],
          flags: V2,
        });
        return;
      }

      const stats = fs.statSync(file);
      await interaction.editReply({
        components: [
          successCard(
            '💾 Бэкап создан',
            `\`${path.basename(file)}\` · ${(stats.size / 1024 / 1024).toFixed(2)} МБ`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    const files = backupFiles().slice(-10).reverse();
    if (files.length === 0) {
      await interaction.editReply({
        components: [
          card({
            tone: 'info',
            title: '💾 Бэкапы',
            description: 'Бэкапов пока нет.',
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    const fields = files.map((name) => {
      const full = path.join(BACKUP_DIR, name);
      const stats = fs.statSync(full);
      return {
        label: name,
        value: `${(stats.size / 1024 / 1024).toFixed(2)} МБ · <t:${Math.floor(stats.mtimeMs / 1_000)}:f>`,
        block: true,
      };
    });

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '💾 Бэкапы',
          description: `Всего: **${backupFiles().length}** · показаны последние ${files.length}.`,
          fields,
          footer: BACKUP_DIR || 'бэкапы отключены',
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
