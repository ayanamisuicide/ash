import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Фоновые проверки для `npm run launch:live`.
 *
 * Запускает те же шаги, что и CI, но без сборки (сборка удаляет dist и
 * ломает работающую панель). Результат пишется в data/verify-result.json,
 * полный вывод — в data/verify.log; прогресс дублируется в stdout, чтобы
 * launch.ps1 мог показать его в HUD.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const logPath = path.join(dataDir, 'verify.log');
const resultPath = path.join(dataDir, 'verify-result.json');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const steps = [
  { name: 'typecheck', label: 'TypeScript · бот и тесты', args: ['run', 'typecheck'] },
  {
    name: 'panel-typecheck',
    label: 'TypeScript · панель',
    args: ['--prefix', 'web', 'run', 'typecheck'],
  },
  { name: 'lint', label: 'ESLint', args: ['run', 'lint'] },
  { name: 'format', label: 'Prettier', args: ['run', 'format:check'] },
  { name: 'bot-tests', label: 'Тесты бота', args: ['run', 'test:coverage'] },
  { name: 'panel-tests', label: 'Тесты панели', args: ['run', 'test:panel:coverage'] },
];

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(logPath, '', 'utf8');

const logFd = fs.openSync(logPath, 'a');
const startedAt = new Date().toISOString();
const results = [];
let failedStep = null;

function log(message) {
  fs.writeSync(logFd, `${message}\n`);
}

function progress(message) {
  process.stdout.write(`[verify] ${message}\n`);
  log(`[verify] ${message}`);
}

log(`[verify] старт ${startedAt}`);
progress('старт проверок');

for (const step of steps) {
  progress(`${step.label} · запуск`);
  const stepStarted = Date.now();

  const result = spawnSync(npm, step.args, {
    cwd: root,
    env: process.env,
    shell: isWindows,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    timeout: 10 * 60 * 1000,
  });

  const durationMs = Date.now() - stepStarted;
  const code = result.status ?? 1;
  const ok = code === 0;

  results.push({ name: step.name, label: step.label, ok, exitCode: code, durationMs });
  log(
    `[verify] ${step.name} ${ok ? 'ok' : 'failed'} (${(durationMs / 1000).toFixed(1)}s, exit=${code})`,
  );

  if (result.error) {
    log(`[verify] ${step.name} error: ${result.error.message}`);
  }

  if (!ok) {
    failedStep = step;
    progress(`${step.label} · ошибка (exit ${code})`);
    break;
  }

  progress(`${step.label} · ok (${(durationMs / 1000).toFixed(1)}s)`);
}

const summary = {
  ok: failedStep === null,
  failedStep: failedStep ? failedStep.name : null,
  failedLabel: failedStep ? failedStep.label : null,
  startedAt,
  finishedAt: new Date().toISOString(),
  log: path.relative(root, logPath),
  steps: results,
};

fs.writeFileSync(resultPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

if (summary.ok) {
  progress('все проверки пройдены');
} else {
  progress(`проверки упали на шаге «${summary.failedLabel}» · ${path.relative(root, logPath)}`);
}

fs.closeSync(logFd);
process.exit(summary.ok ? 0 : 1);
