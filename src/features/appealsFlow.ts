import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildTextBasedChannel,
  type Message,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type User,
} from 'discord.js';
import {
  createAppeal,
  deleteAppeal,
  findPendingAppealForCase,
  updateAppeal,
  type Appeal,
} from '../lib/appeals.js';
import { appealableCaseLabel, isAppealableCase, listAppealableCases } from '../lib/appealCases.js';
import { V2, card, successCard, v2Flags, type CardField } from '../lib/card.js';
import { caseTypeLabel, getCase } from '../lib/cases.js';
import { getLogChannel } from '../lib/logger.js';
import { getModerationSettings } from '../lib/modSettings.js';

const CASE_ID = /^\d+$/;

export async function resolveAppealTarget(guild: Guild): Promise<GuildTextBasedChannel | null> {
  const settings = getModerationSettings(guild.id);
  const configured = settings.appealChannelId
    ? (guild.channels.cache.get(settings.appealChannelId) ??
      (await guild.channels.fetch(settings.appealChannelId).catch(() => null)))
    : null;
  const target = configured ?? getLogChannel(guild);

  if (!target?.isTextBased()) return null;
  return target as GuildTextBasedChannel;
}

function reviewRow(
  guildId: string,
  appealId: number,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal:approve:${guildId}:${appealId}`)
      .setLabel('Одобрить')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`appeal:reject:${guildId}:${appealId}`)
      .setLabel('Отклонить')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Отправляет карточку апелляции в канал и запоминает channel/message id. */
export async function postAppealCard(
  guild: Guild,
  appeal: Appeal,
  user: User,
  source: string,
): Promise<Message | null> {
  const target = await resolveAppealTarget(guild);
  if (!target) return null;

  const modCase = appeal.caseId ? getCase(guild.id, appeal.caseId) : null;
  const fields: CardField[] = [
    { label: 'Пользователь', value: `${user}`, block: false },
    { label: 'ID', value: user.id, block: false },
    { label: 'Источник', value: source, block: false },
  ];

  if (modCase) {
    fields.unshift({
      label: 'Наказание',
      value: `#${modCase.id} · ${caseTypeLabel(modCase.type)}`,
      block: false,
    });
    fields.push({ label: 'Причина наказания', value: modCase.reason, block: true });
  }

  const message = await target
    .send({
      components: [
        card({
          tone: 'warn',
          title: `📨 Апелляция #${appeal.id}`,
          description: appeal.reason,
          fields,
          buttons: [reviewRow(guild.id, appeal.id)],
          footer: `Создана <t:${Math.floor(appeal.createdAt / 1_000)}:f>`,
          timestamp: false,
        }),
      ],
      flags: V2,
    })
    .catch(() => null);

  if (message) {
    updateAppeal(guild.id, appeal.id, {
      channelId: target.id,
      messageId: message.id,
    });
  }

  return message;
}

function buildReasonModal(caseId: number): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`appeal:user:submit:${caseId}`)
    .setTitle('Апелляция на наказание')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Почему наказание стоит снять?')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1_000)
          .setRequired(true)
          .setPlaceholder('Опиши ситуацию и причину для снятия наказания'),
      ),
    );
}

function parseCaseId(customId: string): number | null {
  const [scope, kind, action, rawId] = customId.split(':');
  if (scope !== 'appeal' || kind !== 'user' || action !== 'submit') return null;
  if (!rawId || !CASE_ID.test(rawId)) return null;
  return Number(rawId);
}

