import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Простой парсер .env: KEY=VALUE, без кавычек и подстановок */
function readEnv() {
  const file = path.join(root, '.env');
  const env = {};
  if (!fs.existsSync(file)) return env;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...readEnv(), ...process.env };
const port = Number(env.WEB_PORT ?? 3000) || 3000;
const publicUrl = (env.WEB_PUBLIC_URL ?? '').replace(/\/+$/, '');
const mode = process.argv[2] ?? 'status';

function tailscale(args, inherit = false) {
  return execFileSync('tailscale', args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  });
}

function readJson(args) {
  return JSON.parse(tailscale(args));
}

function fail(message) {
  console.error(`tunnel: ${message}`);
  process.exit(1);
}

let status;
try {
  status = readJson(['status', '--json']);
} catch {
  fail('Tailscale не найден. Установите его или добавьте tailscale в PATH.');
}

if (status.BackendState !== 'Running') {
  fail(`Tailscale не запущен (BackendState=${status.BackendState ?? 'unknown'}).`);
}

const dnsName = String(status.Self?.DNSName ?? '').replace(/\.$/, '');
if (!dnsName) fail('У узла нет DNS-имени — включите MagicDNS в админке Tailscale.');

const url = `https://${dnsName}`;

function printServe() {
  const config = readJson(['serve', 'status', '--json']);
  const web = config.Web ?? {};
  const funnel = config.AllowFunnel ?? {};
  const entries = [];

  for (const [host, value] of Object.entries(web)) {
    for (const [route, handler] of Object.entries(value.Handlers ?? {})) {
      if (!handler?.Proxy) continue;
      entries.push({
        host,
        route,
        target: handler.Proxy,
        funnel: funnel[host] === true,
      });
    }
  }

  if (!entries.length) {
    console.log('  serve: правил нет — панель никуда не проксируется.');
    return false;
  }

  for (const entry of entries) {
    const visibility = entry.funnel ? 'Funnel: доступно из интернета' : 'только tailnet';
    console.log(`  serve: https://${entry.host}${entry.route} → ${entry.target} (${visibility})`);
  }

  const root = entries.find((entry) => entry.route === '/' && entry.host.startsWith(`${dnsName}:`));
  if (!root) {
    console.log(`  ⚠️ нет правила для ${dnsName}:443 /`);
    return false;
  }

  const targetPort = Number(new URL(root.target).port || 80);
  if (targetPort !== port) {
    console.log(`  ⚠️ serve проксирует :${targetPort}, а панель слушает :${port} (WEB_PORT).`);
    return false;
  }

  if (publicUrl && !publicUrl.endsWith(dnsName)) {
    console.log(`  ⚠️ WEB_PUBLIC_URL=${publicUrl}, а узел называется ${url}.`);
    return false;
  }

  return true;
}

const panelCandidates = [path.join(root, 'web', 'dist'), path.join(root, 'dist', 'web', 'public')];
const panelDir = panelCandidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
const hasReactPanel = panelDir ? fs.existsSync(path.join(panelDir, 'assets')) : false;
const panelLabel = panelDir ? path.relative(root, panelDir) : 'сборка не найдена';

console.log('');
console.log('  Tailscale');
console.log(`  Узел:  ${dnsName}`);
console.log(`  Адрес: ${url}`);
console.log(`  Панель: 127.0.0.1:${port}${publicUrl ? ` · публично: ${publicUrl}` : ''}`);
console.log(`  Статика: ${panelLabel}${hasReactPanel ? '' : ' (legacy или не собрана)'}`);
if (!hasReactPanel) {
  console.log('  ⚠️ React-сборка не найдена — выполните `npm run build`.');
}
const ok = printServe();

if (mode === '--apply') {
  tailscale(['serve', '--bg', String(port)], true);
  console.log('  ✔ serve настроен: только tailnet');
  printServe();
} else if (mode === '--funnel') {
  tailscale(['funnel', '--bg', String(port)], true);
  console.log('  ✔ Funnel настроен: панель доступна из интернета');
  printServe();
} else if (mode === '--status') {
  // только показать состояние
} else if (mode !== 'status') {
  console.log('');
  console.log('  Использование:');
  console.log('    npm run tunnel              — состояние и адрес');
  console.log('    npm run tunnel -- --apply   — serve: доступно только в tailnet');
  console.log('    npm run tunnel -- --funnel  — Funnel: доступно из интернета');
  process.exit(1);
}

console.log('');
if (mode === 'status') {
  if (!ok) {
    console.log('  Чтобы привязать панель: npm run tunnel -- --apply');
  }
  console.log('  Redirect в Developer Portal:');
  console.log(`    ${url}/auth/callback`);
  if (publicUrl && publicUrl !== url) {
    console.log(`    ${publicUrl}/auth/callback`);
  }
  console.log('');
}
