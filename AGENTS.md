# AGENTS.md

## Релизный процесс

- Каждое изменение оформляется отдельным коммитом.
- Каждый коммит завершается релизом.
- Релиз включает:
  1. версию в `package.json`, `package-lock.json` и `web/src/lib/constants.ts`;
  2. запись в `CHANGELOG.md`;
  3. `npm run ci` (typecheck, lint, format, тесты, сборка);
  4. коммит и annotated-тег `vX.Y.Z`;
  5. перезапуск production-панели и проверку `/health`.