/** Показывает список наказаний пользователя для выбора. */
export async function showAppealPicker(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const all = listAppealableCases(interaction.guild.id, interaction.user.id);
  const available = all.filter((item) => !findPendingAppealForCase(interaction.guild.id, item.id));

  if (available.length === 0) {
    await interaction
      .reply({
        components: [
          card({
            tone: 'info',
            title: all.length === 0 ? 'Нечего обжаловать' : 'Апелляции уже отправлены',
            description:
              all.length === 0
                ? 'У тебя нет наказаний за последнее время.'
                : 'Все доступные наказания уже находятся на рассмотрении.',
            timestamp: false,
          }),
        ],
        flags: v2Flags(true),
      })
      .catch(() => {});
    return;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('appeal:user:select')
    .setPlaceholder('Выбери наказание')
    .addOptions(
      available.map((item) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(appealableCaseLabel(item))
          .setDescription(
            `${item.active ? 'активно' : 'завершено'} · ${item.reason || 'без причины'}`
              .replace(/\s+/g, ' ')
              .slice(0, 100),
          )
          .setValue(String(item.id)),
      ),
    );

  const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(select);

  await interaction
    .reply({
      components: [
        card({
          tone: 'info',
          title: '📨 Подать апелляцию',
          description:
            'Выбери наказание, которое хочешь обжаловать. В следующем окне опиши причину.',
          rows: [row],
          footer: 'Одна апелляция на одно наказание',
          timestamp: false,
        }),
      ],
      flags: v2Flags(true),
    })
    .catch(() => {});
}

/** Показывает модалку для кейса, переданного в /appeal submit case:<id>. */
export async function showAppealModalForCase(
  interaction: ChatInputCommandInteraction,
  caseId: number,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const modCase = getCase(interaction.guild.id, caseId);
  if (!modCase || modCase.userId !== interaction.user.id || !isAppealableCase(modCase)) {
    await interaction
      .reply({
        components: [
          card({
            tone: 'danger',
            title: 'Кейс недоступен',
            description: 'Этот кейс не найден или не принадлежит тебе.',
            timestamp: false,
          }),
        ],
        flags: v2Flags(true),
      })
      .catch(() => {});
    return;
  }

  const existing = findPendingAppealForCase(interaction.guild.id, caseId);
  if (existing) {
    await interaction
      .reply({
        components: [
          card({
            tone: 'info',
            title: 'Апелляция уже отправлена',
            description: `По кейсу #${caseId} уже есть апелляция #${existing.id}.`,
            timestamp: false,
          }),
        ],
        flags: v2Flags(true),
      })
      .catch(() => {});
    return;
  }

  await interaction.showModal(buildReasonModal(caseId));
}

export async function handleUserAppealSelect(
  interaction: StringSelectMenuInteraction,
): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const caseId = Number(interaction.values[0]);
  const modCase = Number.isInteger(caseId) ? getCase(interaction.guild.id, caseId) : null;

  if (!modCase || modCase.userId !== interaction.user.id || !isAppealableCase(modCase)) {
    await interaction
      .reply({
        components: [
          card({
            tone: 'danger',
            title: 'Наказание не найдено',
            description: 'Кейс недоступен для апелляции.',
            timestamp: false,
          }),
        ],
        flags: v2Flags(true),
      })
      .catch(() => {});
    return;
  }

  const existing = findPendingAppealForCase(interaction.guild.id, caseId);
  if (existing) {
    await interaction
      .reply({
        components: [
          card({
            tone: 'info',
            title: 'Апелляция уже отправлена',
            description: `По кейсу #${caseId} уже есть апелляция #${existing.id}.`,
            timestamp: false,
          }),
        ],
        flags: v2Flags(true),
      })
      .catch(() => {});
    return;
  }

  await interaction.showModal(buildReasonModal(caseId));
}

export async function handleUserAppealModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  try {
    const caseId = parseCaseId(interaction.customId);
    const modCase = caseId ? getCase(interaction.guild.id, caseId) : null;

    if (
      !caseId ||
      !modCase ||
      modCase.userId !== interaction.user.id ||
      !isAppealableCase(modCase)
    ) {
      await interaction
        .editReply({
          components: [
            card({
              tone: 'danger',
              title: 'Кейс недоступен',
              description: 'Этот кейс не найден или не принадлежит тебе.',
              timestamp: false,
            }),
          ],
          flags: V2,
        })
        .catch(() => {});
      return;
    }

    const existing = findPendingAppealForCase(interaction.guild.id, caseId);
    if (existing) {
      await interaction
        .editReply({
          components: [
            card({
              tone: 'info',
              title: 'Апелляция уже отправлена',
              description: `По кейсу #${caseId} уже есть апелляция #${existing.id}.`,
              timestamp: false,
            }),
          ],
          flags: V2,
        })
        .catch(() => {});
      return;
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (reason.length < 10) {
      await interaction
        .editReply({
          components: [
            card({
              tone: 'danger',
              title: 'Слишком коротко',
              description: 'Опиши причину подробнее — минимум 10 символов.',
              timestamp: false,
            }),
          ],
          flags: V2,
        })
        .catch(() => {});
      return;
    }

    const appeal = createAppeal(interaction.guild.id, interaction.user.id, reason, caseId);
    const message = await postAppealCard(interaction.guild, appeal, interaction.user, 'Сервер');

    if (!message) {
      deleteAppeal(interaction.guild.id, appeal.id);
      await interaction
        .editReply({
          components: [
            card({
              tone: 'danger',
              title: 'Не удалось отправить',
              description: 'Канал апелляций не настроен или недоступен. Свяжись с администрацией.',
              timestamp: false,
            }),
          ],
          flags: V2,
        })
        .catch(() => {});
      return;
    }

    await interaction
      .editReply({
        components: [
          successCard(
            '📨 Апелляция отправлена',
            `Апелляция #${appeal.id} по кейсу #${caseId} отправлена модераторам.`,
          ),
        ],
        flags: V2,
      })
      .catch(() => {});
  } catch (error) {
    console.error('[appeal] ошибка формы:', error);
    await interaction
      .editReply({
        components: [
          card({
            tone: 'danger',
            title: 'Ошибка',
            description: 'Не удалось отправить апелляцию. Попробуй позже.',
            timestamp: false,
          }),
        ],
        flags: V2,
      })
      .catch(() => {});
  }
}
