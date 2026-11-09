import fs from 'node:fs';
import path from 'node:path';
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotClient } from '../../core/client.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { humanDuration } from '../../lib/format.js';
import { getLogChannel } from '../../lib/logger.js';
import { isSchedulerRunning } from '../../lib/scheduler.js';
import { REQUIRED_BOT_PERMISSIONS, findMissingPermissions } from '../../lib/startup.js';
import { BACKUP_DIR, DB_FILE, db } from '../../storage/sqlite.js';

function tableCount(table: string): number {
  try {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as
      { count: number } | undefined;
    return Number(row?.count ?? 0);
  } catch {
    return -1;
  }
}

function latestBackup(): string | null {
  if (!BACKUP_DIR || !fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('bot-') && name.endsWith('.sqlite'))
    .sort();
  return files.at(-1) ?? null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('diagnose')
    .setDescription('Проверить права, БД, логи, бэкапы и состояние бота')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const me = interaction.guild.members.me;
    const missing = me
      ? findMissingPermissions((bit) => me.permissions.has(bit))
      : REQUIRED_BOT_PERMISSIONS;
    const permissionsOk = missing.length === 0;

    let auditOk = false;
    try {
      await interaction.guild.fetchAuditLogs({ limit: 1 });
      auditOk = true;
    } catch {
      // остаётся false
    }

    const logChannel = getLogChannel(interaction.guild);
    const logsOk = Boolean(logChannel && logChannel.isTextBased());

    let version = -1;
    try {
      const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
      version = Number(row?.user_version ?? -1);
    } catch {
      // остаётся -1
    }

    const backup = latestBackup();
    let dbSize = '—';
    try {
      const stats = fs.statSync(DB_FILE);
      dbSize = `${(stats.size / 1024 / 1024).toFixed(2)} МБ`;
    } catch {
      // остаётся прочерк
    }

    const fields = [
      {
        label: 'Права бота',
        value: permissionsOk
          ? '✅ все необходимые права есть'
          : `❌ не хватает: ${missing.map((item) => item.label).join(', ')}`,
        block: true,
      },
      {
        label: 'Audit Log',
        value: auditOk ? '✅ доступен' : '❌ нет доступа — анти-нак и причины не работают',
        block: true,
      },
      {
        label: 'Канал логов',
        value: logsOk ? `✅ <#${logChannel?.id}>` : '❌ не настроен или недоступен',
        block: true,
      },
      {
        label: 'SQLite',
        value: `версия схемы: **${version}**, размер: **${dbSize}**`,
        block: true,
      },
      {
        label: 'Данные',
        value:
          `серверы: ${tableCount('guilds')}, кейсы: ${tableCount('cases')}, ` +
          `варны: ${tableCount('warns')}, заметки: ${tableCount('notes')}, ` +
          `апелляции: ${tableCount('appeals')}`,
        block: true,
      },
      {
        label: 'Бэкапы',
        value: backup ? `✅ последний: \`${path.basename(backup)}\`` : '⚠️ бэкапов пока нет',
        block: true,
      },
      {
        label: 'Планировщик',
        value: isSchedulerRunning() ? '✅ работает' : '❌ не запущен',
        block: true,
      },
      {
        label: 'Бот',
        value:
          `команд: **${(interaction.client as BotClient).commands.size}**, ` +
          `пинг: **${Math.round(interaction.client.ws.ping)} мс**, ` +
          `аптайм: **${humanDuration(Math.floor(process.uptime() * 1_000))}**`,
        block: true,
      },
    ];

    const healthy = permissionsOk && auditOk && logsOk && version > 0;

    await interaction.editReply({
      components: [
        card({
          tone: healthy ? 'success' : 'warn',
          title: '🩺 Диагностика',
          description: healthy
            ? 'Критичных проблем не найдено.'
            : 'Есть проблемы — проверь пункты ниже.',
          fields,
          footer: `Кэш настроек: ${process.env.SETTINGS_CACHE_TTL_MS ?? '5000'} мс`,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
