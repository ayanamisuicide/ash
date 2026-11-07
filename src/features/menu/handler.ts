import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { BotClient } from '../../core/client.js';
import { V2, card, errorCard, successCard, v2Flags } from '../../lib/card.js';
import {
  LOG_CATEGORIES,
  resetLogFilters,
  setAllLogs,
  setLogCategory,
  setLogChannel,
  setLogEvent,
  type LogCategory,
} from '../../lib/logSettings.js';
import { getWarns } from '../../lib/warns.js';
import { truncate } from '../../lib/logging.js';
import {
  banUser,
  clearMessages,
  clearWarnsAction,
  kickUser,
  timeoutUser,
  unbanUser,
  untimeoutUser,
  warnUser,
  type ActionResult,
} from './actions.js';
import {
  buildCasesView,
  buildInfoView,
  buildLogsView,
  buildMainView,
  buildModerationView,
} from './views.js';

export type MenuInteraction =
  | ButtonInteraction<'cached'>
  | AnySelectMenuInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;

const ACTION_PERMISSIONS: Record<string, bigint> = {
  ban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  kick: PermissionFlagsBits.KickMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  warns: PermissionFlagsBits.ModerateMembers,
  clearwarns: PermissionFlagsBits.ModerateMembers,
  clear: PermissionFlagsBits.ManageMessages,
};

function hasPermission(
  interaction: ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
  permission: bigint,
): boolean {
  return interaction.memberPermissions?.has(permission) ?? false;
}

async function deny(
  interaction: ButtonInteraction<'cached'> | AnySelectMenuInteraction<'cached'> | ModalSubmitInteraction<'cached'>,
  message: string,
): Promise<void> {
  const payload = { components: [errorCard(message)], flags: v2Flags(true) } as const;
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

function input(
  customId: string,
  label: string,
  options?: {
    required?: boolean;
    style?: TextInputStyle;
    placeholder?: string;
    maxLength?: number;
  },
): LabelBuilder {
  const field = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(options?.style ?? TextInputStyle.Short)
    .setRequired(options?.required ?? false);

  if (options?.placeholder) field.setPlaceholder(options.placeholder);
  if (options?.maxLength) field.setMaxLength(options.maxLength);

  return new LabelBuilder().setLabel(label).setTextInputComponent(field);
}

function buildActionModal(action: string): ModalBuilder | null {
  switch (action) {
    case 'ban':
      return new ModalBuilder()
        .setCustomId('modal:ban')
        .setTitle('🔨 Забанить участника')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true, placeholder: '@user или 123456789012345678' }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
          input('delete', 'Удалить сообщения (секунды)', { placeholder: '0 / 3600 / 86400 / 604800' }),
        );
    case 'kick':
      return new ModalBuilder()
        .setCustomId('modal:kick')
        .setTitle('👢 Кикнуть участника')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
        );
    case 'unban':
      return new ModalBuilder()
        .setCustomId('modal:unban')
        .setTitle('🔓 Разбанить участника')
        .addComponents(
          input('user', 'ID участника', { required: true }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
        );
    case 'timeout':
      return new ModalBuilder()
        .setCustomId('modal:timeout')
        .setTitle('🔇 Заглушить участника')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true }),
          input('duration', 'Длительность (10m, 1h, 2d)', { required: true, placeholder: '10m' }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
        );
    case 'untimeout':
      return new ModalBuilder()
        .setCustomId('modal:untimeout')
        .setTitle('🔊 Снять таймаут')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
        );
    case 'warn':
      return new ModalBuilder()
        .setCustomId('modal:warn')
        .setTitle('⚠️ Выдать предупреждение')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true }),
          input('reason', 'Причина', { style: TextInputStyle.Paragraph, maxLength: 450 }),
        );
    case 'warns':
      return new ModalBuilder()
        .setCustomId('modal:warns')
        .setTitle('📋 Предупреждения участника')
        .addComponents(input('user', 'ID или @упоминание', { required: true }));
    case 'clearwarns':
      return new ModalBuilder()
        .setCustomId('modal:clearwarns')
        .setTitle('🧽 Снять предупреждения')
        .addComponents(
          input('user', 'ID или @упоминание', { required: true }),
          input('warn_id', 'ID предупреждения (пусто — все)'),
        );
    case 'clear':
      return new ModalBuilder()
        .setCustomId('modal:clear')
        .setTitle('🧹 Очистить сообщения')
        .addComponents(
          input('amount', 'Сколько сообщений (1–100)', { required: true, placeholder: '10' }),
          input('user', 'Только сообщения участника (необязательно)'),
        );
    default:
      return null;
  }
}

function parseUserId(value: string): string | null {
  const match = /^(?:<@!?)?(\d{17,20})>?$/.exec(value.trim());
  return match?.[1] ?? null;
}

