# Probot-style Discord Bot

Discord-бот на TypeScript (discord.js v14) с упором на модерацию.
Архитектура похожа на ProBot: команды и события подхватываются автоматически,
настройки хранятся по серверам, есть заготовка под веб-панель.

## Возможности

- **Модерация:** `/ban`, `/tempban`, `/softban`, `/massban`, `/kick`, `/unban`,
  `/timeout`, `/untimeout`, `/mute`, `/unmute`, `/warn`, `/warns`, `/clearwarns`
- **Очистка:** `/clear`, `/purge` с фильтрами по автору, ботам, тексту, regex,
  эмбедам, файлам, ссылкам и изображениям
- **Каналы:** `/lock`, `/unlock`, `/lockdown`, `/slowmode`
- **Голос:** `/voice kick|move|mute|unmute|deafen|undeafen`
- **Участники:** `/setnick`, `/role add|remove|temp`, `/addrole`, `/removerole`, `/setrole`
- **Кейсы:** `/case`, `/modlogs`, `/reason`, `/duration` — единая история наказаний
- **Заметки:** `/note add|list|remove|clear`
- **Автомодерация:** `/automod` — приглашения, ссылки, капс, спам, слова, упоминания
- **Автонаказания:** `/warnconfig` — наказание после N варнов за окно времени
- **Безопасность:** `/antiraid` и `/antinuke` — защита от массовых заходов и
  разрушительных действий с аудитом и автонаказаниями
- **Иммунитет:** `/immunity` — роли, на которые не действует модерация
- **Эксплуатация:** `/diagnose`, `/backup`, `/settings` — проверка прав/БД/бэкапов,
  ручной бэкап и обзор настроек
- **Подтверждения:** опасные действия (`/setrole`, `/massban`, `/lockdown`,
  анти-нак → бан) требуют нажатия кнопки
- **Rolepersist:** `/rolepersist` — роли, которые возвращаются после реджойна
- **Срок варнов:** `/warnconfig expiry` — автоматическое устаревание предупреждений
- **Сообщество:** `/welcome`, `/autorole`, `/leveling`, `/rank`, `/top`, `/tag`,
  `/reactionrole`, `/tempvoice`, `/ticket`
- **Жалобы:** `/report user`, `/report channel`
- **Апелляции:** `/appeal submit`, `/appeal channel`, `/appeal list` + кнопки Approve/Reject
- **Статистика:** `/modstats`
- **Логи:** удаления/правки, участники, роли, каналы, голос, ветки, эмодзи,
  приглашения, баны, автомодерация и т.д. — с настройкой через `/logs` или `/menu`
- **Интерактивное меню:** `/menu` — модерация (все наказания), роли, каналы, голос,
  кейсы, настройки, логи и информация
- **SQLite-хранилище** (`data/bot.sqlite`, встроенный `node:sqlite`) с WAL;
  старый JSON автоматически импортируется при первом запуске
- **Веб-панель модератора:** `src/web` — Discord OAuth2, REST API и SPA
  (включается `WEB_ENABLED=true`), см. раздел «Веб-панель»

## Установка

Требуется **Node.js 22.13+** (встроенный `node:sqlite`).

```bash
npm install
cp .env.example .env   # и заполните DISCORD_TOKEN, DISCORD_CLIENT_ID
```

В Discord Developer Portal включите **Privileged Intents**:
`Server Members Intent` и `Message Content Intent`.

Права бота на сервере: `View Channels`, `Send Messages`, `Embed Links`,
`Read Message History`, `View Audit Log`, `Manage Messages`, `Manage Roles`,
`Manage Channels`, `Manage Nicknames`, `Kick Members`, `Ban Members`,
`Moderate Members`, `Move Members`, `Mute Members`, `Deafen Members`,
`Manage Webhooks`. Роль бота должна быть выше ролей, которые он модерирует.

## Запуск

```bash
npm run deploy   # зарегистрировать слэш-команды (после изменений команд)
npm run dev      # запуск с автоперезагрузкой
```

Продакшен:

```bash
npm run build
npm start
```

Проверки:

```bash
npm run typecheck
npm run lint
npm test
npm run ci        # typecheck + lint + format + tests + build
```

## Production

- `Dockerfile` + `docker-compose.yml` — запуск в контейнере с volume `./data:/app/data`.
- `deploy/probot.service` — unit для systemd.
- `npm run health` — проверка SQLite (используется в Docker HEALTHCHECK).
- `npm run restore -- ./data/backups/bot-....sqlite` — восстановление из бэкапа
  (бот перед этим нужно остановить; текущая база сохраняется в `.before-restore-*`).

