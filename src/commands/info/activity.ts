import {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard } from '../../lib/card.js';
import { listActivity, type ActivityEntry } from '../../lib/community.js';
import { humanDuration } from '../../lib/format.js';

function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function iso(timestamp: number): string {
  return timestamp > 0 ? new Date(timestamp).toISOString() : '';
}

function activityCsv(rows: ActivityEntry[]): string {
  const header = [
    'user_id',
    'level',
    'xp',
    'messages',
    'voice_seconds',
    'voice_hours',
    'last_message_at',
    'last_xp_at',
  ];
  const lines = [header.join(';')];

  for (const row of rows) {
    lines.push(
      [
        row.userId,
        row.level,
        row.xp,
        row.messages,
        row.voiceSeconds,
        Math.round((row.voiceSeconds / 3_600) * 100) / 100,
        iso(row.lastMessageAt),
        iso(row.lastXpAt),
      ]
        .map(csvCell)
        .join(';'),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Статистика активности участников')
    .addSubcommand((sub) => sub.setName('summary').setDescription('Сводка по серверу'))
    .addSubcommand((sub) =>
      sub
        .setName('export')
        .setDescription('Выгрузить всех участников в CSV (нужно «Управление сервером»)'),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'export') {
      const canExport = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
      if (!canExport) {
        await interaction.reply({
          components: [errorCard('Выгрузка доступна с правом «Управление сервером».')],
          flags: V2 | MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const rows = listActivity(guildId);
      if (rows.length === 0) {
        await interaction.editReply({
          components: [errorCard('Данных об активности пока нет.')],
          flags: V2,
        });
        return;
      }

      const csv = activityCsv(rows);
      const file = new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
        name: `activity-${guildId}-${new Date().toISOString().slice(0, 10)}.csv`,
      });

      await interaction.editReply({
        content: `Активность: **${rows.length}** участников · CSV с уровнями, XP, сообщениями и голосом.`,
        files: [file],
      });
      return;
    }

    await interaction.deferReply();
    const rows = listActivity(guildId);
    if (rows.length === 0) {
      await interaction.editReply({
        components: [
          card({
            tone: 'neutral',
            title: '📊 Активность',
            description: 'Данных пока нет. Статистика начнёт собираться после сообщений и голоса.',
            timestamp: false,
          }),
        ],
        flags: V2,
      });
      return;
    }

    const totalMessages = rows.reduce((sum, row) => sum + row.messages, 0);
    const totalVoice = rows.reduce((sum, row) => sum + row.voiceSeconds, 0);
    const topMessages = [...rows].sort((a, b) => b.messages - a.messages).slice(0, 3);
    const topVoice = [...rows].sort((a, b) => b.voiceSeconds - a.voiceSeconds).slice(0, 3);

    await interaction.editReply({
      components: [
        card({
          tone: 'premium',
          title: '📊 Активность сервера',
          description: `Участников с активностью: **${rows.length}**`,
          fields: [
            { label: 'Сообщений', value: String(totalMessages), block: false },
            { label: 'В голосе', value: humanDuration(totalVoice * 1_000), block: false },
            {
              label: 'Топ по сообщениям',
              value:
                topMessages
                  .filter((row) => row.messages > 0)
                  .map((row, index) => `${index + 1}. <@${row.userId}> — **${row.messages}**`)
                  .join('\n') || 'нет данных',
              block: true,
            },
            {
              label: 'Топ по голосу',
              value:
                topVoice
                  .filter((row) => row.voiceSeconds > 0)
                  .map(
                    (row, index) =>
                      `${index + 1}. <@${row.userId}> — **${humanDuration(row.voiceSeconds * 1_000)}**`,
                  )
                  .join('\n') || 'нет данных',
              block: true,
            },
          ],
          footer: '🔖 Полная выгрузка: /activity export',
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
