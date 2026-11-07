import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { humanDuration, parseDuration } from '../../lib/format.js';
import { warnActionLabel } from '../../lib/moderation.js';
import {
  addWarnAction,
  clearWarnActions,
  getModerationSettings,
  removeWarnAction,
  type WarnActionType,
} from '../../lib/modSettings.js';

const ACTION_CHOICES = [
  { name: 'Таймаут', value: 'timeout' },
  { name: 'Мут', value: 'mute' },
  { name: 'Кик', value: 'kick' },
  { name: 'Бан', value: 'ban' },
  { name: 'Временный бан', value: 'tempban' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('warnconfig')
    .setDescription('Автонаказания по количеству предупреждений')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Добавить правило')
        .addIntegerOption((option) =>
          option
            .setName('count')
            .setDescription('Сколько варнов')
            .setMinValue(1)
            .setMaxValue(100)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName('window')
            .setDescription('За сколько дней')
            .setMinValue(1)
            .setMaxValue(365)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Что сделать')
            .addChoices(...ACTION_CHOICES)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('duration')
            .setDescription('Длительность для таймаута/мута/временного бана'),
        ),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Показать правила'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Удалить правило')
        .addStringOption((option) =>
          option.setName('id').setDescription('ID правила').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('clear').setDescription('Удалить все правила'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'add') {
      const count = interaction.options.getInteger('count', true);
      const windowDays = interaction.options.getInteger('window', true);
      const action = interaction.options.getString('action', true) as WarnActionType;
      const durationInput = interaction.options.getString('duration');
      const needsDuration =
        action === 'timeout' || action === 'mute' || action === 'tempban';
      const durationMs = durationInput ? parseDuration(durationInput) : null;

      if (needsDuration && !durationMs) {
        await interaction.editReply({
          components: [
            errorCard(
              'Для таймаута, мута и временного бана укажите длительность: `10m`, `1h`, `2d`.',
            ),
          ],
          flags: V2,
        });
        return;
      }
      if (action === 'timeout' && durationMs && durationMs > 28 * 86_400_000) {
        await interaction.editReply({
          components: [errorCard('Максимальный таймаут — 28 дней.')],
          flags: V2,
        });
        return;
      }
      if (action === 'mute' && durationMs && durationMs > 365 * 86_400_000) {
        await interaction.editReply({
          components: [errorCard('Максимальный мут — 365 дней.')],
          flags: V2,
        });
        return;
      }

      const rule = addWarnAction(interaction.guild.id, {
        count,
        windowDays,
        action,
        durationMs: needsDuration ? durationMs : null,
      });

      await interaction.editReply({
        components: [
          successCard(
            '⚡ Правило добавлено',
            `\`${rule.id}\` · **${count}** варнов за **${windowDays}** дн. → **${warnActionLabel(rule)}**` +
              (durationMs ? ` на ${humanDuration(durationMs)}` : ''),
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id', true);
      const removed = removeWarnAction(interaction.guild.id, id);
      await interaction.editReply({
        components: [
          removed
            ? successCard('⚡ Правило удалено', `\`${id}\``)
            : errorCard(`Правило \`${id}\` не найдено.`),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'clear') {
      clearWarnActions(interaction.guild.id);
      await interaction.editReply({
        components: [successCard('⚡ Правила', 'Все автонаказания удалены.')],
        flags: V2,
      });
      return;
    }

    const rules = getModerationSettings(interaction.guild.id).warnActions;
    const fields = rules.map((rule) => ({
      label: `\`${rule.id}\` · ${rule.count} варнов за ${rule.windowDays} дн.`,
      value: `${warnActionLabel(rule)}${rule.durationMs ? ` · ${humanDuration(rule.durationMs)}` : ''}`,
      block: true,
    }));

    await interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '⚡ Автонаказания по варнам',
          description:
            rules.length > 0 ? 'Срабатывает первое подходящее правило.' : 'Правил нет.',
          fields,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },
} satisfies Command;
