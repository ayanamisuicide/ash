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
import { getCommunitySettings } from '../../lib/community.js';
import { humanDuration } from '../../lib/format.js';
import { listLocks } from '../../lib/locks.js';
import { fitFields, truncate } from '../../lib/logging.js';
import {
  LOG_CATEGORIES,
  LOG_EVENTS,
  getLogConfig,
  type LogCategory,
  type LogEventKey,
} from '../../lib/logSettings.js';
import { getModerationSettings, getSecuritySettings } from '../../lib/modSettings.js';

export interface PanelView {
  components: ContainerBuilder[];
}

type Row = ActionRowBuilder<MessageActionRowComponentBuilder>;

function row(...buttons: ButtonBuilder[]): Row {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(...buttons);
}

function button(customId: string, label: string, emoji: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(emoji).setStyle(style);
}

function navRow(backTo = 'menu:home'): Row {
  return row(
    button(backTo, 'Назад', '⬅️', ButtonStyle.Secondary),
    button('menu:close', 'Закрыть', '✖️', ButtonStyle.Danger),
  );
}

/** Публичная навигационная строка — нужна обработчику для карточек-результатов */
export function panelNavRow(backTo = 'menu:home'): Row {
  return navRow(backTo);
}

function onOff(enabled: boolean): string {
  return enabled ? 'вкл' : 'выкл';
}

export function buildMainView(guild: Guild): PanelView {
  const actionsRow = row(
    button('menu:moderation', 'Модерация', '🛡️', ButtonStyle.Primary),
    button('menu:roles', 'Роли', '🎭', ButtonStyle.Secondary),
    button('menu:channels', 'Каналы', '📢', ButtonStyle.Secondary),
    button('menu:voice', 'Голос', '🔊', ButtonStyle.Secondary),
    button('menu:cases', 'Кейсы', '📋', ButtonStyle.Secondary),
  );

  const navRowButtons = row(
    button('menu:settings', 'Настройки', '⚙️', ButtonStyle.Secondary),
    button('menu:logs', 'Логи', '📜', ButtonStyle.Secondary),
    button('menu:info', 'Информация', 'ℹ️', ButtonStyle.Secondary),
    button('menu:close', 'Закрыть', '✖️', ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🎛️ Панель управления',
        subtitle: guild.name,
        description:
          `Участников: **${guild.memberCount}**\n\n` +
          'Выбери раздел. Все действия — те же, что и у слэш-команд: общая история кейсов и проверки прав.\n' +
          '-# Полный список команд: `/help` или кнопка «Информация».',
        thumbnail: guild.iconURL(),
        rows: [actionsRow, navRowButtons],
        timestamp: false,
      }),
    ],
  };
}

export function buildModerationView(): PanelView {
  const actionsRow = row(
    button('menu:action:ban', 'Бан', '🔨', ButtonStyle.Danger),
    button('menu:action:tempban', 'Врем. бан', '⏳', ButtonStyle.Danger),
    button('menu:action:softban', 'Софтбан', '🧹', ButtonStyle.Danger),
    button('menu:action:massban', 'Массбан', '💥', ButtonStyle.Danger),
    button('menu:action:kick', 'Кик', '👢', ButtonStyle.Danger),
  );

  const secondRow = row(
    button('menu:action:unban', 'Разбан', '🔓', ButtonStyle.Success),
    button('menu:action:timeout', 'Таймаут', '🔇', ButtonStyle.Primary),
    button('menu:action:untimeout', 'Снять таймаут', '🔊', ButtonStyle.Secondary),
    button('menu:action:mute', 'Мут', '🤐', ButtonStyle.Primary),
    button('menu:action:unmute', 'Снять мут', '🔈', ButtonStyle.Secondary),
  );

  const warnsRow = row(
    button('menu:action:warn', 'Варн', '⚠️', ButtonStyle.Primary),
    button('menu:action:warns', 'Варны', '📋', ButtonStyle.Secondary),
    button('menu:action:clearwarns', 'Снять варны', '🧽', ButtonStyle.Secondary),
    button('menu:action:clear', 'Очистить чат', '🧹', ButtonStyle.Danger),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🛡️ Модерация',
        description: [
          'Нажми на кнопку — откроется окно, где нужно указать участника и причину.',
          '',
          '**Наказания:** бан, временный бан, софтбан, массбан, кик, разбан;',
          'таймаут и мут (с длительностью), снятие таймаута и мута.',
          '**Варны:** выдать, посмотреть, снять. **Очистка:** удаление сообщений.',
        ].join('\n'),
        rows: [actionsRow, secondRow, warnsRow, navRow()],
        timestamp: false,
      }),
    ],
  };
}

