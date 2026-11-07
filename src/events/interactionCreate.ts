import { Events, type RepliableInteraction } from 'discord.js';
import type { BotClient } from '../core/client.js';
import type { BotEvent } from '../core/types.js';
import { V2, errorCard, v2Flags } from '../lib/card.js';
import { handleMenuInteraction, type MenuInteraction } from '../features/menu/handler.js';
import { handleAppealButton } from '../features/appeals.js';

function isUnknownInteraction(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: number }).code;
  return code === 10062 || code === 40060;
}

async function replyWithError(interaction: RepliableInteraction, message: string): Promise<void> {
  const components = [errorCard(message)];

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ components, flags: V2 }).catch(() => {});
  } else {
    await interaction.reply({ components, flags: v2Flags(true) }).catch(() => {});
  }
}

export default {
  name: Events.InteractionCreate,

  async execute(interaction) {
    const client = interaction.client as BotClient;

    // Автодополнение опций команд
    if (interaction.isAutocomplete()) {
      if (!interaction.inCachedGuild()) return;

      const command = client.commands.get(interaction.commandName);
      try {
        if (!command?.autocomplete) {
          await interaction.respond([]);
          return;
        }
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`[bot] ошибка автодополнения /${interaction.commandName}:`, error);
        await interaction.respond([]).catch(() => {});
      }
      return;
    }

    if (interaction.isButton() || interaction.isAnySelectMenu() || interaction.isModalSubmit()) {
      if (!interaction.inCachedGuild()) return;

      try {
        if (interaction.isButton() && interaction.customId.startsWith('appeal:')) {
          await handleAppealButton(interaction);
        } else {
          await handleMenuInteraction(interaction as MenuInteraction);
        }
      } catch (error) {
        if (isUnknownInteraction(error)) {
          console.warn('[bot] взаимодействие меню истекло');
          return;
        }

        console.error('[bot] ошибка в меню:', error);
        await replyWithError(interaction, 'Произошла ошибка при обработке меню.');
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
      console.warn(`[bot] неизвестная команда: /${interaction.commandName}`);
      await replyWithError(
        interaction,
        'Эта команда не загружена на боте. Перезапустите бота и попробуйте снова.',
      );
      return;
    }

    if (!interaction.inCachedGuild()) {
      await replyWithError(interaction, 'Команды работают только на сервере.');
      return;
    }

    const cooldownMs = command.cooldownMs ?? 0;
    if (cooldownMs > 0) {
      const key = `${interaction.user.id}:${command.data.name}`;
      const expiresAt = client.cooldowns.get(key) ?? 0;
      if (expiresAt > Date.now()) {
        const seconds = Math.ceil((expiresAt - Date.now()) / 1_000);
        await replyWithError(interaction, `Подождите ещё ${seconds} с.`);
        return;
      }
      client.cooldowns.set(key, Date.now() + cooldownMs);
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      if (isUnknownInteraction(error)) {
        console.warn(`[bot] взаимодействие /${command.data.name} истекло`);
        return;
      }

      console.error(`[bot] ошибка в команде /${command.data.name}:`, error);
      await replyWithError(interaction, 'Произошла ошибка при выполнении команды.');
    }
  },
} satisfies BotEvent<Events.InteractionCreate>;
