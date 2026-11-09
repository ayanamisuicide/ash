import { ActivityType, Events } from 'discord.js';
import type { BotEvent } from '../core/types.js';

export default {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    client.user.setActivity('/menu', { type: ActivityType.Listening });
  },
} satisfies BotEvent<Events.ClientReady>;