export function buildRolesView(): PanelView {
  const actionsRow = row(
    button('menu:action:role-add', 'Выдать роль', '➕', ButtonStyle.Success),
    button('menu:action:role-remove', 'Снять роль', '➖', ButtonStyle.Secondary),
    button('menu:action:role-temp', 'Временная роль', '⏱️', ButtonStyle.Primary),
    button('menu:action:setrole', 'Setrole', '🎭', ButtonStyle.Danger),
    button('menu:action:setnick', 'Ник', '✏️', ButtonStyle.Secondary),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🎭 Роли и ники',
        description: [
          '**Выдать / снять роль** — одна роль участнику.',
          '**Временная роль** — снимется сама по истечении срока.',
          '**Setrole** — заменить все управляемые роли одной (опасно, требует подтверждения).',
          '**Ник** — изменить или сбросить.',
        ].join('\n'),
        rows: [actionsRow, navRow()],
        timestamp: false,
      }),
    ],
  };
}

export function buildChannelsView(guild: Guild): PanelView {
  const locked = Object.keys(listLocks(guild.id)).length;

  const actionsRow = row(
    button('menu:action:lock', 'Заблокировать', '🔒', ButtonStyle.Danger),
    button('menu:action:unlock', 'Разблокировать', '🔓', ButtonStyle.Success),
    button('menu:action:slowmode', 'Slowmode', '🐌', ButtonStyle.Primary),
    button('menu:action:lockdown-on', 'Lockdown', '🚨', ButtonStyle.Danger),
    button('menu:action:lockdown-off', 'Снять lockdown', '✅', ButtonStyle.Secondary),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '📢 Каналы',
        description: [
          'Блокировка и slowmode применяются к **текущему каналу** (открой команду в нужном канале).',
          'Lockdown закрывает все текстовые каналы сервера.',
          'Перед блокировкой бот сохраняет старые права и возвращает их при разблокировке.',
        ].join('\n'),
        fields: [{ label: 'Каналов под блокировкой бота', value: String(locked), block: false }],
        rows: [actionsRow, navRow()],
        timestamp: false,
      }),
    ],
  };
}

export function buildVoiceView(): PanelView {
  const actionsRow = row(
    button('menu:action:voice-kick', 'Отключить', '🔌', ButtonStyle.Danger),
    button('menu:action:voice-move', 'Переместить', '↔️', ButtonStyle.Primary),
    button('menu:action:voice-mute', 'Заглушить', '🔇', ButtonStyle.Primary),
    button('menu:action:voice-unmute', 'Разглушить', '🔊', ButtonStyle.Secondary),
    button('menu:action:voice-deafen', 'Оглушить', '🎧', ButtonStyle.Primary),
  );

  const secondRow = row(
    button('menu:action:voice-undeafen', 'Разоглушить', '🔉', ButtonStyle.Secondary),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '🔊 Голосовая модерация',
        description: 'Действия применяются к участнику в голосовом канале.',
        rows: [actionsRow, secondRow, navRow()],
        timestamp: false,
      }),
    ],
  };
}

export function buildCasesView(guild: Guild): PanelView {
  const cases = listCases(guild.id, undefined, 10);

  const actionsRow = row(
    button('menu:action:case-find', 'Найти кейс', '🔍', ButtonStyle.Primary),
    button('menu:action:modlogs', 'История', '📜', ButtonStyle.Secondary),
    button('menu:action:case-reason', 'Изменить причину', '✏️', ButtonStyle.Secondary),
    button('menu:action:case-duration', 'Изменить срок', '⏳', ButtonStyle.Secondary),
  );

  const fields = fitFields(
    cases.map((modCase) => ({
      label: `#${modCase.id} · ${caseTypeLabel(modCase.type)} · <t:${Math.floor(modCase.createdAt / 1_000)}:d>`,
      value: `${truncate(modCase.reason, 300)}\n-# ${modCase.userId ? `<@${modCase.userId}>` : '—'} · модератор <@${modCase.moderatorId}>`,
      block: true,
    })),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '📋 Последние кейсы',
        description:
          cases.length > 0 ? `Показаны последние **${cases.length}** кейсов.` : 'Кейсов пока нет.',
        fields,
        rows: [actionsRow, navRow()],
        timestamp: false,
      }),
    ],
  };
}

