import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDir = path.join(root, 'web');
const webPackage = path.join(webDir, 'package.json');
const webModules = path.join(webDir, 'node_modules');
const panelDist = path.join(webDir, 'dist');
const panelEntry = path.join(panelDist, 'index.html');
const hashMarker = path.join(panelDist, '.panel-hash');

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

const force = process.argv.includes('--force') || process.env.PANEL_FORCE === '1';

/** Файлы панели, влияющие на результат сборки (кроме node_modules и dist). */
function collectSources(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, files);
    } else {
      files.push(full);
    }
  }
  return files;
}

/** Хеш содержимого web/ — дешёвая замена «сборка не изменилась». */
function panelHash() {
  const hash = crypto.createHash('sha256');
  for (const file of collectSources(webDir).sort()) {
    hash.update(path.relative(webDir, file));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

// Панель пересобирается ~11 с (tsc + vite). Если исходники и зависимости те же,
// результат будет байт-в-байт тем же, поэтому сборку можно пропустить.
// Принудительно: `npm run build:panel -- --force` или PANEL_FORCE=1.
if (!force && fs.existsSync(panelEntry) && fs.existsSync(hashMarker)) {
  const previous = fs.readFileSync(hashMarker, 'utf8').trim();
  const current = panelHash();
  if (previous === current) {
    console.log('build-panel: исходники панели не изменились — сборка пропущена (~11 с экономии).');
    process.exit(0);
  }
}

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

if ((result.status ?? 1) === 0) {
  fs.writeFileSync(hashMarker, `${panelHash()}\n`, 'utf8');
}

process.exit(result.status ?? 1);
