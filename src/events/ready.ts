import { ActivityType, Events } from 'discord.js';
import type { BotClient } from '../core/client.js';
import type { BotEvent } from '../core/types.js';
import { startScheduler } from '../lib/scheduler.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    const bot = client as BotClient;
    console.log(
      `[bot] вошёл как ${client.user.tag} | серверов: ${client.guilds.cache.size} | команд: ${bot.commands.size}`,
    );
    client.user.setActivity('/menu', { type: ActivityType.Listening });
    startScheduler(bot);
  },
} satisfies BotEvent<Events.ClientReady>;
