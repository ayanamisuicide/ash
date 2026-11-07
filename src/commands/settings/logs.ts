import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from '../../core/types.js';
import {
  V2,
  card,
  errorCard,
  successCard,
} from '../../lib/card.js';
import {
  LOG_CATEGORIES,
  LOG_EVENTS,
  getLogConfig,
  resetLogFilters,
  setAllLogs,
  setLogCategory,
  setLogChannel,
  setLogEvent,
  type LogCategory,
  type LogEventKey,
} from '../../lib/logSettings.js';

const CATEGORY_CHOICES = (Object.entries(LOG_CATEGORIES) as Array<[LogCategory, string]>).map(
  ([value, name]) => ({ name, value }),
);

export default {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Настройка логов сервера')
    .addSubcommand((sub) =>
      sub
        .setName('channel')
        .setDescription('Выбрать канал для логов (без канала — отключить)')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Канал логов')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('event')
        .setDescription('Включить или выключить отдельное событие')
        .addStringOption((option) =>
          option
            .setName('event')
            .setDescription('Событие (начните вводить название)')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Без выбора — переключить'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('category')
        .setDescription('Включить или выключить целую категорию')
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Категория')
            .setRequired(true)
            .addChoices(...CATEGORY_CHOICES),
        )
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Без выбора — переключить'),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('all')
        .setDescription('Включить или выключить все логи')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('true — всё вкл, false — всё выкл').setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('Показать текущие настройки'))
    .addSubcommand((sub) => sub.setName('reset').setDescription('Сбросить фильтры к значениям по умолчанию'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');

      if (channel) {
        const me = interaction.guild.members.me;
        const permissions =
          'permissionsFor' in channel && me ? channel.permissionsFor(me) : null;
        if (
          !permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
          ])
        ) {
          return interaction.editReply({
            components: [
              errorCard(
                'У бота нет прав писать в этот канал. Нужны: «Просмотр канала», «Отправка сообщений», «Встраивание ссылок».',
              ),
            ],
            flags: V2,
          });
        }
      }

      setLogChannel(guildId, channel?.id ?? null);

      return interaction.editReply({
        components: [
          channel
            ? successCard('📜 Логи включены', `Канал: <#${channel.id}>`)
            : successCard('📜 Логи выключены', 'Канал логов больше не выбран.'),
        ],
        flags: V2,
      });
    }

    if (sub === 'event') {
      const key = interaction.options.getString('event', true) as LogEventKey;
      if (!(key in LOG_EVENTS)) {
        return interaction.editReply({
          components: [errorCard('Неизвестное событие.')],
          flags: V2,
        });
      }

      const current = getLogConfig(guildId).events[key];
      const enabled = interaction.options.getBoolean('enabled') ?? !current;
      setLogEvent(guildId, key, enabled);

      return interaction.editReply({
        components: [
          successCard(
            enabled ? '✅ Событие включено' : '❌ Событие выключено',
            `**${LOG_EVENTS[key].label}** (\`${key}\`)`,
          ),
        ],
        flags: V2,
      });
    }

    if (sub === 'category') {
      const category = interaction.options.getString('category', true) as LogCategory;
      const current = getLogConfig(guildId).categories[category];
      const enabled = interaction.options.getBoolean('enabled') ?? !current;
      setLogCategory(guildId, category, enabled);

      return interaction.editReply({
        components: [
          successCard(
            enabled ? '✅ Категория включена' : '❌ Категория выключена',
            `**${LOG_CATEGORIES[category]}**`,
          ),
        ],
        flags: V2,
      });
    }

    if (sub === 'all') {
      const enabled = interaction.options.getBoolean('enabled', true);
      setAllLogs(guildId, enabled);
      // Не включаем логирование каждого сообщения пачкой — это легко превращается в спам
      if (enabled) setLogEvent(guildId, 'messageCreate', false);

      return interaction.editReply({
        components: [
          successCard(
            enabled ? '✅ Все логи включены' : '❌ Все логи выключены',
            enabled
              ? 'Кроме «каждого сообщения» — оно включается отдельно.'
              : 'Логи больше не будут отправляться.',
          ),
        ],
        flags: V2,
      });
    }

    if (sub === 'reset') {
      resetLogFilters(guildId);
      return interaction.editReply({
        components: [
          successCard('♻️ Фильтры сброшены', 'Вернулись значения по умолчанию.'),
        ],
        flags: V2,
      });
    }

    // status
    const config = getLogConfig(guildId);
    const fields: Array<{ label: string; value: string; block?: boolean }> = [];

    for (const [category, label] of Object.entries(LOG_CATEGORIES) as Array<[LogCategory, string]>) {
      const events = (Object.entries(LOG_EVENTS) as Array<
        [LogEventKey, { category: LogCategory; label: string }]
      >).filter(([, meta]) => meta.category === category);

      const disabled = events.filter(([key]) => !config.events[key]).map(([, meta]) => meta.label);
      const categoryOn = config.categories[category];

      let value = categoryOn ? '✅ включено' : '❌ выключено';
      if (categoryOn && disabled.length > 0) {
        value += ` · выкл: ${disabled.join(', ')}`;
      }

      fields.push({ label, value, block: true });
    }

    return interaction.editReply({
      components: [
        card({
          tone: 'info',
          title: '📜 Настройки логов',
          description: config.channelId
            ? `Канал: <#${config.channelId}>`
            : '❌ Канал не выбран. Используйте `/logs channel`.',
          fields,
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  },

  async autocomplete(interaction) {
    const query = interaction.options.getFocused().toLowerCase();

    const matches = (Object.entries(LOG_EVENTS) as Array<
      [LogEventKey, { category: LogCategory; label: string }]
    >)
      .filter(([key, meta]) => {
        const haystack = `${key} ${meta.label} ${LOG_CATEGORIES[meta.category]}`.toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 25)
      .map(([key, meta]) => ({
        name: `${meta.label} — ${LOG_CATEGORIES[meta.category]}`,
        value: key,
      }));

    await interaction.respond(matches);
  },
} satisfies Command;
