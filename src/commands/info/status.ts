import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';
import { v2Flags } from '../../lib/card.js';
import { buildEmbed, formatEmbedDate } from '../../lib/embeds.js';
import { humanDuration } from '../../lib/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Состояние бота: аптайм, пинг и количество серверов'),

  async execute(interaction) {
    const client = interaction.client;
    const uptime = client.uptime ?? 0;
    const memoryMb = process.memoryUsage().heapUsed / 1024 / 1024;

    await interaction.reply({
      components: [
        buildEmbed({
          tone: 'accent',
          title: 'Статус ProBot',
          emoji: '🔷',
          description: '🟢 Бот онлайн и готов к работе.',
          fields: [
            { label: 'Статус', value: '🟢 Онлайн', block: false },
            { label: 'Аптайм', value: humanDuration(uptime), block: false },
            { label: 'Пинг', value: `${Math.round(client.ws.ping)} мс`, block: false },
            { label: 'Серверов', value: String(client.guilds.cache.size), block: false },
            { label: 'Память', value: `${memoryMb.toFixed(1)} МБ`, block: false },
          ],
          footer: `🔖 ${formatEmbedDate()}`,
          timestamp: false,
        }),
      ],
      flags: v2Flags(true),
    });
  },
} satisfies Command;
