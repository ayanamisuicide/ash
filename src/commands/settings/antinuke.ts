import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, successCard } from '../../lib/card.js';
import {
  getSecuritySettings,
  updateNukeConfig,
  type NukeAction,
} from '../../lib/modSettings.js';
import { getNukeCounters, resetNukeRuntime } from '../../lib/nuke.js';

const ACTION_CHOICES = [
  { name: 'Только уведомление', value: 'alert' },
  { name: 'Таймаут 1 час', value: 'timeout' },
  { name: 'Кик', value: 'kick' },
  { name: 'Бан', value: 'ban' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('antinuke')
    .setDescription('Защита от массовых разрушительных действий')
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Включить или выключить анти-нак')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('threshold')
        .setDescription('Порог действий за окно времени')
        .addIntegerOption((option) =>
          option
            .setName('count')
            .setDescription('Сколько действий')
            .setMinValue(1)
            .setMaxValue(100)
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
        .setName('action')
        .setDescription('Что делать с нарушителем')
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
        .setName('ignoreadmins')
        .setDescription('Не наказывать администраторов автоматически')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Игнорировать?').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('reset').setDescription('Сбросить счётчики анти-нака'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);
    const guildId = interaction.guild.id;

    if (sub === 'enable') {
      const enabled = interaction.options.getBoolean('enabled', true);
      updateNukeConfig(guildId, { enabled });
      await interaction.editReply({
        components: [
          successCard(
            '🧨 Анти-нак',
            enabled ? 'Анти-нак включён.' : 'Анти-нак выключен.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'threshold') {
      const threshold = interaction.options.getInteger('count', true);
      const windowSec = interaction.options.getInteger('window', true);
      updateNukeConfig(guildId, { threshold, windowSec });
      await interaction.editReply({
        components: [
          successCard(
            '🧨 Анти-нак',
            `Порог: **${threshold}** действий за **${windowSec} с**.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'action') {
      const action = interaction.options.getString('action', true) as NukeAction;
      updateNukeConfig(guildId, { action });
      await interaction.editReply({
        components: [
          successCard('🧨 Анти-нак', `Действие: **${nukeActionLabel(action)}**.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'ignoreadmins') {
      const ignoreAdmins = interaction.options.getBoolean('enabled', true);
      updateNukeConfig(guildId, { ignoreAdmins });
      await interaction.editReply({
        components: [
          successCard(
            '🧨 Анти-нак',
            ignoreAdmins
              ? 'Администраторы не наказываются автоматически.'
              : 'Администраторы тоже могут быть наказаны.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'reset') {
      resetNukeRuntime(guildId);
      await interaction.editReply({
        components: [successCard('🧨 Анти-нак', 'Счётчики сброшены.')],
        flags: V2,
      });
      return;
    }

    const config = getSecuritySettings(guildId).nuke;
    const counters = getNukeCounters(guildId);
    const fields = counters.slice(0, 10).map((counter) => ({
      label: `<@${counter.executorId}>`,
      value: `**${counter.count}** действий: ${counter.actions.join(', ')}`,
      block: true,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: config.enabled ? 'success' : 'neutral',
          title: '🧨 Анти-нак',
          description: config.enabled ? 'Включён' : 'Выключен',
          fields: [
            {
              label: 'Порог',
              value: `${config.threshold} за ${config.windowSec} с`,
              block: false,
            },
            {
              label: 'Действие',
              value: nukeActionLabel(config.action),
              block: false,
            },
            {
              label: 'Администраторы',
              value: config.ignoreAdmins
                ? 'не наказываются автоматически'
                : 'могут быть наказаны',
              block: false,
            },
            ...(fields.length > 0
              ? fields
              : [{ label: 'Активность', value: 'подозрительных действий нет', block: false }]),
          ],
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;

function nukeActionLabel(action: NukeAction): string {
  if (action === 'timeout') return 'таймаут 1 час';
  if (action === 'kick') return 'кик';
  if (action === 'ban') return 'бан';
  return 'только уведомление';
}