```bash
docker compose up -d --build
```

Если папка `data` на хосте принадлежит другому пользователю, выдайте права
пользователю контейнера: `sudo chown -R 1000:1000 data`.

> **Не передавайте `.env` и `data/` третьим лицам.** В них токен бота и реальные
> данные модерации (ID участников, причины наказаний). Оба пути уже в `.gitignore`,
> но при упаковке проекта в архив они легко попадают внутрь — при утечке
> перевыпустите токен в Developer Portal.

## Структура

```
src/
├── index.ts              # точка входа, graceful shutdown
├── bot.ts                # запуск клиента
├── config.ts             # конфиг из .env
├── deploy-commands.ts    # регистрация слэш-команд
├── core/
│   ├── client.ts         # расширенный Client (команды, кулдауны)
│   ├── loader.ts         # автозагрузка команд и событий
│   └── types.ts          # типы Command и BotEvent
├── commands/
│   ├── moderation/       # бан, мут, варны, кейсы, очистка, роли, экспорт
│   ├── settings/         # логи, автомод, безопасность, тикеты, уровни, бэкапы
│   └── info/             # /help, /ping, /menu, /rank, /top, /tag
├── features/
│   ├── menu/             # интерактивная панель (/menu)
│   ├── appeals.ts        # кнопки Approve/Reject для апелляций
│   ├── confirmations.ts  # кнопки подтверждения опасных действий
│   └── tickets.ts        # создание/закрытие тикетов
├── events/               # ready, interactionCreate, automod, безопасность, community, логи
├── lib/
│   ├── cases.ts          # модерационные кейсы
│   ├── moderation/       # сервис модерации по доменам (bans, timeouts, warns, ...)
│   ├── moderation.ts     # публичный barrel модерации
│   ├── modSettings.ts    # иммунитет, автомод, автонаказания, безопасность
│   ├── community.ts      # welcome, autorole, уровни, теги, reaction roles, тикеты
│   ├── rolepersist.ts    # сохранение ролей после выхода
│   ├── confirmations.ts  # pending-подтверждения
│   ├── raid.ts           # антирейд
│   ├── nuke.ts           # анти-нак
│   ├── scheduler.ts      # истечение временных наказаний
│   ├── appeals.ts        # апелляции
│   ├── notes.ts          # заметки
│   ├── warns.ts          # предупреждения
│   ├── card.ts           # Components V2-карточки
│   ├── ids.ts            # короткие случайные ID (варны, заметки, правила)
│   └── ...               # embeds, format, logger, logging, locks, reply
├── storage/sqlite.ts     # SQLite, миграции, бэкапы, runtime security
└── web/                  # веб-панель: server, auth, api, actions, data, settings, public/

scripts/                  # healthcheck, restore, copy-assets
deploy/probot.service     # systemd unit
tests/                    # 65 тестов
legacy-js/                # архив первой JS-версии, сборкой не используется
```

Тесты лежат в `tests/`: хранилище, миграции и бэкапы, парсер длительностей,
команды и права, меню, анти-нак, антирейд, community, rolepersist, подтверждения,
настройки безопасности и runtime, HTTP-слой панели, полнота меню, а также регрессии
(вложенные транзакции, экранирование LIKE, SQL-статистика, пороги
автонаказаний, флуд-детектор, rolepersist после кика/бана).

Все npm-скрипты кроссплатформенные (`cross-env`), поэтому `npm run dev` работает
и в PowerShell, и в bash.

## Как добавить команду

1. Создайте файл в `src/commands/<категория>/myCommand.ts`.
2. Экспортируйте `default` объект, удовлетворяющий `Command`:

```ts
import { SlashCommandBuilder } from 'discord.js';
import type { Command } from '../../core/types.js';

export default {
  data: new SlashCommandBuilder().setName('mycommand').setDescription('...'),
  async execute(interaction) {
    await interaction.reply('Привет!');
  },
} satisfies Command;
```

3. Запустите `npm run deploy`, чтобы команда появилась в Discord.

## Как добавить событие

Положите файл в `src/events/` и экспортируйте `default` с `name` и `execute`.
Файл может экспортировать массив событий.

## Оформление

Ответы и логи используют **Components V2**: карточки с цветной акцентной полосой,
заголовком, аватаром, разделителями и мелкими подписями вместо классических эмбедов.
Один визуальный шаблон применяется к командам, логам и `/menu`.

