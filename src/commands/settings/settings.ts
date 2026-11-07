import fs from 'node:fs';
import path from 'node:path';
import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card } from '../../lib/card.js';
import { getLogConfig } from '../../lib/logSettings.js';
import { getModerationSettings, getSecuritySettings } from '../../lib/modSettings.js';
import { BACKUP_DIR } from '../../storage/sqlite.js';

function latestBackupName(): string | null {
  if (!BACKUP_DIR || !fs.existsSync(BACKUP_DIR)) return null;
  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith('bot-') && name.endsWith('.sqlite'))
    .sort();
  return files.at(-1) ?? null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Обзор всех настроек сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const logs = getLogConfig(interaction.guild.id);
    const moderation = getModerationSettings(interaction.guild.id);
    const security = getSecuritySettings(interaction.guild.id);
    const backup = latestBackupName();

    const channel = logs.channelId ? interaction.guild.channels.cache.get(logs.channelId) : null;

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '⚙️ Настройки сервера',
          description: 'Краткий обзор. Изменение — через профильные команды.',
          fields: [
            {
              label: 'Логи',
              value: channel ? `<#${channel.id}>` : '❌ канал не настроен',
              block: false,
            },
            {
              label: 'Автомодерация',
              value: moderation.automod.enabled ? '✅ включена' : '❌ выключена',
              block: false,
            },
            {
              label: 'Автонаказания',
              value: `правил: ${moderation.warnActions.length}`,
              block: false,
            },
            {
              label: 'Иммунитет',
              value: `ролей: ${moderation.immunityRoles.length}`,
              block: false,
            },
            {
              label: 'Жалобы',
              value: moderation.reportChannelId
                ? `<#${moderation.reportChannelId}>`
                : 'не настроены',
              block: false,
            },
            {
              label: 'Апелляции',
              value: moderation.appealChannelId
                ? `<#${moderation.appealChannelId}>`
                : 'не настроены',
              block: false,
            },
            {
              label: 'Антирейд',
              value: security.raid.enabled
                ? `✅ ${security.raid.joinThreshold} за ${security.raid.joinWindowSec} с`
                : '❌ выключен',
              block: false,
            },
            {
              label: 'Анти-нак',
              value: security.nuke.enabled
                ? `✅ ${security.nuke.threshold} за ${security.nuke.windowSec} с`
                : '❌ выключен',
              block: false,
            },
            {
              label: 'Последний бэкап',
              value: backup ? path.basename(backup) : 'нет',
              block: false,
            },
          ],
          footer: '/logs · /automod · /warnconfig · /immunity · /antiraid · /antinuke · /backup',
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
