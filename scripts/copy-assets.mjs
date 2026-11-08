import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'src', 'web', 'public');
const target = path.join(root, 'dist', 'web', 'public');

if (!fs.existsSync(source)) {
  console.error(`copy-assets: не найдена папка ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

console.log(`copy-assets: ${path.relative(root, source)} -> ${path.relative(root, target)}`);
