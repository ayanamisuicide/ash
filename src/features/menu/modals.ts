import {
  ChannelSelectMenuBuilder,
  ChannelType,
  LabelBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} from 'discord.js';

/**
 * Билдеры модалок действий меню: чистые функции без обращений к Discord.
 * Вынесены из handler.ts, чтобы маршрутизация оставалась читаемой, а тесты
 * могли проверять customId и лимиты компонентов.
 */

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

export function buildActionModal(action: string): ModalBuilder | null {
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
        .addComponents(
          userSelect(),
          textInput('warn_id', 'ID предупреждения (пусто — все)'),
          reason,
        );

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

    case 'role-clear':
      return new ModalBuilder()
        .setCustomId('modal:role-clear')
        .setTitle('🧹 Снять все роли')
        .addComponents(userSelect(), reason);

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
