import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { REST, Routes } from 'discord.js';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadCommands() {
  const commands = [];
  const dir = path.join(__dirname, 'commands');
  const collect = async (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await collect(full);
      } else if (entry.name.endsWith('.js')) {
        const mod = await import(pathToFileURL(full).href);
        if (mod.default?.data) {
          commands.push(mod.default.data.toJSON());
        }
      }
    }
  };
  await collect(dir);
  return commands;
}

async function main() {
  if (!config.token || !config.clientId) {
    console.error('[deploy] Заполните DISCORD_TOKEN и DISCORD_CLIENT_ID в .env');
    process.exit(1);
  }

  const commands = await loadCommands();
  console.log(`[deploy] Регистрирую ${commands.length} команд...`);

  const rest = new REST().setToken(config.token);
  try {
    const route = config.guildId
      ? Routes.applicationGuildCommands(config.clientId, config.guildId)
      : Routes.applicationCommands(config.clientId);
    const result = await rest.put(route, { body: commands });
    console.log(
      `[deploy] Готово! Зарегистрировано ${result.length} команд${config.guildId ? ' (на сервере)' : ' (глобально, может примениться до 1 часа)'}`,
    );
  } catch (error) {
    console.error('[deploy] Ошибка:', error);
  }
}

main();
