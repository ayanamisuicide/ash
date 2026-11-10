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
  await ui.banner({
    version: '2.2.0',
    node: 'v22.14.0',
    platform: 'win32/x64',
    pid: 42,
    mode: 'dev',
  });

  const output = read();
  assert.match(output, /◈ NEXUS/);
  assert.match(output, /\/ {2}runtime/);
  assert.match(output, /v2\.2\.0/);
  assert.match(output, /DEV/);
  assert.match(output, /tsx watch/);
  assert.match(output, /Node v22\.14\.0/);
  assert.match(output, /PID 42/);
});

test('console-ui: этап печатает номер, фазу и время', () => {
  const { ui, read } = plainUi();
  ui.stage('ok', 'CONFIG', 'Конфигурация проверена', 'веб-панель https://node.ts.net', 1_200);

  const output = read();
  assert.match(output, /✔ {2}01 {2}CONFIG/);
  assert.match(output, /Конфигурация проверена — веб-панель https:\/\/node\.ts\.net/);
  assert.match(output, /1\.2s/);
});

test('console-ui: спиннер в plain-режиме печатает только результат', () => {
  const { ui, read } = plainUi();
  const spinner = ui.spinner('Подключаюсь к Discord', 'DISCORD');
  spinner.update('ещё грузимся');
  assert.equal(read(), '');

  spinner.succeed('вошёл как bot#0001');
  const output = read();
  assert.match(output, /✔ {2}01 {2}DISCORD/);
  assert.match(output, /ещё грузимся/);
  assert.match(output, /вошёл как bot#0001/);
});

test('console-ui: отчёт печатает разделы, проверки и итог', async () => {
  const { ui, read } = plainUi();
  const report = buildReport(CHECKS);
  await ui.revealReport(report);

  const output = read();
  assert.match(output, /── RUNTIME/);
  assert.match(output, /CORE/);
  assert.match(output, /Node\.js\s+— v22\.14\.0/);
  assert.match(output, /⚠ Intents/);
  assert.match(output, /SERVER · Test/);
  assert.match(output, /Итог проверок:/);
  assert.match(output, /✔ 2/);
  assert.match(output, /⚠ 1/);
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
  assert.match(output, /── READY/);
  assert.match(output, /Бот готов/);
  assert.match(output, /серверов: 3/);
  assert.match(output, /команд: 76/);
  assert.match(output, /Веб-панель: https:\/\/node\.ts\.net/);
  assert.match(output, /127\.0\.0\.1:8080/);
});

test('console-ui: production-режим без явной версии', async () => {
  const { ui, read } = plainUi();
  await ui.banner({ node: 'v22.14.0', platform: 'linux/x64', pid: 7, mode: 'production' });

  const output = read();
  assert.match(output, /PRODUCTION/);
  assert.match(output, /node dist/);
  assert.match(output, /v\d+\.\d+\.\d+/);
});

test('console-ui: режим определяется автоматически', async () => {
  const { ui, read } = plainUi();
  await ui.banner();

  assert.match(read(), /(DEV|PRODUCTION)/);
});

test('console-ui: строки статусов и этап без деталей', () => {
  const { ui, read } = plainUi();
  ui.ok('готово');
  ui.info('к сведению', 'детали');
  ui.warn('предупреждение');
  ui.error('ошибка', 'детали');
  ui.stage('warn', 'NET', 'Serve');

  const output = read();
  assert.match(output, /✔ {2}готово/);
  assert.match(output, /ℹ {2}к сведению — детали/);
  assert.match(output, /⚠ {2}предупреждение/);
  assert.match(output, /✖ {2}ошибка — детали/);
  assert.match(output, /⚠ {2}01 {2}NET/);
});

test('console-ui: спиннер с фазой и без фазы сообщает об ошибке', () => {
  const { ui, read } = plainUi();
  ui.spinner('Панель', 'PANEL').fail('порт занят');
  ui.spinner('Discord').fail('нет токена');

  const output = read();
  assert.match(output, /✖ {2}01 {2}PANEL/);
  assert.match(output, /Панель — порт занят/);
  assert.match(output, /✖ {2}Discord — нет токена/);
});

test('console-ui: отчёт с ошибками и неизвестной группой', async () => {
  const { ui, read } = plainUi();
  const report = buildReport([
    { group: 'Прочее', name: 'Проверка', status: 'error', detail: '' },
    {
      group: 'Сервер: Test',
      name: 'Очень длинное имя проверки для отчёта',
      status: 'info',
      detail: 'детали',
    },
  ]);
  await ui.revealReport(report);

  const output = read();
  assert.match(output, /ПРОЧЕЕ/);
  assert.match(output, /✖ Проверка/);
  assert.match(output, /Есть ошибки/);
  assert.match(output, /SERVER · Test/);
});

test('console-ui: финальный блок без панели', () => {
  const { ui, read } = plainUi();
  ui.finish({ guilds: 1, commands: 5, panel: null });

  const output = read();
  assert.match(output, /1 сервер/);
  assert.doesNotMatch(output, /Веб-панель:/);
  assert.doesNotMatch(output, /Локально:/);
});

test('console-ui: анимированный режим рисует спиннер и отчёт', async () => {
  const { stream, read } = captureStream();
  const ui = new ConsoleUi({ stream, color: false, animated: true });
  const spinner = ui.spinner('Загрузка', 'RUN');
  spinner.update('ещё грузимся');
  spinner.stop();
  await ui.banner({ version: '1.0.0' });
  await ui.revealReport(buildReport(CHECKS));

  const output = read();
  assert.match(output, /⠋/);
  assert.ok(output.includes('\x1b[?25l'));
  assert.match(output, /CORE/);
});

test('console-ui: цветной режим добавляет ANSI-последовательности', async () => {
  const { stream, read } = captureStream();
  const ui = new ConsoleUi({ stream, color: true, animated: false });
  await ui.banner({ version: '1.0.0' });
  ui.ok('готово', 'детали');
  ui.finish({ guilds: 1, commands: 2, panel: 'https://node.ts.net' });

  const output = read();
  assert.ok(output.includes('\x1b[38;2;'));
  assert.ok(output.includes('\x1b[1m'));
});

test('console-ui: автоопределение цвета и анимации', () => {
  const { stream } = captureStream();
  const keys = ['CI', 'UI_ANIMATION', 'FORCE_COLOR', 'NO_COLOR', 'TERM'] as const;
  const saved = new Map(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.CI = '1';
    delete process.env.UI_ANIMATION;
    assert.equal(new ConsoleUi({ stream }).animated, false);

    process.env.UI_ANIMATION = 'true';
    assert.equal(new ConsoleUi({ stream }).animated, true);
    process.env.UI_ANIMATION = 'false';
    assert.equal(new ConsoleUi({ stream }).animated, false);

    process.env.FORCE_COLOR = '1';
    assert.equal(new ConsoleUi({ stream }).color, true);
    process.env.FORCE_COLOR = '0';
    assert.equal(new ConsoleUi({ stream }).color, false);
    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = '1';
    assert.equal(new ConsoleUi({ stream }).color, false);
    delete process.env.NO_COLOR;
    process.env.TERM = 'dumb';
    assert.equal(new ConsoleUi({ stream }).color, false);
  } finally {
    for (const key of keys) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
