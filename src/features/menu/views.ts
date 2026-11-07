import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ContainerBuilder,
  type Guild,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import { COLORS } from '../../lib/embeds.js';
import { card } from '../../lib/card.js';
import { caseTypeLabel, listCases } from '../../lib/cases.js';
import { humanDuration } from '../../lib/format.js';
import { truncate } from '../../lib/logging.js';
import {
  LOG_CATEGORIES,
  LOG_EVENTS,
  getLogConfig,
  type LogCategory,
  type LogEventKey,
} from '../../lib/logSettings.js';

export interface PanelView {
  components: ContainerBuilder[];
}

export function buildMainView(guild: Guild): PanelView {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:moderation')
      .setLabel('Модерация')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('menu:logs')
      .setLabel('Логи')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:info')
      .setLabel('Информация')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:cases')
      .setLabel('Кейсы')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:close')
      .setLabel('Закрыть')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🎛️ Панель управления',
        subtitle: guild.name,
        description: `Участников: **${guild.memberCount}**\n\nВыбери раздел кнопками ниже.`,
        thumbnail: guild.iconURL(),
        buttons: [row],
        timestamp: false,
      }),
    ],
  };
}

export function buildModerationView(): PanelView {
  const actionsRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:action:ban')
      .setLabel('Бан')
      .setEmoji('🔨')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('menu:action:kick')
      .setLabel('Кик')
      .setEmoji('👢')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('menu:action:timeout')
      .setLabel('Таймаут')
      .setEmoji('🔇')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('menu:action:untimeout')
      .setLabel('Снять таймаут')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:action:unban')
      .setLabel('Разбан')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success),
  );

  const warnsRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:action:warn')
      .setLabel('Варн')
      .setEmoji('⚠️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('menu:action:warns')
      .setLabel('Варны')
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:action:clearwarns')
      .setLabel('Снять варны')
      .setEmoji('🧽')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:action:clear')
      .setLabel('Очистить чат')
      .setEmoji('🧹')
      .setStyle(ButtonStyle.Danger),
  );

  const navRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:home')
      .setLabel('Назад')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:close')
      .setLabel('Закрыть')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🛡️ Модерация',
        description: [
          'Нажми на кнопку — откроется окно, где нужно указать участника и причину.',
          '',
          '**Доступно:** бан, кик, разбан, таймаут, снятие таймаута,',
          'варны, снятие варнов и очистка сообщений.',
        ].join('\n'),
        rows: [actionsRow, warnsRow, navRow],
        timestamp: false,
      }),
    ],
  };
}

export function buildLogsView(guild: Guild): PanelView {
  const config = getLogConfig(guild.id);
  const channel = config.channelId ? guild.channels.cache.get(config.channelId) : null;

  const fields = (Object.entries(LOG_CATEGORIES) as Array<[LogCategory, string]>).map(
    ([category, label]) => {
      const events = (
        Object.entries(LOG_EVENTS) as Array<[LogEventKey, { category: LogCategory; label: string }]>
      ).filter(([, meta]) => meta.category === category);

      const disabled = events.filter(([key]) => !config.events[key]);
      const enabled = config.categories[category];

      const value = enabled
        ? disabled.length > 0
          ? `✅ включено · выкл: ${disabled.length} из ${events.length}`
          : '✅ включено'
        : '❌ выключено';

      return { label, value };
    },
  );

  const channelRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('menu:logs:channel')
      .setPlaceholder('Выбрать канал логов')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1),
  );

  const channelOffRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:logs:channelOff')
      .setLabel('Выключить логи (убрать канал)')
      .setEmoji('🔕')
      .setStyle(ButtonStyle.Danger),
  );

  const categoriesRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('menu:logs:categories')
      .setPlaceholder('Категории логов')
      .setMinValues(0)
      .setMaxValues(Object.keys(LOG_CATEGORIES).length)
      .addOptions(
        (Object.entries(LOG_CATEGORIES) as Array<[LogCategory, string]>).map(([value, label]) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(label)
            .setValue(value)
            .setDefault(config.categories[value])
            .setEmoji(config.categories[value] ? '✅' : '❌'),
        ),
      ),
  );

  const buttonsRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:logs:on')
      .setLabel('Всё включить')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('menu:logs:off')
      .setLabel('Всё выключить')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('menu:logs:reset')
      .setLabel('Сбросить')
      .setEmoji('♻️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:home')
      .setLabel('Назад')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:close')
      .setLabel('Закрыть')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        color: COLORS.primary,
        title: '📜 Настройки логов',
        description: config.channelId
          ? channel
            ? `Канал: <#${config.channelId}>\nВыбери категории ниже или измени канал.`
            : '⚠️ Настроенный канал удалён или недоступен — выбери новый.'
          : '❌ **Канал не выбран — логи не отправляются.**\nВыбери канал ниже.',
        fields,
        rows: [channelRow, channelOffRow, categoriesRow, buttonsRow],
        footer: '«Новое сообщение» включается отдельно: /logs event event:messageCreate',
        timestamp: false,
      }),
    ],
  };
}

export function buildCasesView(guild: Guild): PanelView {
  const cases = listCases(guild.id, undefined, 10);

  const navRow = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:home')
      .setLabel('Назад')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:close')
      .setLabel('Закрыть')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  const fields = cases.map((modCase) => ({
    label: `#${modCase.id} · ${caseTypeLabel(modCase.type)} · <t:${Math.floor(modCase.createdAt / 1_000)}:d>`,
    value: `${truncate(modCase.reason, 300)}\n-# ${modCase.userId ? `<@${modCase.userId}>` : '—'} · модератор <@${modCase.moderatorId}>`,
    block: true,
  }));

  return {
    components: [
      card({
        tone: 'info',
        title: '📋 Последние кейсы',
        description:
          cases.length > 0 ? `Показаны последние **${cases.length}** кейсов.` : 'Кейсов пока нет.',
        fields,
        buttons: [navRow],
        timestamp: false,
      }),
    ],
  };
}

export function buildInfoView(guild: Guild, clientTag: string, ping: number): PanelView {
  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('menu:info:ping')
      .setLabel('Пинг')
      .setEmoji('🏓')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('menu:info:help')
      .setLabel('Команды')
      .setEmoji('📖')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:home')
      .setLabel('Назад')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('menu:close')
      .setLabel('Закрыть')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: 'ℹ️ Информация',
        thumbnail: guild.iconURL(),
        fields: [
          { label: 'Сервер', value: guild.name },
          { label: 'Участников', value: String(guild.memberCount) },
          { label: 'Создан', value: `<t:${Math.floor(guild.createdTimestamp / 1_000)}:d>` },
          { label: 'Бот', value: clientTag },
          { label: 'Задержка API', value: `${Math.round(ping)} мс` },
          {
            label: 'Аптайм',
            value: humanDuration(Math.floor(process.uptime() * 1_000)),
          },
        ],
        buttons: [row],
        timestamp: false,
      }),
    ],
  };
}
