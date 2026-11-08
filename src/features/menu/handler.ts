import {
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type AnySelectMenuInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { BotClient } from '../../core/client.js';
import { V2, card, errorCard, successCard, v2Flags } from '../../lib/card.js';
import { buildConfirmationView, createConfirmation } from '../../lib/confirmations.js';
import { caseTypeLabel, getCase, listCases, updateCase } from '../../lib/cases.js';
import { getCommunitySettings, updateCommunitySettings } from '../../lib/community.js';
import { humanDuration, parseDuration } from '../../lib/format.js';
import {
  LOG_CATEGORIES,
  resetLogFilters,
  setAllLogs,
  setLogCategory,
  setLogChannel,
  setLogEvent,
  type LogCategory,
} from '../../lib/logSettings.js';
import {
  addImmunityRole,
  getModerationSettings,
  getSecuritySettings,
  updateAutomod,
  updateNukeConfig,
  updateRaidConfig,
} from '../../lib/modSettings.js';
import {
  banUser,
  clearWarnsAction,
  kickUser,
  lockChannel,
  muteUser,
  roleAction,
  setNickname,
  setSlowmode,
  softbanUser,
  tempbanUser,
  tempRole,
  timeoutUser,
  unbanUser,
  unlockChannel,
  unmuteUser,
  untimeoutUser,
  voiceAction,
  warnActionLabel,
  warnUser,
  type ActionResult,
  type VoiceAction,
} from '../../lib/moderation.js';
import { fitFields, truncate } from '../../lib/logging.js';
import { getWarns } from '../../lib/warns.js';
import { clearMessages } from './actions.js';
import {
  buildCasesView,
  buildChannelsView,
  buildInfoView,
  buildLogsView,
  buildMainView,
  buildModerationView,
  buildRolesView,
  buildSettingsView,
  buildVoiceView,
  panelNavRow,
} from './views.js';

export type MenuInteraction =
  | ButtonInteraction<'cached'>
  | AnySelectMenuInteraction<'cached'>
  | ModalSubmitInteraction<'cached'>;

export const MENU_ACTION_PERMISSIONS: Record<string, bigint> = {
  ban: PermissionFlagsBits.BanMembers,
  tempban: PermissionFlagsBits.BanMembers,
  softban: PermissionFlagsBits.BanMembers,
  massban: PermissionFlagsBits.BanMembers,
  unban: PermissionFlagsBits.BanMembers,
  kick: PermissionFlagsBits.KickMembers,
  timeout: PermissionFlagsBits.ModerateMembers,
  untimeout: PermissionFlagsBits.ModerateMembers,
  mute: PermissionFlagsBits.ModerateMembers,
  unmute: PermissionFlagsBits.ModerateMembers,
  warn: PermissionFlagsBits.ModerateMembers,
  warns: PermissionFlagsBits.ModerateMembers,
  clearwarns: PermissionFlagsBits.ModerateMembers,
  clear: PermissionFlagsBits.ManageMessages,
  'role-add': PermissionFlagsBits.ManageRoles,
  'role-remove': PermissionFlagsBits.ManageRoles,
  'role-temp': PermissionFlagsBits.ManageRoles,
  setrole: PermissionFlagsBits.ManageRoles,
  setnick: PermissionFlagsBits.ManageNicknames,
  'voice-kick': PermissionFlagsBits.MoveMembers,
  'voice-move': PermissionFlagsBits.MoveMembers,
  'voice-mute': PermissionFlagsBits.MuteMembers,
  'voice-unmute': PermissionFlagsBits.MuteMembers,
  'voice-deafen': PermissionFlagsBits.DeafenMembers,
  'voice-undeafen': PermissionFlagsBits.DeafenMembers,
  lock: PermissionFlagsBits.ManageChannels,
  unlock: PermissionFlagsBits.ManageChannels,
  slowmode: PermissionFlagsBits.ManageChannels,
  'lockdown-on': PermissionFlagsBits.ManageChannels,
  'lockdown-off': PermissionFlagsBits.ManageChannels,
  'case-find': PermissionFlagsBits.ModerateMembers,
  modlogs: PermissionFlagsBits.ModerateMembers,
  'case-reason': PermissionFlagsBits.ModerateMembers,
  'case-duration': PermissionFlagsBits.ModerateMembers,
  'immunity-add': PermissionFlagsBits.ManageGuild,
  'welcome-channel': PermissionFlagsBits.ManageGuild,
  'warn-rules': PermissionFlagsBits.ManageGuild,
  'automod-toggle': PermissionFlagsBits.ManageGuild,
  'raid-toggle': PermissionFlagsBits.ManageGuild,
  'nuke-toggle': PermissionFlagsBits.ManageGuild,
  'leveling-toggle': PermissionFlagsBits.ManageGuild,
};

/** Действия, которые выполняются кнопкой сразу (без модалки) */
export const MENU_DIRECT_ACTIONS = new Set([
  'lock',
  'unlock',
  'lockdown-on',
  'lockdown-off',
  'warn-rules',
  'automod-toggle',
  'raid-toggle',
  'nuke-toggle',
  'leveling-toggle',
]);

/** Есть ли у действия модалка (используется тестами на полноту меню) */
export function menuActionHasModal(action: string): boolean {
  return buildActionModal(action) !== null;
}

/** customId модалки действия — должен совпадать с `modal:<action>` */
export function menuActionModalId(action: string): string | null {
  return menuActionModalJson(action)?.custom_id ?? null;
}

/** JSON модалки действия — для проверки лимитов Discord в тестах */
export function menuActionModalJson(action: string): ReturnType<ModalBuilder['toJSON']> | null {
  const modal = buildActionModal(action);
  return modal ? modal.toJSON() : null;
}

/** Действия, которым не нужен выбор участника */
const WITHOUT_USER = new Set([
  'clear',
  'massban',
  'massban-confirm',
  'case-find',
  'case-reason',
  'case-duration',
  'slowmode',
  'immunity-add',
  'welcome-channel',
  'media',
]);

function hasPermission(interaction: MenuInteraction, permission: bigint): boolean {
  return interaction.memberPermissions?.has(permission) ?? false;
}

async function deny(interaction: MenuInteraction, message: string): Promise<void> {
  const payload = { components: [errorCard(message)], flags: v2Flags(true) } as const;
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload).catch(() => {});
  } else {
    await interaction.reply(payload).catch(() => {});
  }
}

