import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Создаёт или обновляет GitHub Release для тега по секции из CHANGELOG.md.
 * Запуск: npm run release:github -- 3.3.0
 */

const gh = process.platform === 'win32' ? 'gh.exe' : 'gh';
const version = (process.argv[2] ?? '').replace(/^v/, '');

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('Использование: npm run release:github -- X.Y.Z');
  process.exit(1);
}

const changelog = fs.readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const lines = changelog.split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));

if (start === -1) {
  console.error(`[release] в CHANGELOG.md нет секции ${version}`);
  process.exit(1);
}

let end = lines.findIndex((line, index) => index > start && line.startsWith('## ['));
if (end === -1) end = lines.length;

const notes = lines
  .slice(start + 1, end)
  .join('\n')
  .trim();
const tag = `v${version}`;
const title = `NEXUS ${tag}`;
const common = ['--title', title, '--notes', notes];

try {
  execFileSync(gh, ['release', 'view', tag], { stdio: 'ignore' });
  execFileSync(gh, ['release', 'edit', tag, ...common], { stdio: 'inherit' });
  console.log(`[release] обновлён ${tag}`);
} catch {
  execFileSync(gh, ['release', 'create', tag, ...common, '--verify-tag'], { stdio: 'inherit' });
  console.log(`[release] создан ${tag}`);
}
