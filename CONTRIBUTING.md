# Участие в разработке

## Требования

- Node.js **22.13+** (нужен встроенный `node:sqlite`).
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
npm run typecheck    # бот + tests/ (tsconfig.tests.json)
npm run lint         # src + tests + scripts + web/src
npm run format       # Prettier, включая web/src
npm test             # тесты бота (node:test)
npm run test:panel   # тесты панели (Vitest + Testing Library)
npm run build        # строгая сборка: tsc + panel + copy-assets
```

Всё вместе — `npm run ci`. GitHub Actions прогоняет этот же набор на каждый
push, PR и тег `v*`; красный CI означает, что изменения не готовы.

## Правила кода

- Строгий TypeScript (`strict`, `noUncheckedIndexedAccess`); не используйте
  `any` и `@ts-ignore` без причины.
- ESLint и Prettier обязательны: `--max-warnings=0`.
- Модерация живёт в `src/lib/moderation/*` — слэш-команды, меню и веб-панель
  должны вызывать один и тот же сервис, а не дублировать логику.
- Для изменений поведения добавляйте тест: бот — в `tests/`, панель — рядом с
  кодом (`web/src/**/*.test.ts(x)`).
- Новые зависимости — только при явной пользе; для панели предпочтительны уже
  используемые React 18, Radix, TanStack Query и Tailwind.

## Коммиты и релизы

Процесс описан в [AGENTS.md](AGENTS.md): один коммит — один релиз, версия по
SemVer одновременно в `package.json`, `package-lock.json`,
`web/package.json` и `web/src/lib/constants.ts`, запись в `CHANGELOG.md` и
`web/src/lib/release-notes.ts`, зелёный `npm run ci`, annotated-тег `vX.Y.Z`.

## Лицензия

Файл `LICENSE` пока не добавлен: перед публикацией репозитория выберите лицензию
и согласуйте её с владельцем проекта. До этого код считается внутренним.