// ---------------------------------------------------------------- modal inputs

interface TextOptions {
  required?: boolean;
  style?: TextInputStyle;
  placeholder?: string;
  maxLength?: number;
}

function textInput(customId: string, label: string, options: TextOptions = {}): LabelBuilder {
  const field = new TextInputBuilder()
    .setCustomId(customId)
    .setStyle(options.style ?? TextInputStyle.Short)
    .setRequired(options.required ?? false);

  if (options.placeholder) field.setPlaceholder(options.placeholder);
  if (options.maxLength) field.setMaxLength(options.maxLength);

  return new LabelBuilder().setLabel(label).setTextInputComponent(field);
}

function userSelect(customId = 'user', label = 'Участник'): LabelBuilder {
  return new LabelBuilder()
    .setLabel(label)
    .setUserSelectMenuComponent(
      new UserSelectMenuBuilder()
        .setCustomId(customId)
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true),
    );
}

function roleSelect(customId = 'role', label = 'Роль'): LabelBuilder {
  return new LabelBuilder()
    .setLabel(label)
    .setRoleSelectMenuComponent(
      new RoleSelectMenuBuilder()
        .setCustomId(customId)
        .setMinValues(1)
        .setMaxValues(1)
        .setRequired(true),
    );
}

function channelSelect(customId: string, label: string, types: ChannelType[]): LabelBuilder {
  return new LabelBuilder().setLabel(label).setChannelSelectMenuComponent(
    new ChannelSelectMenuBuilder()
      .setCustomId(customId)
      .addChannelTypes(...types)
      .setMinValues(1)
      .setMaxValues(1)
      .setRequired(true),
  );
}

