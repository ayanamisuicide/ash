import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import type { Command } from './types.js';

/**
 * Расширенный клиент: хранит загруженные команды и кулдауны.
 * В будущем здесь же появится доступ к веб-панели и кэшам.
 */
export class BotClient extends Client {
  readonly commands = new Collection<string, Command>();
  readonly cooldowns = new Collection<string, number>();

  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // привилегированный intent
        GatewayIntentBits.GuildMembers, // привилегированный intent
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.AutoModerationConfiguration,
        GatewayIntentBits.AutoModerationExecution,
      ],
      partials: [
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.User,
      ],
    });
  }
}
