import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const legacy = path.join(root, 'src', 'web', 'public');
const reactPanel = path.join(root, 'web', 'dist');
const source = fs.existsSync(path.join(reactPanel, 'index.html')) ? reactPanel : legacy;
const target = path.join(root, 'dist', 'web', 'public');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error(`copy-assets: не найден index.html в ${source}`);
  process.exit(1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.cpSync(source, target, { recursive: true });

console.log(`copy-assets: ${path.relative(root, source)} -> ${path.relative(root, target)}`);