export function buildSettingsView(guild: Guild): PanelView {
  const moderation = getModerationSettings(guild.id);
  const security = getSecuritySettings(guild.id);
  const community = getCommunitySettings(guild.id);
  const logs = getLogConfig(guild.id);

  const logRow = row(
    button('menu:logs', 'Логи', '📜', ButtonStyle.Primary),
    button('menu:action:immunity-add', 'Иммунитет +', '🛡️', ButtonStyle.Secondary),
    button('menu:action:welcome-channel', 'Приветствия', '👋', ButtonStyle.Secondary),
    button('menu:action:warn-rules', 'Правила варнов', '⚡', ButtonStyle.Secondary),
  );

  const toggleRow = row(
    button(
      'menu:action:automod-toggle',
      `Автомод: ${onOff(moderation.automod.enabled)}`,
      '🤖',
      moderation.automod.enabled ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
    button(
      'menu:action:raid-toggle',
      `Антирейд: ${onOff(security.raid.enabled)}`,
      '🚨',
      security.raid.enabled ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
    button(
      'menu:action:nuke-toggle',
      `Анти-нак: ${onOff(security.nuke.enabled)}`,
      '🧨',
      security.nuke.enabled ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
    button(
      'menu:action:leveling-toggle',
      `Уровни: ${onOff(community.levelingEnabled)}`,
      '📊',
      community.levelingEnabled ? ButtonStyle.Success : ButtonStyle.Secondary,
    ),
  );

  return {
    components: [
      card({
        tone: 'info',
        title: '⚙️ Настройки',
        description:
          'Быстрые переключатели. Полная настройка — слэш-команды ' +
          '(`/automod`, `/warnconfig`, `/immunity`, `/antiraid`, `/antinuke`, `/logs`, ' +
          '`/welcome`, `/leveling`, `/ticket` и другие) или веб-панель.',
        fields: [
          {
            label: 'Канал логов',
            value: logs.channelId ? `<#${logs.channelId}>` : '❌ не настроен',
            block: false,
          },
          {
            label: 'Приветствия',
            value: community.welcomeChannelId
              ? `<#${community.welcomeChannelId}>`
              : '❌ не настроены',
            block: false,
          },
          {
            label: 'Иммунитет',
            value: `ролей: ${moderation.immunityRoles.length}`,
            block: false,
          },
          {
            label: 'Автонаказания по варнам',
            value: `правил: ${moderation.warnActions.length}`,
            block: false,
          },
          {
            label: 'Антирейд',
            value: `${security.raid.joinThreshold} за ${security.raid.joinWindowSec} с · ${security.raid.action}`,
            block: false,
          },
          {
            label: 'Анти-нак',
            value: `${security.nuke.threshold} за ${security.nuke.windowSec} с · ${security.nuke.action}`,
            block: false,
          },
        ],
        rows: [logRow, toggleRow, navRow()],
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

  const buttonsRow = row(
    button('menu:logs:on', 'Всё включить', '✅', ButtonStyle.Success),
    button('menu:logs:off', 'Всё выключить', '❌', ButtonStyle.Danger),
    button('menu:logs:reset', 'Сбросить', '♻️', ButtonStyle.Secondary),
    button('menu:logs:channelOff', 'Без канала', '🔕', ButtonStyle.Secondary),
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
        rows: [channelRow, categoriesRow, buttonsRow, navRow('menu:settings')],
        footer: '«Новое сообщение» включается отдельно: /logs event event:messageCreate',
        timestamp: false,
      }),
    ],
  };
}

export function buildInfoView(guild: Guild, clientTag: string, ping: number): PanelView {
  const rowButtons = row(
    button('menu:info:ping', 'Пинг', '🏓', ButtonStyle.Primary),
    button('menu:info:help', 'Команды', '📖', ButtonStyle.Secondary),
    button('menu:home', 'Назад', '⬅️', ButtonStyle.Secondary),
    button('menu:close', 'Закрыть', '✖️', ButtonStyle.Danger),
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
        buttons: [rowButtons],
        timestamp: false,
      }),
    ],
  };
}
