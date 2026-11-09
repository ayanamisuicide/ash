import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * В dev бот запускается из корня проекта и берёт свежий web/dist.
 * В production сборка заранее копирует web/dist в dist/web/public.
 * WEB_PANEL_DIR позволяет указать каталог вручную.
 */
export function resolvePanelDir(): string {
  const candidates = [
    config.web.panelDir,
    path.join(process.cwd(), 'web', 'dist'),
    path.join(MODULE_DIR, '..', '..', 'web', 'dist'),
    path.join(MODULE_DIR, 'public'),
    path.join(process.cwd(), 'dist', 'web', 'public'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(path.join(resolved, 'index.html'))) return resolved;
  }

  return path.resolve(MODULE_DIR, 'public');
}