function buildActionModal(action: string): ModalBuilder | null {
  const reason = textInput('reason', 'Причина', {
    style: TextInputStyle.Paragraph,
    maxLength: 450,
  });
  const deleteMessages = textInput('delete', 'Удалить сообщения (секунды)', {
    placeholder: '0 / 3600 / 86400 / 604800',
  });

  switch (action) {
    case 'ban':
      return new ModalBuilder()
        .setCustomId('modal:ban')
        .setTitle('🔨 Забанить участника')
        .addComponents(userSelect(), reason, deleteMessages);

    case 'tempban':
      return new ModalBuilder()
        .setCustomId('modal:tempban')
        .setTitle('⏳ Временный бан')
        .addComponents(
          userSelect(),
          textInput('duration', 'Длительность (1h, 2d, 1w)', { required: true, placeholder: '2d' }),
          reason,
          deleteMessages,
        );

    case 'softban':
      return new ModalBuilder()
        .setCustomId('modal:softban')
        .setTitle('🧹 Софтбан (бан + разбан, чистка сообщений)')
        .addComponents(userSelect(), reason);

    case 'massban':
      return new ModalBuilder()
        .setCustomId('modal:massban')
        .setTitle('💥 Массбан по ID')
        .addComponents(
          textInput('users', 'ID через запятую или пробел (до 50)', {
            required: true,
            style: TextInputStyle.Paragraph,
            maxLength: 1_000,
          }),
          reason,
          deleteMessages,
        );

    case 'kick':
      return new ModalBuilder()
        .setCustomId('modal:kick')
        .setTitle('👢 Кикнуть участника')
        .addComponents(userSelect(), reason);

    case 'unban':
      return new ModalBuilder()
        .setCustomId('modal:unban')
        .setTitle('🔓 Разбанить участника')
        .addComponents(userSelect(), reason);

    case 'timeout':
      return new ModalBuilder()
        .setCustomId('modal:timeout')
        .setTitle('🔇 Заглушить участника')
        .addComponents(
          userSelect(),
          textInput('duration', 'Длительность (10m, 1h, 2d)', {
            required: true,
            placeholder: '10m',
          }),
          reason,
        );

    case 'untimeout':
      return new ModalBuilder()
        .setCustomId('modal:untimeout')
        .setTitle('🔊 Снять таймаут')
        .addComponents(userSelect(), reason);

    case 'mute':
      return new ModalBuilder()
        .setCustomId('modal:mute')
        .setTitle('🤐 Мут (роль Muted)')
        .addComponents(
          userSelect(),
          textInput('duration', 'Длительность (пусто — навсегда)', { placeholder: '1d' }),
          reason,
        );

    case 'unmute':
      return new ModalBuilder()
        .setCustomId('modal:unmute')
        .setTitle('🔈 Снять мут')
        .addComponents(userSelect(), reason);

    case 'warn':
      return new ModalBuilder()
        .setCustomId('modal:warn')
        .setTitle('⚠️ Выдать предупреждение')
        .addComponents(userSelect(), reason);

    case 'warns':
      return new ModalBuilder()
        .setCustomId('modal:warns')
        .setTitle('📋 Предупреждения участника')
        .addComponents(userSelect());

    case 'clearwarns':
      return new ModalBuilder()
        .setCustomId('modal:clearwarns')
        .setTitle('🧽 Снять предупреждения')
        .addComponents(userSelect(), textInput('warn_id', 'ID предупреждения (пусто — все)'));

    case 'clear':
      return new ModalBuilder()
        .setCustomId('modal:clear')
        .setTitle('🧹 Очистить сообщения')
        .addComponents(
          textInput('amount', 'Сколько сообщений (1–100)', { required: true, placeholder: '10' }),
          textInput('user', 'Только сообщения участника (ID или @)'),
        );

    case 'role-add':
    case 'role-remove':
      return new ModalBuilder()
        .setCustomId(`modal:${action}`)
        .setTitle(action === 'role-add' ? '➕ Выдать роль' : '➖ Снять роль')
        .addComponents(userSelect(), roleSelect(), reason);

    case 'role-temp':
      return new ModalBuilder()
        .setCustomId('modal:role-temp')
        .setTitle('⏱️ Временная роль')
        .addComponents(
          userSelect(),
          roleSelect(),
          textInput('duration', 'Длительность (1h, 2d, 1w)', { required: true }),
          reason,
        );

    case 'setrole':
      return new ModalBuilder()
        .setCustomId('modal:setrole')
        .setTitle('🎭 Заменить все управляемые роли')
        .addComponents(userSelect(), roleSelect(), reason);

    case 'setnick':
      return new ModalBuilder()
        .setCustomId('modal:setnick')
        .setTitle('✏️ Изменить ник')
        .addComponents(
          userSelect(),
          textInput('nickname', 'Новый ник (пусто — сбросить)', { maxLength: 32 }),
          reason,
        );

    case 'voice-kick':
    case 'voice-mute':
    case 'voice-unmute':
    case 'voice-deafen':
    case 'voice-undeafen':
      return new ModalBuilder()
        .setCustomId(`modal:${action}`)
        .setTitle(`🔊 ${voiceLabel(action)}`)
        .addComponents(userSelect(), reason);

    case 'voice-move':
      return new ModalBuilder()
        .setCustomId('modal:voice-move')
        .setTitle('↔️ Переместить в голосовой канал')
        .addComponents(
          userSelect(),
          channelSelect('channel', 'Куда переместить', [
            ChannelType.GuildVoice,
            ChannelType.GuildStageVoice,
          ]),
          reason,
        );

    case 'case-find':
      return new ModalBuilder()
        .setCustomId('modal:case-find')
        .setTitle('🔍 Найти кейс')
        .addComponents(textInput('id', 'Номер кейса', { required: true, placeholder: '12' }));

    case 'modlogs':
      return new ModalBuilder()
        .setCustomId('modal:modlogs')
        .setTitle('📜 История модерации участника')
        .addComponents(userSelect(), textInput('page', 'Страница', { placeholder: '1' }));

    case 'case-reason':
      return new ModalBuilder()
        .setCustomId('modal:case-reason')
        .setTitle('✏️ Изменить причину кейса')
        .addComponents(
          textInput('id', 'Номер кейса', { required: true }),
          textInput('reason', 'Новая причина', { required: true, maxLength: 500 }),
        );

    case 'case-duration':
      return new ModalBuilder()
        .setCustomId('modal:case-duration')
        .setTitle('⏳ Изменить срок кейса')
        .addComponents(
          textInput('id', 'Номер кейса', { required: true }),
          textInput('duration', 'Срок: 1h, 2d, 1w, permanent', { required: true }),
        );

    case 'slowmode':
      return new ModalBuilder()
        .setCustomId('modal:slowmode')
        .setTitle('🐌 Медленный режим (текущий канал)')
        .addComponents(
          textInput('seconds', 'Секунды (0 — выключить)', { required: true, placeholder: '10' }),
          reason,
        );

    case 'immunity-add':
      return new ModalBuilder()
        .setCustomId('modal:immunity-add')
        .setTitle('🛡️ Добавить роль в иммунитет')
        .addComponents(roleSelect('role', 'Роль'));

    case 'welcome-channel':
      return new ModalBuilder()
        .setCustomId('modal:welcome-channel')
        .setTitle('👋 Канал приветствий')
        .addComponents(
          channelSelect('channel', 'Канал', [ChannelType.GuildText, ChannelType.GuildAnnouncement]),
        );

    default:
      return null;
  }
}

