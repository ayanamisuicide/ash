import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { AnyBotEvent, Command } from './types.js';

/** Папка `src` при запуске через tsx и `dist` после сборки */
const SRC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

async function walk(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (isModule(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function isModule(name: string): boolean {
  if (name.endsWith('.d.ts')) return false;
  return name.endsWith('.ts') || name.endsWith('.js');
}

async function importDefault<T>(file: string): Promise<T | undefined> {
  const mod = (await import(pathToFileURL(file).href)) as { default?: T };
  return mod.default;
}

/** Рекурсивно загружает все команды из src/commands */
export async function loadCommands(): Promise<Command[]> {
  const dir = path.join(SRC_DIR, 'commands');
  const files = await walk(dir);
  const commands: Command[] = [];

  for (const file of files) {
    const command = await importDefault<Command>(file);
    if (!command?.data?.name) {
      console.warn(`[loader] пропущен файл без команды: ${path.relative(SRC_DIR, file)}`);
      continue;
    }
    commands.push(command);
  }
  return commands;
}

/**
 * Рекурсивно загружает все события из src/events.
 * Файл может экспортировать одно событие или массив событий.
 */
export async function loadEvents(): Promise<AnyBotEvent[]> {
  const dir = path.join(SRC_DIR, 'events');
  const files = await walk(dir);
  const events: AnyBotEvent[] = [];

  for (const file of files) {
    const loaded = await importDefault<AnyBotEvent | AnyBotEvent[]>(file);
    if (!loaded) continue;

    const list = Array.isArray(loaded) ? loaded : [loaded];
    for (const event of list) {
      if (!event?.name) {
        console.warn(`[loader] пропущено событие без имени: ${path.relative(SRC_DIR, file)}`);
        continue;
      }
      events.push(event);
    }
  }
  return events;
}