## Хранилище

Данные лежат в SQLite (`data/bot.sqlite`) через встроенный модуль `node:sqlite`.
Включён WAL-режим, путь можно изменить через `DB_FILE`. Схема обновляется
версионными миграциями через `PRAGMA user_version`.

При старте и далее раз в 6 часов бот делает консистентный бэкап через
`VACUUM INTO` в `data/backups/` и хранит последние 7 копий. Настройки:
`DB_BACKUP_INTERVAL_HOURS` (0 — выключить), `DB_BACKUP_KEEP`, `DB_BACKUP_DIR`.

Настройки модерации и логов кэшируются на `SETTINGS_CACHE_TTL_MS`
(по умолчанию 5 секунд, `0` — без кэша).

При первом запуске бот автоматически импортирует старый `data/data.json`
(и `data.json.bak`, если основной повреждён) в SQLite. Путь к старому JSON
можно задать через `DATA_FILE`. После успешной миграции в таблице `meta`
ставится флаг, поэтому повторного импорта не будет. Старый JSON можно оставить
как резервную копию.

## Кейсы и временные наказания

Каждое действие модерации создаёт кейс с номером:

| Команда                      | Что делает                              |
| ---------------------------- | --------------------------------------- |
| `/case id`                   | показать кейс                           |
| `/modlogs user [page]`       | история модерации участника             |
| `/reason case_id reason`     | изменить причину кейса                  |
| `/duration case_id duration` | изменить срок (`1h`, `2d`, `permanent`) |

Временные наказания (`tempban`, `timeout`, `mute`, `role temp`) хранят `expiresAt`.
Планировщик раз в 30 секунд снимает истёкшие наказания и пишет об этом в лог.

## Диагностика и эксплуатация

- `/diagnose` — права бота, Audit Log, канал логов, версия БД, размер, счётчики,
  последний бэкап, планировщик, пинг и аптайм.
- `/backup create|list` — ручной бэкап и список копий.
- `/settings` — обзор логов, автомода, иммунитета, безопасности и бэкапов.
- `/caseexport format:json|csv` — экспорт кейсов.
- `/modlogs user [type] [page]` — фильтр истории по типу.
- `/modstats moderator export:true` — статистика с CSV-экспортом.

## Автомодерация

Включается через `/automod enable enabled:true`. Фильтры:

- `/automod filter filter:invites|links|caps|spam enabled:true`
- `/automod words action:add|remove|list word:...`
- `/automod mentions max:5`

При нарушении бот удаляет сообщение, выдаёт варн и пишет в лог. Модераторы
(Administrator, Manage Server, Kick/Ban/Moderate Members, Manage Messages)
автомодерацией не затрагиваются.

## Автонаказания по варнам

`/warnconfig add count:3 window:7 action:timeout duration:1h`

Поддерживаются действия: `timeout`, `mute`, `kick`, `ban`, `tempban`.
Срабатывает правило с **наибольшим достигнутым порогом**: при правилах «3» и «5»
4-й варн даст наказание за 3, а 5-й — за 5.
Правила можно посмотреть (`/warnconfig list`), удалить (`remove`) или очистить (`clear`).

## Иммунитет

`/immunity add role:@Модератор` — участники с этой ролью не могут быть наказаны
командами бота. Список: `/immunity list`, очистка: `/immunity clear`.

## Антирейд

`/antiraid` защищает от массовых заходов. По умолчанию выключен.

- `/antiraid enable enabled:true`
- `/antiraid threshold count:10 window:60`
- `/antiraid age days:7` — минимальный возраст аккаунта (0 — выключить)
- `/antiraid action action:alert|kick|ban`
- `/antiraid duration seconds:300`
- `/antiraid bots ignore:true`
- `/antiraid panic enabled:true [seconds:...]` — ручной режим
- `/antiraid reset`

При превышении порога бот включает режим антирейда, пишет `raidAlert` в лог
и применяет выбранное действие к новым участникам. Молодые аккаунты можно
проверять отдельно. Все действия логируются как `raidAction`.

## Анти-нак

`/antinuke` следит за массовыми разрушительными действиями через Audit Log.
По умолчанию выключен.

- `/antinuke enable enabled:true`
- `/antinuke threshold count:3 window:60`
- `/antinuke action action:alert|timeout|kick|ban`
- `/antinuke ignoreadmins enabled:true`
- `/antinuke reset`

