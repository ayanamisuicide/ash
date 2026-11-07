import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config.js';
import { db } from './storage/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // привилегированный intent!
    GatewayIntentBits.GuildMembers,   // привилегированный intent!
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.commands = new Collection();

// ---------- Загрузка команд ----------
async function loadCommands() {
  const dir = path.join(__dirname, 'commands');
  const walk = async (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        const mod = await import(pathToFileURL(full).href);
        if (mod.default?.data) {
          client.commands.set(mod.default.data.name, mod.default);
        }
      }
    }
  };
  await walk(dir);
  console.log(`[bot] загружено команд: ${client.commands.size}`);
}

// ---------- Загрузка событий ----------
async function loadEvents() {
  const dir = path.join(__dirname, 'events');
  const walk = async (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        const event = (await import(pathToFileURL(full).href)).default;
        if (!event?.name) continue;
        if (event.once) {
          client.once(event.name, event.execute);
        } else {
          client.on(event.name, event.execute);
        }
      }
    }
  };
  await walk(dir);
}

async function main() {
  if (!config.token) {
    console.error(
      '[bot] Токен не найден! Заполните DISCORD_TOKEN в файле .env (см. README.md)',
    );
    process.exit(1);
  }

  await loadCommands();
  await loadEvents();

  client.login(config.token);

  // Сохраняем данные при выходе
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log('[bot] сохраняю данные и выхожу...');
      db.save();
      process.exit(0);
    });
  }
}

main();
