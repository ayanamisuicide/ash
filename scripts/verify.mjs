import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Проверки проекта: типы бота и тестов, типы панели, ESLint, Prettier,
 * тесты бота и панели.
 *
 * Шаги независимы (не пишут в общие файлы), поэтому идут параллельно:
 * последовательно это ~45 с, параллельно ~10–12 с. Этот прогон вызывают
 * `npm run ci`, `npm run launch` и `npm run launch:live`.
 *
 * Режимы:
 *   node scripts/verify.mjs           — как в CI: тесты с порогами покрытия;
 *   node scripts/verify.mjs --fast    — тесты без покрытия (быстрый лаунчер);
 *   node scripts/verify.mjs --serial  — по одному шагу (отладка);
 *   node scripts/verify.mjs --jobs=2  — ограничить число параллельных шагов.
 *
 * Результат пишется в data/verify-result.json (поле durationMs — реальное время
 * прогона, шаги содержат собственные длительности), полный вывод — в
 * data/verify.log; прогресс дублируется в stdout, чтобы launch.ps1 мог показать
 * его в HUD. В итоговой строке — только реальное время: сумма длительностей
 * параллельных шагов к нему отношения не имеет.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const logPath = path.join(dataDir, 'verify.log');
const resultPath = path.join(dataDir, 'verify-result.json');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_BYTES = 256 * 1024;
// ESC собираем из кода символа: литеральный \x1b в регулярке запрещён линтером.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const argv = process.argv.slice(2);
const fast = argv.includes('--fast');
const serial = argv.includes('--serial');
const jobsArg = argv.find((arg) => arg.startsWith('--jobs='));
const requestedJobs = jobsArg ? Number.parseInt(jobsArg.slice('--jobs='.length), 10) : Number.NaN;
const cpus = os.availableParallelism?.() ?? os.cpus().length ?? 4;
const jobs = serial
  ? 1
  : Math.max(1, Math.min(Number.isFinite(requestedJobs) ? requestedJobs : 6, cpus));

const steps = [
  { name: 'typecheck', label: 'TypeScript · бот и тесты', args: ['run', 'typecheck'] },
  {
    name: 'panel-typecheck',
    label: 'TypeScript · панель',
    args: ['--prefix', 'web', 'run', 'typecheck'],
  },
  { name: 'lint', label: 'ESLint', args: ['run', 'lint'] },
  { name: 'format', label: 'Prettier', args: ['run', 'format:check'] },
  { name: 'bot-tests', label: 'Тесты бота', args: ['run', fast ? 'test' : 'test:coverage'] },
  {
    name: 'panel-tests',
    label: 'Тесты панели',
    args: ['run', fast ? 'test:panel' : 'test:panel:coverage'],
  },
];

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(logPath, '', 'utf8');

const startedAt = new Date().toISOString();
const runStartedMs = Date.now();
const results = new Array(steps.length).fill(null);

function log(message) {
  fs.appendFileSync(logPath, `${message}\n`, 'utf8');
}

function progress(message) {
  process.stdout.write(`[verify] ${message}\n`);
  log(`[verify] ${message}`);
}

/** Дочерние процессы npm на Windows живут в дереве — гасим всё дерево. */
function killTree(pid) {
  if (!pid) return;
  if (isWindows) {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Процесс уже завершился — это нормально.
    }
  }
}

/** Кавычки для аргументов: Node 24 предупреждает (DEP0190), если shell=true и args массив. */
function quoteArg(arg) {
  return /^[\w.:@/=-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

function runStep(step) {
  return new Promise((resolve) => {
    const startedMs = Date.now();
    const command = [npm, ...step.args].map(quoteArg).join(' ');
    const child = spawn(command, {
      cwd: root,
      env: process.env,
      shell: true,
      windowsHide: true,
      detached: !isWindows,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    let captured = 0;
    let timedOut = false;
    let settled = false;

    const collect = (chunk) => {
      if (captured >= MAX_OUTPUT_BYTES) return;
      const text = chunk.toString('utf8');
      const room = MAX_OUTPUT_BYTES - captured;
      const slice = text.length > room ? text.slice(0, room) : text;
      output += slice;
      captured += slice.length;
      if (captured >= MAX_OUTPUT_BYTES) {
        output += '\n[verify] вывод обрезан: превышен лимит 256 КБ\n';
      }
    };

    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: typeof code === 'number' && !timedOut ? code : 1,
        timedOut,
        output: output.replace(ANSI, ''),
        durationMs: Date.now() - startedMs,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
      // Если процесс не умер сам, не ждём его бесконечно.
      setTimeout(() => finish(1), 5000).unref();
    }, TIMEOUT_MS);

    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (error) => {
      output += `\n[verify] не удалось запустить npm: ${error.message}\n`;
      finish(1);
    });
    child.on('close', (code) => finish(code));
  });
}

async function runStepWithReport(index) {
  const step = steps[index];
  progress(`${step.label} · запуск`);
  log(`\n[verify] ── ${step.name} · ${step.label} · старт ${new Date().toISOString()}`);

  const outcome = await runStep(step);
  const ok = !outcome.timedOut && outcome.code === 0;
  const seconds = (outcome.durationMs / 1000).toFixed(1);

  if (outcome.output.trim()) {
    log(outcome.output.replace(/\r\n/g, '\n').trimEnd());
  }
  log(`[verify] ── ${step.name} ${ok ? 'ok' : 'failed'} (${seconds}s, exit=${outcome.code})`);

  results[index] = {
    name: step.name,
    label: step.label,
    ok,
    exitCode: outcome.code,
    durationMs: outcome.durationMs,
    timedOut: outcome.timedOut,
  };

  if (ok) {
    progress(`${step.label} · ok (${seconds}s)`);
  } else if (outcome.timedOut) {
    progress(`${step.label} · таймаут (${seconds}s) → ${path.relative(root, logPath)}`);
  } else {
    progress(`${step.label} · ошибка (exit ${outcome.code}) → ${path.relative(root, logPath)}`);
  }
}

log(`[verify] старт ${startedAt}`);
progress(
  `старт проверок · режим ${fast ? 'fast' : 'coverage'}, шагов ${steps.length}, параллельно ${jobs}`,
);

let next = 0;
async function worker() {
  while (next < steps.length) {
    const index = next++;
    await runStepWithReport(index);
  }
}

await Promise.all(Array.from({ length: Math.min(jobs, steps.length) }, () => worker()));

const failed = results.filter((item) => item && !item.ok);
const failedStep = failed[0] ?? null;
const durationMs = Date.now() - runStartedMs;
const summary = {
  ok: failedStep === null,
  failedStep: failedStep ? failedStep.name : null,
  failedLabel: failedStep ? failedStep.label : null,
  startedAt,
  finishedAt: new Date().toISOString(),
  durationMs,
  log: path.relative(root, logPath),
  mode: fast ? 'fast' : 'coverage',
  steps: results,
};

fs.writeFileSync(resultPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

// В итог идёт только реальное время прогона. Сумма длительностей шагов для
// параллельного запуска бессмысленна: она вдвое-втрое больше того, что видит
// человек в терминале. Разбивка по шагам есть выше и в data/verify-result.json.
const wallSeconds = (durationMs / 1000).toFixed(1);

if (summary.ok) {
  progress(`все проверки пройдены за ${wallSeconds}s`);
} else {
  progress(
    `проверки упали за ${wallSeconds}s: ${failed.map((item) => item.label).join(', ')} · ${path.relative(root, logPath)}`,
  );
}

process.exit(summary.ok ? 0 : 1);
