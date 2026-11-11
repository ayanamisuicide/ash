import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Регистрация слэш-команд с кэшем: `npm run deploy`.
 *
 * Discord принимает PUT с полным списком команд, поэтому повторная регистрация
 * тех же команд бессмысленна. Маркер `data/deploy-state.json` хранит хеш тела
 * регистрации (содержимое `src/commands/**` и `src/core/loader.ts`), `clientId` и
 * область (`guild:<id>` или `global`). Если всё совпало — сеть не трогаем.
 *
 * Принудительно: `npm run deploy -- --force` или DEPLOY_FORCE=1.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const commandsDir = path.join(root, 'src', 'commands');
const loaderFile = path.join(root, 'src', 'core', 'loader.ts');
const dataDir = path.join(root, 'data');
const statePath = path.join(dataDir, 'deploy-state.json');
const envPath = path.join(root, '.env');

const force = process.argv.includes('--force') || process.env.DEPLOY_FORCE === '1';

/** Мини-парсер .env: нужны только clientId и guildId, остальное читает dotenv. */
function readEnvFile(file) {
  const values = {};
  if (!fs.existsSync(file)) return values;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([\w.-]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

const fileEnv = readEnvFile(envPath);
const clientId = process.env.DISCORD_CLIENT_ID || fileEnv.DISCORD_CLIENT_ID || '';
const guildId = process.env.DISCORD_GUILD_ID || fileEnv.DISCORD_GUILD_ID || '';
const scope = guildId ? `guild:${guildId}` : 'global';

function collectSources(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectSources(full, files);
    else files.push(full);
  }
  return files;
}

/** Тело регистрации: то, что `loadCommands()` отправляет в Discord. */
function registrationHash() {
  const hash = crypto.createHash('sha256');
  const sources = [loaderFile, ...collectSources(commandsDir)].filter((file) =>
    fs.existsSync(file),
  );

  for (const file of sources.sort()) {
    hash.update(path.relative(root, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const current = { hash: registrationHash(), clientId, scope };

if (!force && fs.existsSync(statePath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (
      previous.hash === current.hash &&
      previous.clientId === current.clientId &&
      previous.scope === current.scope
    ) {
      console.log('deploy: команды не изменились — регистрация пропущена (~2 с экономии).');
      console.log('deploy: принудительно — `npm run deploy -- --force` или DEPLOY_FORCE=1.');
      process.exit(0);
    }
  } catch {
    // Битый маркер не повод падать: просто регистрируем команды заново.
  }
}

const ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_500, 3_000];
const strict = process.env.DEPLOY_STRICT === '1';

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runDeploy() {
  return spawnSync(process.execPath, ['--import=tsx', path.join('src', 'deploy-commands.ts')], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS ?? '--disable-warning=ExperimentalWarning',
    },
  });
}

let result = null;
let transientFailure = false;

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  if (attempt > 1) {
    console.log(`deploy: повторная попытка ${attempt}/${ATTEMPTS}…`);
    sleepSync(RETRY_DELAYS_MS[Math.min(attempt - 2, RETRY_DELAYS_MS.length - 1)]);
  }

  result = runDeploy();
  if (result.error) {
    console.error('deploy:', result.error);
    process.exit(1);
  }

  const code = result.status ?? 1;
  if (code === 0) break;
  // 2 — временная сетевая ошибка: повторяем, но не валим весь запуск.
  if (code !== 2) process.exit(code);
  transientFailure = true;
  if (attempt === ATTEMPTS) {
    if (strict) {
      console.error(`deploy: Discord недоступен после ${ATTEMPTS} попыток (DEPLOY_STRICT=1).`);
      process.exit(2);
    }
    console.warn('deploy: ⚠ Discord недоступен — команды не обновлены, запуск продолжается.');
    console.warn('deploy: повторите `npm run deploy`, когда сеть восстановится.');
    process.exit(0);
  }
}

if (transientFailure && result?.status !== 0) process.exit(result?.status ?? 1);

if ((result?.status ?? 1) === 0) {
  fs.mkdirSync(dataDir, { recursive: true });
  const state = { ...current, registeredAt: new Date().toISOString() };
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

process.exit(result?.status ?? 0);
