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
- **Жалобы:** `/report user`, `/report channel`
- **Апелляции:** `/appeal submit`, `/appeal channel`, `/appeal list` + кнопки Approve/Reject
- **Статистика:** `/modstats`
- **Логи:** удаления/правки, участники, роли, каналы, голос, ветки, эмодзи,
  приглашения, баны, автомодерация и т.д. — с настройкой через `/logs` или `/menu`
- **Интерактивное меню:** `/menu` — модерация, логи, кейсы и информация
- **SQLite-хранилище** (`data/bot.sqlite`, встроенный `node:sqlite`) с WAL;
  старый JSON автоматически импортируется при первом запуске
- **Заготовка веб-панели:** `src/web/server.ts` (включается `WEB_ENABLED=true`)

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
npm test
npm run ci        # typecheck + tests + build одной командой
```

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
│   ├── moderation/       # бан, кик, мут, варны, кейсы, очистка, каналы, голос, апелляции
│   ├── settings/         # /logs, /automod, /warnconfig, /immunity, /report, /antiraid, /antinuke
│   └── info/             # /help, /ping, /menu
├── features/
│   ├── menu/             # интерактивная панель (/menu)
│   └── appeals.ts        # кнопки Approve/Reject для апелляций
├── events/               # ready, interactionCreate, automod, антирейд, анти-нак и логи
├── lib/
│   ├── cases.ts          # модерационные кейсы
│   ├── moderation/       # сервис модерации по доменам (bans, timeouts, warns, ...)
│   ├── moderation.ts     # публичный barrel модерации
│   ├── modSettings.ts    # иммунитет, автомод, автонаказания, безопасность
│   ├── raid.ts           # антирейд
│   ├── nuke.ts           # анти-нак
│   ├── scheduler.ts      # истечение временных наказаний
│   ├── appeals.ts        # апелляции
│   ├── notes.ts          # заметки
│   ├── warns.ts          # предупреждения
│   ├── card.ts           # Components V2-карточки
│   └── ...               # embeds, format, logger, logging, locks, reply
├── storage/sqlite.ts     # SQLite, схема и миграция из JSON
└── web/server.ts         # заготовка веб-панели
```

Тесты лежат в `tests/`: хранилище, миграции и бэкапы, парсер длительностей,
команды и права, меню, анти-нак, настройки безопасности и runtime.

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

Раз в 6 часов бот делает консистентный бэкап через `VACUUM INTO` в
`data/backups/` и хранит последние 7 копий. Настройки:
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

| Команда | Что делает |
|---|---|
| `/case id` | показать кейс |
| `/modlogs user [page]` | история модерации участника |
| `/reason case_id reason` | изменить причину кейса |
| `/duration case_id duration` | изменить срок (`1h`, `2d`, `permanent`) |

Временные наказания (`tempban`, `timeout`, `mute`, `role temp`) хранят `expiresAt`.
Планировщик раз в 30 секунд снимает истёкшие наказания и пишет об этом в лог.

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
Срабатывает первое правило, у которого количество свежих варнов совпало с порогом.
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

| Подкоманда | Что делает |
|---|---|
| `/logs channel #dev` | выбрать канал логов (без канала — выключить) |
| `/logs status` | показать категории и выключенные события |
| `/logs event` | включить/выключить отдельное событие (автодополнение) |
| `/logs category` | включить/выключить всю категорию |
| `/logs all enabled:true` | включить/выключить всё сразу (кроме «каждого сообщения») |
| `/logs reset` | сбросить фильтры к значениям по умолчанию |

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

## Дальнейшие шаги

- [ ] Веб-панель: OAuth2 + API настроек
- [ ] PostgreSQL для мультипроцессного деплоя (когда будет сервер)