Отслеживаются баны, кики, удаление каналов/ролей/эмодзи/стикеров, изменение
вебхуков и добавление ботов. При превышении порога бот пишет `nukeAlert`
и, если настроено, наказывает исполнителя (`timeout` — 1 час).
Для работы нужен **View Audit Log**.

## Роли

- `/addrole user role` — выдать роль.
- `/removerole user role` — снять роль.
- `/setrole user role` — заменить все **управляемые** роли участника одной ролью.
  Роли выше роли бота и managed-роли не затрагиваются.

`/role add|remove|temp` остаются как групповой вариант тех же действий.

## Подтверждения

Опасные действия не выполняются сразу — сначала приходит карточка с кнопками
**Подтвердить / Отмена**:

- `/setrole`
- `/massban`
- `/lockdown`
- `/antinuke action:ban`

Кнопки привязаны к автору команды, живут 5 минут и перепроверяют права.

## Rolepersist

`/rolepersist add|remove|list|clear` — роли, которые бот запоминает при выходе
участника и возвращает после повторного захода. Учитываются только управляемые
роли ниже роли бота.

## Срок варнов

`/warnconfig expiry days:30` — варны старше указанного срока больше не
учитываются и удаляются при следующей выдаче. `0` — бессрочно.

## Сообщество

- `/welcome channel|message|goodbye_channel|goodbye_message|disable|status` —
  приветствия и прощания. Шаблоны: `{user}`, `{guild}`, `{memberCount}`.
- `/autorole add|remove|list|clear` — роли при входе.
- `/leveling enable|channel|message|status`, `/rank`, `/top` — XP и уровни.
- `/tag show|list|add|remove` — теги/кастомные ответы.
- `/reactionrole add|remove|list` — роли по реакциям.
- `/tempvoice setup|disable|status` — временные голосовые каналы.
- `/ticket setup|panel|close` — тикеты с кнопкой открытия и закрытия.

## Апелляции

- `/appeal channel #appeals` — канал для апелляций.
- `/appeal submit reason:...` — подать апелляцию (одна активная на пользователя).
- `/appeal list` — ожидающие апелляции.

Сообщение в канале содержит кнопки **Одобрить** / **Отклонить**. При одобрении
бот снимает бан и мут (если они были), уведомляет пользователя в DM и пишет
в лог. Кнопки доступны модераторам с правом «Банить участников» или
«Управление сервером».

Сейчас `/appeal submit` доступен участникам, которые ещё могут использовать
команды на сервере (например, замученным). Для забаненных отдельной формы
пока нет.

## Очистка сообщений

`/purge amount:100` — базовый вариант.

Фильтры: `user`, `bots`, `contains`, `regex`, `embeds`, `files`, `links`, `images`.
Удаляются только сообщения младше 14 дней; закреплённые пропускаются.
`/clear` оставлен как простой вариант «удалить N сообщений».

## Каналы и голос

- `/lock`, `/unlock` — закрыть/открыть один канал.
- `/lockdown enabled:true|false` — все текстовые каналы.
- `/slowmode seconds:10` — медленный режим.
- `/voice kick|move|mute|unmute|deafen|undeafen` — голосовая модерация.

Перед блокировкой бот сохраняет старые overwrites канала и восстанавливает их
при разблокировке.

## Логи

Все настройки — через `/logs` (нужно право «Управление сервером»):

| Подкоманда               | Что делает                                               |
| ------------------------ | -------------------------------------------------------- |
| `/logs channel #dev`     | выбрать канал логов (без канала — выключить)             |
| `/logs status`           | показать категории и выключенные события                 |
| `/logs event`            | включить/выключить отдельное событие (автодополнение)    |
| `/logs category`         | включить/выключить всю категорию                         |
| `/logs all enabled:true` | включить/выключить всё сразу (кроме «каждого сообщения») |
| `/logs reset`            | сбросить фильтры к значениям по умолчанию                |

Категории: сообщения, участники, каналы, роли, ветки, голосовые каналы, сервер,
приглашения, эмодзи/стикеры, события сервера, автомодерация, вебхуки,
безопасность.

События модерации: `warnAdd`, `warnRemove`, `warnEscalation`,
`moderationExpire`, `noteAdd`, `noteRemove`, `appealUpdate`.
События безопасности: `raidAlert`, `raidAction`, `nukeAlert`, `nukeAction`.

Важно:

