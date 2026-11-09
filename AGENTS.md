# AGENTS.md

## Релизный процесс

- Каждое изменение оформляется отдельным коммитом.
- Каждый коммит завершается релизом.
- Релиз включает:
  1. версию по [SemVer](https://semver.org/lang/ru/) (`X.Y.Z`) в `package.json`,
     `package-lock.json`, `web/package.json` и `web/src/lib/constants.ts`;
  2. запись в `CHANGELOG.md` и `web/src/lib/release-notes.ts`;
  3. `npm --prefix web ci` (если зависимости панели ещё не установлены);
  4. `npm run ci` (typecheck бота и тестов, lint, format, тесты бота и панели,
     строгая сборка панели);
  5. коммит и annotated-тег `vX.Y.Z`;
  6. перезапуск production-панели и проверку `/health`.
- GitHub Actions (`.github/workflows/ci.yml`) прогоняет те же проверки на push,
  PR и тег — локальный `npm run ci` должен быть зелёным до пуша.
