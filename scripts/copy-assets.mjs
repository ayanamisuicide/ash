import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'web', 'dist');
const target = path.join(root, 'dist', 'web', 'public');

// Легаси-панели (src/web/public) больше нет: единственный источник —
// собранный React-панель. Если её нет, падать громко, а не копировать старое.
if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(
    `copy-assets: не найден index.html в ${path.relative(root, source)}.\n` +
      'Выполните `npm --prefix web ci` и `npm run build:panel`.',
  );
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

console.log(`copy-assets: ${path.relative(root, source)} -> ${path.relative(root, target)}`);
