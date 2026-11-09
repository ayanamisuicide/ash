import assert from 'node:assert/strict';
import test from 'node:test';
import { ConsoleUi } from '../src/lib/console-ui.js';
import { buildReport, type StartupCheck } from '../src/lib/startup.js';

function captureStream() {
  let output = '';
  return {
    stream: {
      write(chunk: string): boolean {
        output += chunk;
        return true;
      },
      isTTY: false,
    },
    read: () => output,
  };
}

function plainUi(): { ui: ConsoleUi; read: () => string } {
  const { stream, read } = captureStream();
  return { ui: new ConsoleUi({ stream, color: false, animated: false }), read };
}

const CHECKS: StartupCheck[] = [
  { group: 'Окружение', name: 'Node.js', status: 'ok', detail: 'v22.14.0' },
  { group: 'Окружение', name: 'Intents', status: 'warn', detail: 'нет: MessageContent' },
  { group: 'Сервер: Test', name: 'Права бота', status: 'ok', detail: 'все есть' },
];

test('console-ui: баннер содержит версию и платформу', async () => {
  const { ui, read } = plainUi();
  await ui.banner({ version: '2.2.0', node: 'v22.14.0', platform: 'win32/x64', pid: 42 });

  const output = read();
  assert.match(output, /Discord moderation bot/);
  assert.match(output, /v2\.2\.0/);
  assert.match(output, /Node v22\.14\.0/);
  assert.match(output, /PID 42/);
});

test('console-ui: спиннер в plain-режиме печатает только результат', () => {
  const { ui, read } = plainUi();
  const spinner = ui.spinner('Подключаюсь к Discord');
  spinner.update('ещё грузимся');
  assert.equal(read(), '');

  spinner.succeed('вошёл как bot#0001');
  const output = read();
  assert.match(output, /✅/);
  assert.match(output, /ещё грузимся/);
  assert.match(output, /вошёл как bot#0001/);
});

test('console-ui: отчёт печатает разделы, проверки и итог', async () => {
  const { ui, read } = plainUi();
  const report = buildReport(CHECKS);
  await ui.revealReport(report);

  const output = read();
  assert.match(output, /Окружение/);
  assert.match(output, /Node\.js — v22\.14\.0/);
  assert.match(output, /⚠️ Intents/);
  assert.match(output, /Сервер: Test/);
  assert.match(output, /Итог проверок:/);
  assert.match(output, /✅ 2/);
  assert.match(output, /⚠️ 1/);
  assert.match(output, /Критичных ошибок не найдено/);
});

test('console-ui: финальный блок показывает панель и команды', () => {
  const { ui, read } = plainUi();
  ui.finish({
    guilds: 3,
    commands: 76,
    panel: 'https://node.ts.net',
    local: 'http://127.0.0.1:8080',
  });

  const output = read();
  assert.match(output, /Бот готов/);
  assert.match(output, /серверов: 3/);
  assert.match(output, /команд: 76/);
  assert.match(output, /https:\/\/node\.ts\.net/);
  assert.match(output, /127\.0\.0\.1:8080/);
});
