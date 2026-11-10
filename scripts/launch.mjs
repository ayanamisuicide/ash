import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Кроссплатформенная обёртка запуска: `npm run launch`.
 *
 * На Windows вся панель релиза живёт в `scripts/launch.ps1` (HUD, фазы,
 * спиннеры) — здесь мы только делегируем ему аргументы, чтобы не дублировать
 * оформление. На macOS и Linux PowerShell-панели нет, поэтому выполняется тот
 * же порядок шагов без оформления: stop → checks → build → deploy → start.
 *
 * Режимы: `--dev`, `--check` (как launch:check), `--live` (как launch:live).
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const args = process.argv.slice(2);
const mode = args.includes('--check') ? 'check' : args.includes('--live') ? 'live' : 'prod';
const dev = args.includes('--dev');

if (isWindows) {
  const psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/launch.ps1'];
  if (dev) psArgs.push('-Dev');
  if (mode === 'check') psArgs.push('-ChecksOnly', '-SkipDeploy', '-NoNewWindow', '-NoBanner');
  if (mode === 'live') psArgs.push('-StartFirst', '-NoNewWindow');

  const child = spawn('powershell', psArgs, { cwd: root, stdio: 'inherit', windowsHide: false });
  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (error) => {
    console.error('launch:', error.message);
    process.exit(1);
  });
} else {
  runPortable();
}

/** Последовательный пайплайн для платформ без PowerShell. */
function runPortable() {
  const version = readVersion();
  const npm = 'npm';

  console.log(`NEXUS · запуск ${version} · режим ${mode.toUpperCase()}${dev ? ' · DEV' : ''}`);

  run(npm, ['run', 'stop'], { optional: true });
  run(npm, ['run', 'verify:fast']);
  run(npm, ['run', 'build']);
  if (mode !== 'check') run(npm, ['run', 'deploy']);

  if (mode === 'check') {
    console.log('\nNEXUS · проверки и сборка завершены, бот не запускается.');
    return;
  }

  console.log(
    `\nNEXUS · запускаю бота и панель (${dev ? 'dev' : 'production'}) — Ctrl+C для остановки.`,
  );
  const child = spawn(npm, ['run', dev ? 'dev' : 'start'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (error) => {
    console.error('launch:', error.message);
    process.exit(1);
  });
}

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version ?? '?';
  } catch {
    return '?';
  }
}

function run(npm, npmArgs, options = {}) {
  const result = spawnSync(npm, npmArgs, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    // Windows не запускает .cmd-файлы без оболочки; там действует ветка выше.
    shell: false,
  });

  if (result.error) {
    if (options.optional) return;
    console.error('launch:', result.error.message);
    process.exit(1);
  }

  const code = result.status ?? 1;
  if (code !== 0 && !options.optional) {
    console.error(`launch: шаг «npm ${npmArgs.join(' ')}» завершился с кодом ${code}.`);
    process.exit(code);
  }
}