function voiceLabel(action: string): string {
  const labels: Record<string, string> = {
    'voice-kick': 'Отключить от голоса',
    'voice-mute': 'Заглушить в голосе',
    'voice-unmute': 'Разглушить в голосе',
    'voice-deafen': 'Оглушить',
    'voice-undeafen': 'Разоглушить',
  };
  return labels[action] ?? 'Голосовое действие';
}

// ---------------------------------------------------------------- field parsing

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

function selectedUser(interaction: ModalSubmitInteraction): string | null {
  try {
    return interaction.fields.getSelectedUsers('user', true).first()?.id ?? null;
  } catch {
    return null;
  }
}

function selectedRole(interaction: ModalSubmitInteraction, id = 'role'): string | null {
  try {
    return interaction.fields.getSelectedRoles(id, true).first()?.id ?? null;
  } catch {
    return null;
  }
}

function selectedChannel(interaction: ModalSubmitInteraction, id = 'channel'): string | null {
  try {
    return interaction.fields.getSelectedChannels(id, true).first()?.id ?? null;
  } catch {
    return null;
  }
}

function numberField(interaction: ModalSubmitInteraction, id: string): number | null {
  const raw = field(interaction, id);
  if (!raw) return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

// ------------------------------------------------------------------- rendering

async function showView(
  interaction: ButtonInteraction<'cached'>,
  components: ReturnType<typeof buildMainView>['components'],
): Promise<void> {
  await interaction.update({ components, flags: V2 });
}

function resultCard(
  result: ActionResult,
  backTo: string,
  title = 'Готово',
): ReturnType<typeof card> {
  return card({
    tone: result.ok ? 'success' : 'danger',
    title: result.ok ? title : 'Ошибка',
    description: result.message,
    footer: result.caseId ? `Кейс #${result.caseId}` : null,
    buttons: [panelNavRow(backTo)],
    timestamp: false,
  });
}

function caseCard(guildId: string, caseId: number): ReturnType<typeof card> {
  const modCase = getCase(guildId, caseId);
  if (!modCase) {
    return errorCard(`Кейса #${caseId} на этом сервере нет.`);
  }

  return card({
    tone: modCase.active ? 'warn' : 'info',
    title: `📋 Кейс #${modCase.id}`,
    description: caseTypeLabel(modCase.type),
    fields: [
      { label: 'Участник', value: modCase.userId ? `<@${modCase.userId}>` : '—', block: false },
      { label: 'Модератор', value: `<@${modCase.moderatorId}>`, block: false },
      {
        label: 'Создан',
        value: `<t:${Math.floor(modCase.createdAt / 1_000)}:f>`,
        block: false,
      },
      {
        label: 'Истекает',
        value: modCase.expiresAt ? `<t:${Math.floor(modCase.expiresAt / 1_000)}:f>` : 'бессрочно',
        block: false,
      },
      { label: 'Активен', value: modCase.active ? 'да' : 'нет', block: false },
      { label: 'Причина', value: truncate(modCase.reason, 900), block: true },
    ],
    footer: `ID: ${modCase.userId ?? '—'}`,
    timestamp: false,
  });
}

// ---------------------------------------------------------------- button routes

async function handleButton(interaction: ButtonInteraction<'cached'>): Promise<void> {
  const id = interaction.customId;
  const guild = interaction.guild;

  if (id === 'menu:home') return showView(interaction, buildMainView(guild).components);
  if (id === 'menu:moderation') return showView(interaction, buildModerationView().components);
  if (id === 'menu:roles') return showView(interaction, buildRolesView().components);
  if (id === 'menu:channels') return showView(interaction, buildChannelsView(guild).components);
  if (id === 'menu:voice') return showView(interaction, buildVoiceView().components);

  if (id === 'menu:cases') {
    if (!hasPermission(interaction, PermissionFlagsBits.ModerateMembers)) {
      return deny(interaction, 'Нужно право «Управление участниками».');
    }
    return showView(interaction, buildCasesView(guild).components);
  }

  if (id === 'menu:logs') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    return showView(interaction, buildLogsView(guild).components);
  }

  if (id === 'menu:settings') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    return showView(interaction, buildSettingsView(guild).components);
  }

  if (id === 'menu:info') {
    return showView(
      interaction,
      buildInfoView(guild, interaction.client.user.tag, interaction.client.ws.ping).components,
    );
  }

  if (id === 'menu:close') {
    return showView(interaction, [
      card({
        tone: 'neutral',
        title: '✖️ Меню закрыто',
        description: 'Открой заново командой `/menu`.',
        timestamp: false,
      }),
    ]);
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
          description: truncate(
            commands
              .map((command) => `**/${command.data.name}** — ${command.data.description}`)
              .join('\n') || 'Команды не загружены.',
            3_500,
          ),
          timestamp: false,
        }),
      ],
      flags: v2Flags(true),
    });
  }

  if (id.startsWith('menu:logs:')) {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }

    const action = id.slice('menu:logs:'.length);
    if (action === 'on') {
      setAllLogs(guild.id, true);
      setLogEvent(guild.id, 'messageCreate', false);
    } else if (action === 'off') {
      setAllLogs(guild.id, false);
    } else if (action === 'reset') {
      resetLogFilters(guild.id);
    } else if (action === 'channelOff') {
      setLogChannel(guild.id, null);
    }

    return showView(interaction, buildLogsView(guild).components);
  }

  // ---- действия без модалки ------------------------------------------------

  if (id === 'menu:action:lock' || id === 'menu:action:unlock') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
      return deny(interaction, 'Нужно право «Управление каналами».');
    }

    const channel = interaction.channel;
    if (!channel?.isTextBased() || channel.isThread()) {
      return deny(interaction, 'Команда работает только в текстовом канале.');
    }

    const reason = 'Действие из меню';
    const result =
      id === 'menu:action:lock'
        ? await lockChannel(guild, channel, interaction.user.id, reason)
        : await unlockChannel(guild, channel, interaction.user.id, reason);

    return showView(interaction, [resultCard(result, 'menu:channels')]);
  }

  if (id === 'menu:action:lockdown-on' || id === 'menu:action:lockdown-off') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageChannels)) {
      return deny(interaction, 'Нужно право «Управление каналами».');
    }

    const enabled = id.endsWith('on');
    const reason = enabled ? 'Lockdown из меню' : 'Снятие lockdown из меню';
    const confirmationId = createConfirmation({
      guildId: guild.id,
      userId: interaction.user.id,
      kind: 'lockdown',
      permission: PermissionFlagsBits.ManageChannels,
      payload: { enabled, reason },
    });

    return void interaction.update(
      buildConfirmationView(
        confirmationId,
        enabled ? '🔒 Подтверждение lockdown' : '🔓 Подтверждение снятия lockdown',
        enabled
          ? 'Заблокировать **все текстовые каналы** сервера?'
          : 'Разблокировать **все каналы**, заблокированные ботом?',
        [{ label: 'Причина', value: reason, block: true }],
      ),
    );
  }

  if (id === 'menu:action:warn-rules') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }

    const rules = getModerationSettings(guild.id).warnActions;
    return showView(interaction, [
      card({
        tone: 'info',
        title: '⚡ Правила автонаказаний',
        description:
          rules.length > 0
            ? 'Срабатывает правило с наибольшим достигнутым порогом. Изменение — `/warnconfig`.'
            : 'Правил нет. Добавить: `/warnconfig add`.',
        fields: fitFields(
          rules.map((rule) => ({
            label: `\`${rule.id}\` · ${rule.count} варнов за ${rule.windowDays} дн.`,
            value: `${warnActionLabel(rule)}${rule.durationMs ? ` · ${humanDuration(rule.durationMs)}` : ''}`,
            block: true,
          })),
        ),
        buttons: [panelNavRow('menu:settings')],
        timestamp: false,
      }),
    ]);
  }

  if (id === 'menu:action:automod-toggle') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    const current = getModerationSettings(guild.id).automod.enabled;
    updateAutomod(guild.id, { enabled: !current });
    return showView(interaction, buildSettingsView(guild).components);
  }

  if (id === 'menu:action:raid-toggle') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    const current = getSecuritySettings(guild.id).raid.enabled;
    updateRaidConfig(guild.id, { enabled: !current });
    return showView(interaction, buildSettingsView(guild).components);
  }

  if (id === 'menu:action:nuke-toggle') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    const current = getSecuritySettings(guild.id).nuke.enabled;
    updateNukeConfig(guild.id, { enabled: !current });
    return showView(interaction, buildSettingsView(guild).components);
  }

  if (id === 'menu:action:leveling-toggle') {
    if (!hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
      return deny(interaction, 'Нужно право «Управление сервером».');
    }
    const current = getCommunitySettings(guild.id).levelingEnabled;
    updateCommunitySettings(guild.id, { levelingEnabled: !current });
    return showView(interaction, buildSettingsView(guild).components);
  }

  if (id.startsWith('menu:action:')) {
    return openActionModal(interaction, id.slice('menu:action:'.length));
  }

  await deny(interaction, 'Кнопка устарела. Открой меню заново: `/menu`.');
}

