import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';

/** Кнопка в DM забаненного: открывает модалку апелляции для конкретного сервера. */
export function buildAppealButton(
  guildId: string,
): ActionRowBuilder<MessageActionRowComponentBuilder> {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`appeal:dm:start:${guildId}`)
      .setLabel('Подать апелляцию')
      .setEmoji('📨')
      .setStyle(ButtonStyle.Primary),
  );
}
