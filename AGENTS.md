# AGENTS.md

## Релизный процесс

- Каждое изменение оформляется отдельным коммитом.
- Каждый коммит завершается релизом.
- Релиз включает:
  1. версию по [SemVer](https://semver.org/lang/ru/) (`X.Y.Z`) в `package.json`,
     `package-lock.json`, `web/package.json` и `web/src/lib/constants.ts`;
  2. запись в `CHANGELOG.md` и `web/src/lib/release-notes.ts`;
  3. `npm --prefix web ci` (если зависимости панели ещё не установлены);
  4. `npm run ci` — параллельные проверки (`npm run verify`: типы бота, тестов и
     панели, ESLint, Prettier, тесты бота и панели) и строгая сборка панели;
  5. коммит и annotated-тег `vX.Y.Z`;
  6. перезапуск production-панели и проверку `/health`.
- GitHub Actions (`.github/workflows/ci.yml`) прогоняет те же проверки на push в
  `main`, в pull request и на тег `v*` — локальный `npm run ci` должен быть
  зелёным до пуша.
- Пороги покрытия — ratchet: равны фактическому покрытию, округлённому вниз
  (бот — флаги `--test-coverage-*` в `package.json`, панель — `thresholds` в
  `web/vitest.config.ts`). При росте покрытия порог поднимается в том же коммите.
- `npm run deploy` кэшируется по хешу тела регистрации (`data/deploy-state.json`):
  неизменённые команды не отправляются в Discord повторно, принудительно —
  `npm run deploy -- --force` или `DEPLOY_FORCE=1`.
