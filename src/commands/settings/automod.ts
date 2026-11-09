import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { V2, card, errorCard, successCard } from '../../lib/card.js';
import { humanDuration, parseDuration } from '../../lib/format.js';
import {
  addAutomodWord,
  getModerationSettings,
  removeAutomodWord,
  updateAutomod,
  type AutomodAction,
  type AutomodConfig,
} from '../../lib/modSettings.js';

const FILTER_CHOICES = [
  { name: 'Приглашения', value: 'invites' },
  { name: 'Ссылки', value: 'links' },
  { name: 'Капс', value: 'caps' },
  { name: 'Спам', value: 'spam' },
];

export default {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Настройка автомодерации')
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать настройки'))
    .addSubcommand((sub) =>
      sub
        .setName('enable')
        .setDescription('Включить или выключить автомодерацию')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('filter')
        .setDescription('Включить или выключить фильтр')
        .addStringOption((option) =>
          option
            .setName('filter')
            .setDescription('Фильтр')
            .addChoices(...FILTER_CHOICES)
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Включить?').setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('words')
        .setDescription('Запрещённые слова')
        .addStringOption((option) =>
          option
            .setName('action')
            .setDescription('Действие')
            .addChoices(
              { name: 'Добавить', value: 'add' },
              { name: 'Удалить', value: 'remove' },
              { name: 'Список', value: 'list' },
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName('word').setDescription('Слово').setMaxLength(100),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('mentions')
        .setDescription('Максимум упоминаний в сообщении (0 — выключить)')
        .addIntegerOption((option) =>
          option
            .setName('max')
            .setDescription('Максимум упоминаний')
            .setMinValue(0)
            .setMaxValue(100)
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
            .setRequired(true)
            .addChoices(
              { name: 'Только удалить сообщение', value: 'delete' },
              { name: 'Выдать варн', value: 'warn' },
              { name: 'Таймаут', value: 'timeout' },
              { name: 'Мут', value: 'mute' },
              { name: 'Кик', value: 'kick' },
              { name: 'Бан', value: 'ban' },
            ),
        )
        .addStringOption((option) =>
          option.setName('duration').setDescription('Длительность для таймаута/мута: 10m, 1h, 7d'),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'enable') {
      const enabled = interaction.options.getBoolean('enabled', true);
      updateAutomod(interaction.guild.id, { enabled });
      await interaction.editReply({
        components: [
          successCard(
            '🛡️ Автомодерация',
            enabled ? 'Автомодерация включена.' : 'Автомодерация выключена.',
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'filter') {
      const filter = interaction.options.getString('filter', true);
      const enabled = interaction.options.getBoolean('enabled', true);
      const patch: Partial<AutomodConfig> = {};
      if (filter === 'invites') patch.invites = enabled;
      if (filter === 'links') patch.links = enabled;
      if (filter === 'caps') patch.caps = enabled;
      if (filter === 'spam') patch.spam = enabled;
      updateAutomod(interaction.guild.id, patch);
      await interaction.editReply({
        components: [
          successCard(
            '🛡️ Автомодерация',
            `Фильтр **${filter}**: ${enabled ? 'включён' : 'выключен'}.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'words') {
      const action = interaction.options.getString('action', true);
      const word = interaction.options.getString('word');

      if (action === 'list') {
        const words = getModerationSettings(interaction.guild.id).automod.words;
        await interaction.editReply({
          components: [
            card({
              tone: 'info',
              title: '🚫 Запрещённые слова',
              description:
                words.length > 0
                  ? words
                      .slice(0, 50)
                      .map((item) => `\`${item}\``)
                      .join(', ')
                  : 'Список пуст.',
              footer: `Слов: ${words.length}`,
              timestamp: false,
            }),
          ],
          flags: V2,
        });
        return;
      }

      if (!word) {
        await interaction.editReply({
          components: [errorCard('Укажите слово.')],
          flags: V2,
        });
        return;
      }

      const changed =
        action === 'add'
          ? addAutomodWord(interaction.guild.id, word)
          : removeAutomodWord(interaction.guild.id, word);

      await interaction.editReply({
        components: [
          changed
            ? successCard(
                '🚫 Запрещённые слова',
                action === 'add' ? `Слово \`${word}\` добавлено.` : `Слово \`${word}\` удалено.`,
              )
            : errorCard(
                action === 'add'
                  ? `Слово \`${word}\` уже есть в списке.`
                  : `Слово \`${word}\` не найдено.`,
              ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'mentions') {
      const max = interaction.options.getInteger('max', true);
      updateAutomod(interaction.guild.id, { mentions: max });
      await interaction.editReply({
        components: [
          successCard(
            '🛡️ Автомодерация',
            max === 0 ? 'Проверка упоминаний выключена.' : `Максимум упоминаний: **${max}**.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    if (sub === 'action') {
      const action = interaction.options.getString('action', true) as AutomodAction;
      const rawDuration = interaction.options.getString('duration');
      let durationMs: number | null = null;

      if (rawDuration) {
        durationMs = parseDuration(rawDuration);
        if (!durationMs) {
          await interaction.editReply({
            components: [errorCard('Неверный формат длительности. Пример: `10m`, `1h`, `7d`.')],
            flags: V2,
          });
          return;
        }
        if (action === 'timeout' && durationMs > 28 * 86_400_000) {
          await interaction.editReply({
            components: [errorCard('Максимальный таймаут — 28 дней.')],
            flags: V2,
          });
          return;
        }
        if (durationMs > 365 * 86_400_000) {
          await interaction.editReply({
            components: [errorCard('Максимальная длительность — 365 дней.')],
            flags: V2,
          });
          return;
        }
      }

      updateAutomod(interaction.guild.id, { action, durationMs });
      await interaction.editReply({
        components: [
          successCard(
            '🛡️ Автомодерация',
            `Действие при нарушении: **${action}**${durationMs ? `, длительность: **${rawDuration}**` : ''}.`,
          ),
        ],
        flags: V2,
      });
      return;
    }

    const config = getModerationSettings(interaction.guild.id).automod;
    const actionLabels: Record<AutomodAction, string> = {
      delete: 'удалить сообщение',
      warn: 'варн',
      timeout: 'таймаут',
      mute: 'мут',
      kick: 'кик',
      ban: 'бан',
    };
    await interaction.editReply({
      components: [
        card({
          tone: config.enabled ? 'success' : 'neutral',
          title: '🛡️ Автомодерация',
          description: config.enabled ? 'Включена' : 'Выключена',
          fields: [
            { label: 'Приглашения', value: config.invites ? '✅' : '❌', block: false },
            { label: 'Ссылки', value: config.links ? '✅' : '❌', block: false },
            { label: 'Капс', value: config.caps ? '✅' : '❌', block: false },
            { label: 'Спам', value: config.spam ? '✅' : '❌', block: false },
            {
              label: 'Упоминания',
              value: config.mentions === 0 ? 'выкл' : `макс. ${config.mentions}`,
              block: false,
            },
            { label: 'Запрещённые слова', value: String(config.words.length), block: false },
            {
              label: 'Действие',
              value: actionLabels[config.action],
              block: false,
            },
            {
              label: 'Длительность',
              value: config.durationMs ? humanDuration(config.durationMs) : 'по умолчанию',
              block: false,
            },
            {
              label: 'Удалять сообщения',
              value: config.deleteMessage ? '✅' : '❌',
              block: false,
            },
            {
              label: 'CAPS',
              value: `${config.capsPercent}% от ${config.capsMinLength} символов`,
              block: false,
            },
            {
              label: 'Спам',
              value: `${config.spamCount} сообщений / ${config.spamWindowSec} с, повторов: ${config.spamDuplicateCount}`,
              block: false,
            },
            {
              label: 'Исключения',
              value: `каналов: ${config.ignoredChannels.length}, ролей: ${config.ignoredRoles.length}`,
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