function field(interaction: ModalSubmitInteraction, id: string): string | null {
  try {
    const value = interaction.fields.getTextInputValue(id).trim();
    return value || null;
  } catch {
    return null;
  }
}

async function openActionModal(
  interaction: ButtonInteraction<'cached'>,
  action: string,
): Promise<void> {
  const permission = ACTION_PERMISSIONS[action];
  if (!permission) return deny(interaction, 'Неизвестное действие.');
  if (!hasPermission(interaction, permission)) {
    return deny(interaction, 'У тебя нет прав на это действие.');
  }

  const modal = buildActionModal(action);
  if (!modal) return deny(interaction, 'Неизвестное действие.');
  await interaction.showModal(modal);
}

async function handleButton(interaction: ButtonInteraction<'cached'>): Promise<void> {
  const id = interaction.customId;

  if (id === 'menu:home') {
    return void interaction.update({
      components: buildMainView(interaction.guild).components,
      flags: V2,
    });
  }
  if (id === 'menu:moderation') {
    return void interaction.update({
      components: buildModerationView().components,
      flags: V2,
    });
  }
  if (id === 'menu:info') {
    return void interaction.update({
      components: buildInfoView(
        interaction.guild,
        interaction.client.user.tag,
        interaction.client.ws.ping,
      ).components,
      flags: V2,
    });
  }
  if (id === 'menu:logs') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    return void interaction.update({
      components: buildLogsView(interaction.guild).components,
      flags: V2,
    });
  }
  if (id === 'menu:cases') {
    if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
      return deny(interaction, 'Нужно право «Управление участниками».');
    }
    return void interaction.update({
      components: buildCasesView(interaction.guild).components,
      flags: V2,
    });
  }
  if (id === 'menu:close') {
    return void interaction.update({
      components: [
        card({
          tone: 'neutral',
          title: '✖️ Меню закрыто',
          description: 'Открой заново командой `/menu`.',
          timestamp: false,
        }),
      ],
      flags: V2,
    });
  }

  if (id === 'menu:info:ping') {
    return void interaction.reply({
      components: [
        successCard('🏓 Понг', `Задержка API: **${Math.round(interaction.client.ws.ping)} мс**.`),
      ],
      flags: v2Flags(true),
    });
  }
  if (id === 'menu:info:help') {
    const client = interaction.client as BotClient;
    const commands = [...client.commands.values()].sort((a, b) =>
      a.data.name.localeCompare(b.data.name),
    );
    return void interaction.reply({
      components: [
        card({
          tone: 'info',
          title: '📖 Команды',
          description:
            commands
              .map((command) => `**/${command.data.name}** — ${command.data.description}`)
              .join('\n') || 'Команды не загружены.',
          timestamp: false,
        }),
      ],
      flags: v2Flags(true),
    });
  }

  if (id.startsWith('menu:action:')) {
    return openActionModal(interaction, id.slice('menu:action:'.length));
  }

  if (id.startsWith('menu:logs:')) {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }

    const action = id.slice('menu:logs:'.length);
    if (action === 'on') {
      // Включаем всё, но не «каждое сообщение» — иначе канал логов превращается в спам
      setAllLogs(interaction.guild.id, true);
      setLogEvent(interaction.guild.id, 'messageCreate', false);
    } else if (action === 'off') {
      setAllLogs(interaction.guild.id, false);
    } else if (action === 'reset') {
      resetLogFilters(interaction.guild.id);
    } else if (action === 'channelOff') {
      setLogChannel(interaction.guild.id, null);
    }

    return void interaction.update({
      components: buildLogsView(interaction.guild).components,
      flags: V2,
    });
  }

  await deny(interaction, 'Кнопка устарела. Открой меню заново: `/menu`.');
}

