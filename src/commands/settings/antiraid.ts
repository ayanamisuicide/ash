import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, successCard } from '../../lib/card.js';
import { COLORS } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';
import { logCard } from '../../lib/logCard.js';
import { sendLog } from '../../lib/logger.js';
import { getSecuritySettings, updateRaidConfig, type RaidAction } from '../../lib/modSettings.js';
import { clearRaidMode, getRaidRuntime, resetRaidRuntime, setRaidMode } from '../../lib/raid.js';

const ACTION_CHOICES = [
  { name: 'Только уведомление', value: 'alert' },
  { name: 'Кик', value: 'kick' },
  { name: 'Бан', value: 'ban' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('antiraid')
    .setDescription('Защита от массовых заходов (рейдов)')
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Включить или выключить антирейд')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('Порог заходов за окно времени')
        .addIntegerOption((option) =>
          option
            .setName('count')
            .setDescription('Сколько заходов')
            .setMinValue(1)
            .setMaxValue(1000)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('window')
            .setDescription('Окно в секундах')
            .setMinValue(5)
            .setMaxValue(3600)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('age')
        .setDescription('Минимальный возраст аккаунта (0 — выключить)')
        .addIntegerOption((option) =>
          option
            .setName('days')
            .setDescription('Дней')
            .setMinValue(0)
            .setMaxValue(365)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('action')
        .setDescription('Что делать с участником при рейде')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Действие')
            .addChoices(...ACTION_CHOICES)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('duration')
        .setDescription('Длительность режима антирейда')
        .addIntegerOption((option) =>
          option
            .setName('seconds')
            .setDescription('Секунды')
            .setMinValue(30)
            .setMaxValue(86400)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('bots')
        .setDescription('Учитывать заходы ботов')
        .addBooleanOption((option) =>
          option.setName('ignore').setDescription('Игнорировать ботов?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('panic')
        .setDescription('Включить или выключить режим антирейда вручную')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('seconds')
            .setDescription('На сколько секунд (по умолчанию из настроек)')
            .setMinValue(30)
            .setMaxValue(86400),
        ),
    )
    .addSubcommand((sub) => sub.setName('reset').setDescription('Сбросить счётчики антирейда'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'enable') {
      const enabled = interaction.options.getBoolean('enabled', true);
      updateRaidConfig(guildId, { enabled });
      await interaction.editReply({
        components: [
          successCard('🚨 Антирейд', enabled ? 'Антирейд включён.' : 'Антирейд выключен.'),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'threshold') {
      const joinThreshold = interaction.options.getInteger('count', true);
      const joinWindowSec = interaction.options.getInteger('window', true);
      updateRaidConfig(guildId, { joinThreshold, joinWindowSec });
      await interaction.editReply({
        components: [
          successCard(
            '🚨 Антирейд',
            `Порог: **${joinThreshold}** заходов за **${joinWindowSec} с**.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'age') {
      const accountAgeDays = interaction.options.getInteger('days', true);
      updateRaidConfig(guildId, { accountAgeDays });
      await interaction.editReply({
        components: [
          successCard(
            '🚨 Антирейд',
            accountAgeDays === 0
              ? 'Проверка возраста аккаунта выключена.'
              : `Минимальный возраст аккаунта: **${accountAgeDays} дн.**`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'action') {
      const action = interaction.options.getString('action', true) as RaidAction;
      updateRaidConfig(guildId, { action });
      await interaction.editReply({
        components: [successCard('🚨 Антирейд', `Действие: **${raidActionLabel(action)}**.`)],
        flags: V2,
      });
      return;
    }

    if (sub === 'duration') {
      const durationSec = interaction.options.getInteger('seconds', true);
      updateRaidConfig(guildId, { durationSec });
      await interaction.editReply({
        components: [
          successCard(
            '🚨 Антирейд',
            `Длительность режима: **${humanDuration(durationSec * 1_000)}**.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'bots') {
      const ignoreBots = interaction.options.getBoolean('ignore', true);
      updateRaidConfig(guildId, { ignoreBots });
      await interaction.editReply({
        components: [
          successCard(
            '🚨 Антирейд',
            ignoreBots ? 'Заходы ботов игнорируются.' : 'Заходы ботов учитываются.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'panic') {
      const enabled = interaction.options.getBoolean('enabled', true);
      const seconds =
        interaction.options.getInteger('seconds') ?? getSecuritySettings(guildId).raid.durationSec;

      if (enabled) {
        setRaidMode(guildId, seconds * 1_000);
      } else {
        clearRaidMode(guildId);
      }

      await sendLog(
        interaction.guild,
        logCard(interaction.guild, {
          title: enabled
            ? '🚨 Антирейд: ручной режим включён'
            : '✅ Антирейд: ручной режим выключен',
          color: enabled ? COLORS.danger : COLORS.success,
          fields: [
            { name: 'Кем', value: `${interaction.user}`, inline: true },
            {
              name: 'Длительность',
              value: enabled ? humanDuration(seconds * 1_000) : '—',
              inline: true,
            },
          ],
        }),
        'raidAlert',
      );

      await interaction.editReply({
        components: [
          successCard(
            '🚨 Антирейд',
            enabled
              ? `Ручной режим включён на **${humanDuration(seconds * 1_000)}**.`
              : 'Ручной режим выключен.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'reset') {
      resetRaidRuntime(guildId);
      await interaction.editReply({
        components: [successCard('🚨 Антирейд', 'Счётчики и режим сброшены.')],
        flags: V2,
      });
      return;
    }

    const config = getSecuritySettings(guildId).raid;
    const runtime = getRaidRuntime(guildId);

    await interaction.editReply({
      components: [
        card({
          tone: config.enabled ? 'success' : 'neutral',
          title: '🚨 Антирейд',
          description: config.enabled ? 'Включён' : 'Выключен',
          fields: [
            {
              label: 'Порог',
              value: `${config.joinThreshold} за ${config.joinWindowSec} с`,
              block: false,
            },
            {
              label: 'Возраст аккаунта',
              value:
                config.accountAgeDays === 0 ? 'не проверяется' : `${config.accountAgeDays} дн.`,
              block: false,
            },
            { label: 'Действие', value: raidActionLabel(config.action), block: false },
            {
              label: 'Длительность',
              value: humanDuration(config.durationSec * 1_000),
              block: false,
            },
            {
              label: 'Боты',
              value: config.ignoreBots ? 'игнорируются' : 'учитываются',
              block: false,
            },
            { label: 'Заходов в окне', value: String(runtime.joins), block: false },
            {
              label: 'Ручной режим',
              value: runtime.active
                ? `до <t:${Math.floor((runtime.raidUntil ?? Date.now()) / 1_000)}:f>`
                : 'выключен',
              block: false,
            },
          ],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;

function raidActionLabel(action: RaidAction): string {
  if (action === 'kick') return 'кик';
  if (action === 'ban') return 'бан';
  return 'только уведомление';
}