async function openActionModal(
  interaction: ButtonInteraction<'cached'>,
  action: string,
): Promise<void> {
  const permission = MENU_ACTION_PERMISSIONS[action];
  if (!permission) return deny(interaction, 'Неизвестное действие.');
  if (!hasPermission(interaction, permission)) {
    return deny(interaction, 'У тебя нет прав на это действие.');
  }

  const modal = buildActionModal(action);
  if (!modal) return deny(interaction, 'Неизвестное действие.');
  await interaction.showModal(modal);
}

// --------------------------------------------------------------- modal submits

async function handleModal(interaction: ModalSubmitInteraction<'cached'>): Promise<void> {
  const action = interaction.customId.split(':')[1] ?? '';
  const permission = MENU_ACTION_PERMISSIONS[action];

  if (!permission || !hasPermission(interaction, permission)) {
    return deny(interaction, 'У тебя нет прав на это действие.');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const moderatorId = interaction.user.id;
  const reason = field(interaction, 'reason') ?? 'Без причины';
  const userId = selectedUser(interaction);

  if (!WITHOUT_USER.has(action) && !userId) {
    return await fail(interaction, 'Не удалось определить участника. Открой окно заново.');
  }

  try {
    switch (action) {
      case 'ban': {
        const deleteSeconds = numberField(interaction, 'delete') ?? 0;
        return await finish(
          interaction,
          await banUser(guild, moderatorId, userId!, reason, deleteSeconds),
        );
      }

      case 'tempban': {
        const durationMs = parseDuration(field(interaction, 'duration') ?? '');
        if (!durationMs) return await fail(interaction, 'Неверный формат длительности.');
        const deleteSeconds = numberField(interaction, 'delete') ?? 0;
        return await finish(
          interaction,
          await tempbanUser(guild, moderatorId, userId!, durationMs, reason, deleteSeconds),
        );
      }

      case 'softban':
        return await finish(interaction, await softbanUser(guild, moderatorId, userId!, reason));

      case 'massban': {
        const ids = (field(interaction, 'users') ?? '')
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (ids.length === 0) return await fail(interaction, 'Укажите хотя бы один ID.');
        if (ids.length > 50) return await fail(interaction, 'Не более 50 ID за раз.');

        const confirmationId = createConfirmation({
          guildId: guild.id,
          userId: interaction.user.id,
          kind: 'massban',
          permission: PermissionFlagsBits.BanMembers,
          payload: {
            userIds: ids,
            reason,
            deleteSeconds: numberField(interaction, 'delete') ?? 0,
          },
        });

        return void interaction.editReply(
          buildConfirmationView(
            confirmationId,
            '💥 Подтверждение массового бана',
            `Забанить **${ids.length}** пользователей?`,
            [
              { label: 'ID', value: ids.slice(0, 10).join(', '), block: true },
              { label: 'Причина', value: reason, block: true },
            ],
          ),
        );
      }

      case 'kick':
        return await finish(interaction, await kickUser(guild, moderatorId, userId!, reason));

      case 'unban':
        return await finish(interaction, await unbanUser(guild, moderatorId, userId!, reason));

      case 'timeout':
        return await finish(
          interaction,
          await timeoutUser(
            guild,
            moderatorId,
            userId!,
            field(interaction, 'duration') ?? '',
            reason,
          ),
        );

      case 'untimeout':
        return await finish(interaction, await untimeoutUser(guild, moderatorId, userId!, reason));

      case 'mute':
        return await finish(
          interaction,
          await muteUser(guild, moderatorId, userId!, field(interaction, 'duration'), reason),
        );

      case 'unmute':
        return await finish(interaction, await unmuteUser(guild, moderatorId, userId!, reason));

      case 'warn':
        return await finish(interaction, await warnUser(guild, moderatorId, userId!, reason));

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
                  ? fitFields(warnFields)
                  : [{ label: 'Пока пусто', value: 'Предупреждений нет. 🎉' }],
              footer: `ID: ${userId}`,
              timestamp: false,
            }),
          ],
          flags: V2,
        });
      }

      case 'clearwarns':
        return await finish(
          interaction,
          await clearWarnsAction(guild, moderatorId, userId!, field(interaction, 'warn_id')),
        );

      case 'clear': {
        const amount = numberField(interaction, 'amount') ?? 0;
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
          return await fail(interaction, 'Количество должно быть целым числом от 1 до 100.');
        }

        const rawUser = field(interaction, 'user');
        const targetUserId = rawUser ? parseUserId(rawUser) : null;
        if (rawUser && !targetUserId) {
          return await fail(interaction, 'Не удалось распознать участника.');
        }

        const channel = interaction.channel;
        if (!channel?.isTextBased() || !('bulkDelete' in channel)) {
          return await fail(interaction, 'Это действие доступно только в текстовом канале.');
        }

        return await finish(
          interaction,
          await clearMessages(channel, amount, targetUserId, moderatorId),
        );
      }

      case 'role-add':
      case 'role-remove': {
        const roleId = selectedRole(interaction);
        if (!roleId) return await fail(interaction, 'Не удалось определить роль.');
        return await finish(
          interaction,
          await roleAction(
            guild,
            moderatorId,
            userId!,
            roleId,
            action === 'role-add' ? 'add' : 'remove',
            reason,
          ),
          '🎭 Роли',
        );
      }

      case 'role-temp': {
        const roleId = selectedRole(interaction);
        const durationMs = parseDuration(field(interaction, 'duration') ?? '');
        if (!roleId) return await fail(interaction, 'Не удалось определить роль.');
        if (!durationMs) return await fail(interaction, 'Неверный формат длительности.');
        return await finish(
          interaction,
          await tempRole(guild, moderatorId, userId!, roleId, durationMs, reason),
          '🎭 Временная роль',
        );
      }

      case 'setrole': {
        const roleId = selectedRole(interaction);
        if (!roleId) return await fail(interaction, 'Не удалось определить роль.');

        const confirmationId = createConfirmation({
          guildId: guild.id,
          userId: interaction.user.id,
          kind: 'setrole',
          permission: PermissionFlagsBits.ManageRoles,
          payload: { userId, roleId, reason },
        });

        return void interaction.editReply(
          buildConfirmationView(
            confirmationId,
            '🎭 Подтверждение setrole',
            `Заменить все управляемые роли участника <@${userId}> на <@&${roleId}>?`,
            [
              { label: 'Участник', value: `<@${userId}>`, block: false },
              { label: 'Роль', value: `<@&${roleId}>`, block: false },
              { label: 'Причина', value: reason, block: true },
            ],
          ),
        );
      }

      case 'setnick':
        return await finish(
          interaction,
          await setNickname(guild, moderatorId, userId!, field(interaction, 'nickname'), reason),
        );

      case 'voice-kick':
      case 'voice-mute':
      case 'voice-unmute':
      case 'voice-deafen':
      case 'voice-undeafen':
      case 'voice-move': {
        const voiceActionName = action.replace('voice-', '') as VoiceAction;
        const channelId = action === 'voice-move' ? selectedChannel(interaction) : null;
        if (action === 'voice-move' && !channelId) {
          return await fail(interaction, 'Не удалось определить канал.');
        }

        return await finish(
          interaction,
          await voiceAction(guild, moderatorId, userId!, voiceActionName, reason, channelId),
          '🔊 Голос',
        );
      }

      case 'case-find': {
        const id = numberField(interaction, 'id');
        if (!id) return await fail(interaction, 'Укажите номер кейса.');
        return void interaction.editReply({
          components: [caseCard(guild.id, id)],
          flags: V2,
        });
      }

      case 'modlogs': {
        const page = Math.max(1, Math.floor(numberField(interaction, 'page') ?? 1));
        const all = listCases(guild.id, userId!, 1_000);
        const pageSize = 10;
        const pages = Math.max(1, Math.ceil(all.length / pageSize));
        const safePage = Math.min(page, pages);
        const slice = all.slice((safePage - 1) * pageSize, safePage * pageSize);

        return void interaction.editReply({
          components: [
            card({
              tone: 'info',
              title: '📜 История модерации',
              description: `<@${userId}> · всего кейсов: **${all.length}**`,
              fields:
                slice.length > 0
                  ? fitFields(
                      slice.map((modCase) => ({
                        label: `#${modCase.id} · ${caseTypeLabel(modCase.type)} · <t:${Math.floor(modCase.createdAt / 1_000)}:d>`,
                        value: `${truncate(modCase.reason, 400)}\n-# Модератор: <@${modCase.moderatorId}>${modCase.active ? ' · активно' : ''}`,
                        block: true,
                      })),
                    )
                  : [{ label: 'Пусто', value: 'Кейсов нет.', block: false }],
              footer: `Страница ${safePage} из ${pages} · ID: ${userId}`,
              timestamp: false,
            }),
          ],
          flags: V2,
        });
      }

      case 'case-reason': {
        const id = numberField(interaction, 'id');
        const newReason = field(interaction, 'reason');
        if (!id) return await fail(interaction, 'Укажите номер кейса.');
        if (!newReason) return await fail(interaction, 'Укажите новую причину.');
        if (!getCase(guild.id, id)) return await fail(interaction, `Кейс #${id} не найден.`);

        updateCase(guild.id, id, { reason: newReason });
        return await finish(
          interaction,
          { ok: true, message: `Причина кейса #${id} изменена.`, caseId: id },
          '✏️ Кейс',
        );
      }

      case 'case-duration': {
        const id = numberField(interaction, 'id');
        if (!id) return await fail(interaction, 'Укажите номер кейса.');

        const existing = getCase(guild.id, id);
        if (!existing) return await fail(interaction, `Кейс #${id} не найден.`);

        if (!['ban', 'tempban', 'timeout', 'mute', 'temprole'].includes(existing.type)) {
          return await fail(
            interaction,
            `Для кейса «${caseTypeLabel(existing.type)}» срок изменить нельзя.`,
          );
        }

        const input = (field(interaction, 'duration') ?? '').trim();
        const permanent = input === '0' || input.toLowerCase() === 'permanent';
        const durationMs = permanent ? null : parseDuration(input);
        if (!permanent && !durationMs) {
          return await fail(interaction, 'Неверный формат. Пример: `1h`, `2d`, `permanent`.');
        }

        const expiresAt = durationMs ? Date.now() + durationMs : null;
        updateCase(guild.id, id, { expiresAt, active: true });
        return await finish(
          interaction,
          {
            ok: true,
            message: expiresAt
              ? `Срок кейса #${id}: <t:${Math.floor(expiresAt / 1_000)}:f>.`
              : `Кейс #${id} теперь бессрочный.`,
            caseId: id,
          },
          '⏳ Кейс',
        );
      }

      case 'slowmode': {
        const seconds = numberField(interaction, 'seconds');
        if (seconds === null || seconds < 0) {
          return await fail(interaction, 'Укажите количество секунд (0 — выключить).');
        }

        const channel = interaction.channel;
        if (!channel?.isTextBased() || channel.isThread()) {
          return await fail(interaction, 'Команда работает только в текстовом канале.');
        }

        return await finish(
          interaction,
          await setSlowmode(guild, channel, seconds, moderatorId, reason),
          '🐌 Slowmode',
        );
      }

      case 'immunity-add': {
        const roleId = selectedRole(interaction);
        if (!roleId) return await fail(interaction, 'Не удалось определить роль.');

        const added = addImmunityRole(guild.id, roleId);
        return await finish(
          interaction,
          added
            ? { ok: true, message: `Роль <@&${roleId}> добавлена в иммунитет.` }
            : { ok: false, message: 'Эта роль уже в списке иммунитета.' },
          '🛡️ Иммунитет',
        );
      }

      case 'welcome-channel': {
        const channelId = selectedChannel(interaction);
        if (!channelId) return await fail(interaction, 'Не удалось определить канал.');

        updateCommunitySettings(guild.id, { welcomeChannelId: channelId });
        return await finish(
          interaction,
          { ok: true, message: `Канал приветствий: <#${channelId}>.` },
          '👋 Приветствия',
        );
      }

      default:
        return await fail(interaction, 'Неизвестное действие.');
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
}

async function finish(
  interaction: ModalSubmitInteraction<'cached'>,
  result: ActionResult,
  title = 'Готово',
): Promise<void> {
  await interaction.editReply({
    components: [result.ok ? successCard(title, result.message) : errorCard(result.message)],
    flags: V2,
  });
}

async function fail(interaction: ModalSubmitInteraction<'cached'>, message: string): Promise<void> {
  await interaction.editReply({ components: [errorCard(message)], flags: V2 });
}

// -------------------------------------------------------------- select menus

async function handleChannelSelect(interaction: AnySelectMenuInteraction<'cached'>): Promise<void> {
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
