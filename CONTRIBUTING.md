# Участие в разработке

## Требования

- Node.js **22.13+** для бота (нужен встроенный `node:sqlite`); тесты панели
  требуют Node **24.15+** (jsdom 31), на нём же работает CI.
- npm 10+.

## Первая настройка

```bash
npm install
npm --prefix web ci     # зависимости React-панели, нужны для сборки
cp .env.example .env    # DISCORD_TOKEN, DISCORD_CLIENT_ID
```

Для запуска панели в dev-режиме дополнительно нужен `DISCORD_CLIENT_SECRET`;
для обычной работы бота достаточно токена.

## Перед коммитом

```bash
npm run verify       # типы, ESLint, Prettier и тесты с покрытием (параллельно)
npm run format       # автоформат Prettier, если проверка ругнулась
npm run build        # строгая сборка: tsc + panel + copy-assets
```

Всё вместе — `npm run ci` (то же, что прогоняет GitHub Actions). Pre-commit hook
`.githooks/pre-commit` запускает `npm run verify:fast` — те же шаги без порогов
покрытия, ~9 с. Actions проверяет push в `main`, pull request и теги `v*`:
ветка без PR не проверяется, чтобы один пуш не давал два прогона.

## Правила кода

- Строгий TypeScript (`strict`, `noUncheckedIndexedAccess`); не используйте
  `any` и `@ts-ignore` без причины.
- ESLint и Prettier обязательны: `--max-warnings=0`.
- Модерация живёт в `src/lib/moderation/*` — слэш-команды, меню и веб-панель
  должны вызывать один и тот же сервис, а не дублировать логику.
- Для изменений поведения добавляйте тест: бот — в `tests/`, панель — рядом с
  кодом (`web/src/**/*.test.ts(x)`).
- Пороги покрытия — ratchet: они равны фактическому покрытию, округлённому вниз
  (бот — в `package.json`, панель — в `web/vitest.config.ts`). Если покрытие
  выросло, поднимите порог в том же коммите; понижать порог можно только с
  объяснением в `CHANGELOG.md`.
- Новые зависимости — только при явной пользе; для панели предпочтительны уже
  используемые React 18, Radix, TanStack Query и Tailwind.

## Зависимости и Dependabot

Dependabot присылает minor/patch одним сгруппированным PR на экосистему.
Мажоры npm-пакетов намеренно игнорируются: их обновляют вручную
(`npm install pkg@major`) отдельным коммитом с миграцией и полным
`npm run ci`. Правило `ignore: dependency-name: '*'` в `.github/dependabot.yml`
можно убрать на время миграции, если нужен автоматический PR. GitHub Actions
обновляются как обычно.

## Коммиты и релизы

Процесс описан в [AGENTS.md](AGENTS.md): один коммит — один релиз, версия по
SemVer одновременно в `package.json`, `package-lock.json`,
`web/package.json` и `web/src/lib/constants.ts`, запись в `CHANGELOG.md` и
`web/src/lib/release-notes.ts`, зелёный `npm run ci`, annotated-тег `vX.Y.Z`.

После пуша тега создайте GitHub Release из changelog:
`npm run release:github -- X.Y.Z` (нужен установленный `gh`).

## Лицензия

Проект распространяется по лицензии [MIT](LICENSE). Файл `LICENSE` можно
заменить другой лицензией до публикации форка — согласуйте это с владельцем
проекта.