async function handleModal(interaction: ModalSubmitInteraction<'cached'>): Promise<void> {
  const action = interaction.customId.split(':')[1] ?? '';
  const permission = ACTION_PERMISSIONS[action];

  if (!permission || !hasPermission(interaction, permission)) {
    return deny(interaction, 'У тебя нет прав на это действие.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const moderatorId = interaction.user.id;
  const userInput = field(interaction, 'user');
  const reason = field(interaction, 'reason') ?? 'Без причины';
  const userId = userInput ? parseUserId(userInput) : null;

  if (action === 'clear') {
    if (userInput && !userId) {
      return void interaction.editReply({
        components: [
          errorCard('Не удалось распознать участника. Укажи ID или @упоминание.'),
        ],
        flags: V2,
      });
    }
  } else if (!userId) {
    return void interaction.editReply({
      components: [
        errorCard('Не удалось распознать участника. Укажи ID или @упоминание.'),
      ],
      flags: V2,
    });
  }

  let result: ActionResult;

  try {
    switch (action) {
    case 'ban': {
      const deleteSeconds = Number(field(interaction, 'delete') ?? '0');
      result = await banUser(
        guild,
        moderatorId,
        userId!,
        reason,
        Number.isFinite(deleteSeconds) ? deleteSeconds : 0,
      );
      break;
    }
    case 'kick':
      result = await kickUser(guild, moderatorId, userId!, reason);
      break;
    case 'unban':
      result = await unbanUser(guild, moderatorId, userId!, reason);
      break;
    case 'timeout':
      result = await timeoutUser(
        guild,
        moderatorId,
        userId!,
        field(interaction, 'duration') ?? '',
        reason,
      );
      break;
    case 'untimeout':
      result = await untimeoutUser(guild, moderatorId, userId!, reason);
      break;
    case 'warn':
      result = await warnUser(guild, moderatorId, userId!, reason);
      break;
    case 'clearwarns':
      result = await clearWarnsAction(
        guild,
        moderatorId,
        userId!,
        field(interaction, 'warn_id'),
      );
      break;
    case 'clear': {
      const amount = Number(field(interaction, 'amount') ?? '0');
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        return void interaction.editReply({
          components: [errorCard('Количество должно быть целым числом от 1 до 100.')],
          flags: V2,
        });
      }
      if (!interaction.channel?.isTextBased() || !('bulkDelete' in interaction.channel)) {
        return void interaction.editReply({
          components: [errorCard('Это действие доступно только в текстовом канале.')],
          flags: V2,
        });
      }
      result = await clearMessages(interaction.channel, amount, userId, moderatorId);
      break;
    }
    case 'warns': {
      const warns = getWarns(guild.id, userId!);
      const warnFields = warns.slice(0, 10).map((warn) => ({
        label: `#${warn.id} · <t:${Math.floor(warn.createdAt / 1_000)}:d>`,
        value: `${truncate(warn.reason, 900)}\n-# Выдал: <@${warn.moderatorId}>`,
        block: true,
      }));

      return void interaction.editReply({
        components: [
          card({
            tone: warns.length ? 'warn' : 'success',
            title: '📋 Предупреждения',
            description: `<@${userId}> · **${warns.length}**`,
            fields:
              warnFields.length > 0
                ? warnFields
                : [{ label: 'Пока пусто', value: 'Предупреждений нет. 🎉' }],
            footer: `ID: ${userId}`,
            timestamp: false,
          }),
        ],
        flags: V2,
      });
    }
    default:
      return void interaction.editReply({
        components: [errorCard('Неизвестное действие.')],
        flags: V2,
      });
    }
  } catch (error) {
    console.error(`[menu] ошибка действия ${action}:`, error);
    return void interaction.editReply({
      components: [
        errorCard(
          'Discord отклонил действие. Проверьте права бота, иерархию ролей и позицию роли бота.',
        ),
      ],
      flags: V2,
    });
  }

  await interaction.editReply({
    components: [
      result.ok
        ? successCard('Готово', result.message)
        : errorCard(result.message),
    ],
    flags: V2,
  });
}

async function handleChannelSelect(
  interaction: AnySelectMenuInteraction<'cached'>,
): Promise<void> {
  if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
    return deny(interaction, 'Нужно право «Управление сервером».');
  }

  const channelId = interaction.values[0] ?? null;
  if (channelId) {
    const channel = interaction.guild.channels.cache.get(channelId);
    const me = interaction.guild.members.me;
    const permissions =
      channel && 'permissionsFor' in channel && me ? channel.permissionsFor(me) : null;

    if (
      !permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ])
    ) {
      return deny(
        interaction,
        'У бота нет прав писать в этот канал. Нужны: «Просмотр канала», «Отправка сообщений», «Встраивание ссылок».',
      );
    }
  }

  setLogChannel(interaction.guild.id, channelId);
  await interaction.update({
    components: buildLogsView(interaction.guild).components,
    flags: V2,
  });
}

async function handleCategorySelect(
  interaction: AnySelectMenuInteraction<'cached'>,
): Promise<void> {
  if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
    return deny(interaction, 'Нужно право «Управление сервером».');
  }

  const selected = new Set(interaction.values);
  for (const category of Object.keys(LOG_CATEGORIES) as LogCategory[]) {
    setLogCategory(interaction.guild.id, category, selected.has(category));
  }

  await interaction.update({
    components: buildLogsView(interaction.guild).components,
    flags: V2,
  });
}

export async function handleMenuInteraction(interaction: MenuInteraction): Promise<void> {
  if (interaction.isButton()) return handleButton(interaction);
  if (interaction.isChannelSelectMenu()) return handleChannelSelect(interaction);
  if (interaction.isStringSelectMenu()) return handleCategorySelect(interaction);
  if (interaction.isModalSubmit()) return handleModal(interaction);
  return deny(interaction, 'Неизвестное взаимодействие. Открой меню заново: `/menu`.');
}
