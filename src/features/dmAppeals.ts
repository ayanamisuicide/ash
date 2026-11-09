import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from 'discord.js';
import { V2, infoCard } from '../lib/card.js';
import {
  createAppeal,
  deleteAppeal,
  findPendingAppeal,
  findPendingAppealForCase,
} from '../lib/appeals.js';
import { findLatestBanCase } from '../lib/appealCases.js';
import { postAppealCard, resolveAppealTarget } from './appealsFlow.js';

const GUILD_ID = /^\d{17,20}$/;

function parseGuildId(customId: string, action: 'start' | 'submit'): string | null {
  const [scope, kind, expectedAction, guildId] = customId.split(':');
  if (
    scope !== 'appeal' ||
    kind !== 'dm' ||
    expectedAction !== action ||
    !guildId ||
    !GUILD_ID.test(guildId)
  ) {
    return null;
  }
  return guildId;
}

async function resolveGuild(
  client: ButtonInteraction['client'],
  guildId: string,
): Promise<Guild | null> {
  return client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
}

/** true — забанен, false — нет, null — не удалось проверить */
async function fetchBanState(guild: Guild, userId: string): Promise<boolean | null> {
  try {
    await guild.bans.fetch(userId);
    return true;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 10026) return false;

    console.error('[appeal-dm] не удалось проверить бан:', error);
    return null;
  }
}

async function replyDm(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  content: string,
): Promise<void> {
  const view = infoCard('📨 Апелляция', content);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ components: [view], flags: V2 }).catch(() => {});
    return;
  }

  await interaction
    .reply({
      components: [view],
      flags: V2,
      allowedMentions: { parse: [] },
    })
    .catch(() => {});
}

function pendingAppeal(guild: Guild, userId: string) {
  const banCase = findLatestBanCase(guild.id, userId);
  const existing = banCase
    ? findPendingAppealForCase(guild.id, banCase.id)
    : findPendingAppeal(guild.id, userId);
  return { banCase, existing };
}

function appealModal(guildId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`appeal:dm:submit:${guildId}`)
    .setTitle('Апелляция на бан')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Почему стоит снять бан?')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1_000)
          .setRequired(true)
          .setPlaceholder('Опиши ситуацию и причину для разбана'),
      ),
    );
}

/** Кнопка из DM забаненного: проверяет бан и открывает форму апелляции. */
export async function handleDmAppealButton(interaction: ButtonInteraction): Promise<void> {
  try {
    const guildId = parseGuildId(interaction.customId, 'start');
    if (!guildId) {
      await replyDm(interaction, 'Некорректная кнопка апелляции.');
      return;
    }

    const guild = await resolveGuild(interaction.client, guildId);
    if (!guild) {
      await replyDm(interaction, 'Сервер не найден. Возможно, бот больше не работает на нём.');
      return;
    }

    const banState = await fetchBanState(guild, interaction.user.id);
    if (banState === null) {
      await replyDm(interaction, 'Не удалось проверить бан. Попробуй ещё раз позже.');
      return;
    }
    if (!banState) {
      await replyDm(interaction, 'Ты не забанен на этом сервере — апелляция не нужна.');
      return;
    }

    const { existing } = pendingAppeal(guild, interaction.user.id);
    if (existing) {
      await replyDm(
        interaction,
        `У тебя уже есть апелляция #${existing.id} на рассмотрении. Дождись ответа модераторов.`,
      );
      return;
    }

    const target = await resolveAppealTarget(guild);
    if (!target) {
      await replyDm(
        interaction,
        'На этом сервере не настроен канал апелляций. Свяжись с администрацией напрямую.',
      );
      return;
    }

    await interaction.showModal(appealModal(guild.id));
  } catch (error) {
    console.error('[appeal-dm] ошибка кнопки:', error);
    await replyDm(interaction, 'Не удалось открыть форму апелляции. Попробуй позже.');
  }
}

/** Отправка апелляции из модалки в канал апелляций. */
export async function handleDmAppealModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply().catch(() => {});

  try {
    const guildId = parseGuildId(interaction.customId, 'submit');
    if (!guildId) {
      await replyDm(interaction, 'Некорректная форма апелляции.');
      return;
    }

    const guild = await resolveGuild(interaction.client, guildId);
    if (!guild) {
      await replyDm(interaction, 'Сервер не найден. Возможно, бот больше не работает на нём.');
      return;
    }

    const banState = await fetchBanState(guild, interaction.user.id);
    if (banState === null) {
      await replyDm(interaction, 'Не удалось проверить бан. Попробуй ещё раз позже.');
      return;
    }
    if (!banState) {
      await replyDm(interaction, 'Ты уже не забанен на этом сервере.');
      return;
    }

    const { banCase, existing } = pendingAppeal(guild, interaction.user.id);
    if (existing) {
      await replyDm(
        interaction,
        `У тебя уже есть апелляция #${existing.id} на рассмотрении. Дождись ответа модераторов.`,
      );
      return;
    }

    const target = await resolveAppealTarget(guild);
    if (!target) {
      await replyDm(
        interaction,
        'На этом сервере не настроен канал апелляций. Свяжись с администрацией напрямую.',
      );
      return;
    }

    const reason = interaction.fields.getTextInputValue('reason').trim();
    if (reason.length < 10) {
      await replyDm(interaction, 'Опиши причину подробнее — минимум 10 символов.');
      return;
    }

    const appeal = createAppeal(guild.id, interaction.user.id, reason, banCase?.id ?? null);
    const message = await postAppealCard(guild, appeal, interaction.user, 'DM (забаненный)');

    if (!message) {
      deleteAppeal(guild.id, appeal.id);
      await replyDm(interaction, 'Не удалось отправить апелляцию. Попробуй позже.');
      return;
    }

    await replyDm(
      interaction,
      `📨 Апелляция #${appeal.id} отправлена модераторам. Ответ придёт в этот DM.`,
    );
  } catch (error) {
    console.error('[appeal-dm] ошибка формы:', error);
    await replyDm(interaction, 'Не удалось отправить апелляцию. Попробуй позже.');
  }
}
