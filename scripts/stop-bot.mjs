import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Останавливает предыдущий экземпляр бота этого проекта перед новым запуском.
 * Запускается автоматически через `predev` / `prestart`.
 * Убивает только процессы, чья командная строка указывает на этот проект.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootLower = root.toLowerCase();
const isWindows = process.platform === 'win32';

function readWebPort() {
  try {
    const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
    const match = /^\s*WEB_PORT\s*=\s*(\d+)\s*$/m.exec(env);
    return match ? Number(match[1]) : 3000;
  } catch {
    return 3000;
  }
}

function listProcesses() {
  if (isWindows) {
    const raw = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((item) => ({
      pid: Number(item.ProcessId),
      ppid: Number(item.ParentProcessId),
      name: String(item.Name ?? ''),
      command: String(item.CommandLine ?? ''),
    }));
  }

  const raw = execFileSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8' });
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        name: match[3] ?? '',
        command: match[4] ?? '',
      };
    })
    .filter((item) => item !== null);
}

function collectAncestors(processes, startPid) {
  const byPid = new Map(processes.map((item) => [item.pid, item]));
  const ancestors = new Set();
  let current = byPid.get(startPid);
  while (current) {
    ancestors.add(current.pid);
    current = byPid.get(current.ppid);
  }
  return ancestors;
}

function isOurInstance(item) {
  const command = item.command.toLowerCase();
  if (!command.includes(rootLower)) return false;
  if (!item.name.toLowerCase().includes('node')) return false;
  return (
    command.includes('src/index.ts') ||
    command.includes('src\\index.ts') ||
    command.includes('dist/index.js') ||
    command.includes('dist\\index.js') ||
    command.includes('tsx') ||
    command.includes('cross-env')
  );
}

function isSupervisor(item) {
  const command = item.command.toLowerCase();
  return command.includes('tsx') || command.includes('cross-env');
}

async function portBusy(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

function portOwner(port) {
  if (isWindows) {
    try {
      const raw = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess`,
        ],
        { encoding: 'utf8', windowsHide: true },
      ).trim();
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  }

  try {
    const raw = execFileSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    const first = raw.trim().split('\n')[0];
    return first ? Number(first) : null;
  } catch {
    return null;
  }
}

const port = readWebPort();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let killed = 0;

// Несколько проходов: супервизор мог успеть перезапустить ребёнка,
// а осиротевший процесс — остаться на порту.
for (let round = 0; round < 4; round += 1) {
  const processes = listProcesses();
  const ancestors = collectAncestors(processes, process.pid);
  const byPid = new Map(processes.map((item) => [item.pid, item]));

  const targets = processes.filter(
    (item) => item.pid !== process.pid && !ancestors.has(item.pid) && isOurInstance(item),
  );

  // Добиваем владельца порта, если это тоже наш процесс (осиротевший бот)
  const ownerPid = await portBusy(port).then((busy) => (busy ? portOwner(port) : null));
  if (ownerPid && ownerPid !== process.pid && !ancestors.has(ownerPid)) {
    const owner = byPid.get(ownerPid);
    if (owner && isOurInstance(owner) && !targets.some((item) => item.pid === owner.pid)) {
      targets.push(owner);
    }
  }

  if (targets.length === 0) break;

  // Сначала супервизоры, иначе они поднимут процесс заново
  targets.sort((a, b) => Number(isSupervisor(b)) - Number(isSupervisor(a)));

  for (const target of targets) {
    const role = isSupervisor(target) ? 'супервизор' : 'бот';
    try {
      process.kill(target.pid);
      killed += 1;
      console.log(`[predev] остановлен ${role}: PID ${target.pid}`);
    } catch (error) {
      console.log(`[predev] не удалось остановить PID ${target.pid}: ${error.message}`);
    }
  }

  // Даём ОС освободить сокет и завершиться дочерним процессам
  await sleep(700);
}

if (killed === 0) {
  console.log('[predev] прошлых экземпляров бота не найдено');
} else {
  await sleep(400);
}

if (await portBusy(port)) {
  const owner = portOwner(port);
  console.log(
    `[predev] порт ${port} всё ещё занят${owner ? ` процессом PID ${owner}` : ''}` +
      ' — это не экземпляр бота, укажите другой WEB_PORT',
  );
}