- Для «кто это сделал» и анти-нака бот должен иметь право **View Audit Log**.
- Для логов вебхуков — **Manage Webhooks**.
- Для автонаказаний анти-нака — соответствующие **Ban/Kick/Moderate Members**.
- Для мута — **Manage Roles + Manage Channels**, для каналов — **Manage Channels**.
- Лог каждого нового сообщения (`messageCreate`) по умолчанию **выключен**.

## Меню `/menu`

Интерактивная панель на Components V2: `41` действие в `6` разделах. Каждое действие
вызывает тот же сервис модерации, что и слэш-команда, поэтому история кейсов и проверки
прав одинаковые.

| Раздел        | Что внутри                                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🛡️ Модерация  | бан, временный бан, софтбан, массбан, кик, разбан, таймаут и мут (с длительностью), снятие таймаута/мута, варн, список варнов, снятие варнов, очистка сообщений |
| 🎭 Роли       | выдать/снять роль, временная роль, setrole (с подтверждением), смена ника                                                                                       |
| 📢 Каналы     | блокировка и разблокировка текущего канала, slowmode, lockdown и его снятие (с подтверждением)                                                                  |
| 🔊 Голос      | отключить, переместить, заглушить/разглушить, оглушить/разоглушить                                                                                              |
| 📋 Кейсы      | последние 10 кейсов, поиск по номеру, история участника, изменение причины и срока                                                                              |
| ⚙️ Настройки  | логи (канал + категории), иммунитет (+роль), канал приветствий, правила автонаказаний, переключатели автомода/антирейда/анти-нака/уровней                       |
| ℹ️ Информация | сервер, пинг, аптайм, полный список команд                                                                                                                      |

Опасные операции (`setrole`, `massban`, `lockdown`) требуют нажатия **Подтвердить** —
как и из команд. Если у пользователя нет нужного права, меню покажет это до открытия окна.

Детальная настройка (пороги, фильтры, шаблоны, тикеты) остаётся в командах
(`/automod`, `/warnconfig`, `/immunity`, `/antiraid`, `/antinuke`, `/welcome`,
`/leveling`, `/autorole`, `/ticket`, `/logs event` …) и в веб-панели — меню даёт
быстрый доступ к частым действиям и переключателям.

## Дальнейшие шаги

- [x] Веб-панель: OAuth2 + API настроек
- [ ] PostgreSQL для мультипроцессного деплоя (когда будет сервер)

## Веб-панель

Включается через `.env`:

```bash
WEB_ENABLED=true
WEB_HOST=127.0.0.1          # loopback; наружу — только через HTTPS-прокси
WEB_PORT=3000
WEB_PUBLIC_URL=https://bot.example.com   # должен совпадать с адресом в браузере
DISCORD_CLIENT_SECRET=...                # Developer Portal -> OAuth2
# WEB_SESSION_HOURS=168
# WEB_SECURE_COOKIES=true
# WEB_TRUST_PROXY=false
```

В Developer Portal → OAuth2 → Redirects добавьте `<WEB_PUBLIC_URL>/auth/callback`.
Нужен только scope `identify`: права модератора бот считает сам по актуальным
ролям участника, поэтому `guilds`-скоуп не требуется.

Что внутри:

- `web/server.ts` — HTTP-сервер без фреймворков: OAuth2, статика (allowlist),
  `/health`, security-заголовки (CSP, `frame-ancestors 'none'`).
- `web/auth.ts` — проверка прав по ролям в гильдии (`admin` / `moderator` +
  `moderate` / `kick` / `ban` / `manageMessages`), кэш 15 с.
- `web/api.ts` — REST: `/api/me`, `/api/status`, `/api/guilds/:id/{overview,meta,
cases,members,appeals,settings,actions,notes,warns}`.
- `web/actions.ts` — действия панели вызывают **тот же** сервис модерации, что и
  слэш-команды (общая история кейсов и одинаковые проверки).
- `web/public/` — SPA без сборки (vanilla JS): обзор, кейсы, участники,
  апелляции, настройки.

Безопасность: сессии в памяти с TTL, CSRF-токен в заголовке `x-csrf-token`,
проверка `Origin`, rate limit (180 запросов/мин на мутации, 30/мин на логин),
лимит тела 512 КБ, куки `HttpOnly` + `SameSite=Lax` (+ `Secure` для https).

Сборка копирует статику панели в `dist/web/public` (`npm run copy-assets`,
вызывается из `npm run build`) — без этого в production панель отдаст 500.
