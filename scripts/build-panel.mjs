import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const webPackage = path.join(webDir, 'package.json');
const webModules = path.join(webDir, 'node_modules');

if (!fs.existsSync(webPackage)) {
  console.log('build-panel: каталог web/ не найден — пропускаю сборку панели.');
  process.exit(0);
}

if (!fs.existsSync(webModules)) {
  console.warn(
    'build-panel: web/node_modules не установлены. ' +
      'Выполните `npm --prefix web ci`, чтобы собрать React-панель. ' +
      'Пока используется существующий web/dist или legacy-панель.',
  );
  process.exit(0);
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
