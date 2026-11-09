import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const webPackage = path.join(webDir, 'package.json');
const webModules = path.join(webDir, 'node_modules');

// Панель — часть продукта: без неё сборка не считается успешной.
// Раньше здесь был «мягкий» пропуск, из-за которого CI оставался зелёным,
// а в production уезжала старая (legacy) панель. Теперь это ошибка.
if (!fs.existsSync(webPackage)) {
  console.error('build-panel: каталог web/ не найден — соберите панель перед сборкой бота.');
  process.exit(1);
}

if (!fs.existsSync(webModules)) {
  console.error(
    'build-panel: web/node_modules не установлены.\n' +
      'Выполните `npm --prefix web ci` (или `npm --prefix web install`) и повторите сборку.',
  );
  process.exit(1);
}

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const result = spawnSync(npm, ['run', 'build'], {
  cwd: webDir,
  stdio: 'inherit',
  env: process.env,
  // Windows не запускает .cmd-файлы через spawnSync без оболочки.
  shell: isWindows,
});

if (result.error) {
  console.error('build-panel:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
