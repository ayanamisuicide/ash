# NEXUS — панель модератора

Новый фронтенд панели: **React 18 + Vite + TypeScript + Tailwind CSS + Framer Motion**.
Работает с существующим HTTP API бота (`src/web`) без изменений бэкенда.

## Запуск

```bash
cd web
npm install
cp .env.example .env.local   # при необходимости
npm run dev
```

Vite поднимется на `http://127.0.0.1:5173` и проксирует `/api/*` и `/auth/*`
в бота на `http://127.0.0.1:3000` (меняется через `BOT_API_ORIGIN`).

Чтобы OAuth-редирект возвращался в dev-панель, в `.env` бота:

```bash
WEB_ENABLED=true
WEB_PUBLIC_URL=http://127.0.0.1:5173
WEB_HOST=127.0.0.1
WEB_PORT=3000
```

В Discord Developer Portal redirect остаётся `<WEB_PUBLIC_URL>/auth/callback`.

## Проверки

```bash
npm run typecheck
npm run build
npm run preview
```

## Production и Tailscale

Сборка из корня проекта собирает панель и кладёт её в `dist/web/public`:

```bash
npm run build
```

Бот раздаёт `web/dist` (в dev) или `dist/web/public` (в production) на
`WEB_PORT`. Tailscale `serve` должен проксировать именно этот порт. После
пересборки перезапустите бота — иначе он продолжит отдавать старый билд.

## Структура

```text
web/
├── src/
│   ├── api/
│   │   ├── client.ts        # fetch + cookie + CSRF + ApiError
│   │   ├── endpoints.ts     # типизированные вызовы API
│   │   └── types.ts         # контракты /api/me и общие DTO
│   ├── components/
│   │   ├── auth/            # bootstrap сессии, защита роутов
│   │   ├── brand/           # логотип и Discord-иконка
│   │   ├── dashboard/       # StatCard, ActivityChart, RecentCasesTable, ...
│   │   ├── effects/         # анимированный фон
│   │   ├── layout/          # Sidebar, Topbar, AppLayout
│   │   └── ui/              # Button, Card, Modal, Toast, Tooltip, ...
│   ├── hooks/               # useLogout, usePageTitle
│   ├── lib/                 # queryClient, cases, format, demo-overview, ...
│   ├── pages/               # Login, Dashboard, Cases, Members, ...
│   ├── store/
│   │   ├── auth.ts          # Zustand: user, guilds, access, csrf, bot
│   │   └── ui.ts            # Zustand: sidebar, toasts, modal
│   ├── App.tsx              # HashRouter и дерево роутов
│   ├── main.tsx             # providers
│   └── index.css            # дизайн-токены и glass-утилиты
├── tailwind.config.ts
└── vite.config.ts
```

## Реализовано на шаге 1

- дизайн-система и glassmorphism-токены;
- атмосферный фон с плавающими блобами (Framer Motion);
- `fetch`-клиент с `credentials: include`, CSRF и нормализацией ошибок;
- Zustand auth-store и bootstrap `/api/me`;
- защита роутов и admin-only доступ к настройкам;
- Button, Card, Modal (Radix Dialog), Toast, Tooltip, Dropdown, Avatar;
- Sidebar с выбором сервера, neon-индикатором и мобильным drawer;
- Topbar с пингом бота и меню пользователя;
- HashRouter-навигация и page-transitions.

> `/#/login` и `/#/` показывают вход. Для проверки интерфейса без бота в dev-режиме
> на экране входа есть кнопка «Посмотреть демо-панель».

## Реализовано на шаге 2

- Dashboard на реальном `GET /api/guilds/:guildId/overview`;
- шесть stat-карточек с count-up при попадании во viewport;
- Recharts bar-chart активных наказаний с glassmorphism-тултипом
  (график вынесен в отдельный lazy-chunk);
- таблица последних кейсов с адаптивными колонками и бейджами типов;
- виджеты «Защита сервера» и «Состояние бота»;
- shimmer-скелетоны, EmptyState с повтором запроса и обновление данных;
- access из overview записывается в Zustand для будущих action-кнопок;
- guild-scoped инвалидация кеша: смена сервера не трогает `/api/me`.

## Реализовано на шаге 3

- **Кейсы:** поиск с debounce, фильтры по типу/статусу, пагинация, модалка
  редактирования причины и активности с проверкой `access.moderate/admin`;
  клик по последнему кейсу на дашборде открывает ту же карточку. В карточке
  доступны быстрые действия: бан/разбан, мут/снятие, таймаут/снятие, кик, варн,
  роль и заметка — по правам и состоянию участника;
- **Участники:** поиск по нику/ID, список с бейджами «мут»/«таймаут», профиль
  с ролями, копированием ID, деталями, табами варнов/заметок/кейсов и
  действиями по правам;
- **Действия:** универсальная `ActionModal` для warn/timeout/mute/kick/ban/unban/
  role/note с формами, пресетами длительности, спиннерами и обработкой `ok:false`;
- **Апелляции:** табы «Ожидают»/«Все», карточки с кейсом и типом наказания,
  confirm-модалка и решение «Одобрить/Отклонить» по правам; одобрение снимает
  именно обжалуемое наказание (бан/мут/таймаут/варн и т.д.);
- **Настройки:** табы разделов и полностью рабочая вкладка «Модерация» —
  автомодерация, стоп-слова, правила автонаказаний, каналы и роль мута;
- **Логи:** причины из Discord audit log теперь выводятся в обычных логах
  каналов, ролей, участников, сообщений, веток, эмодзи/стикеров, событий и
  голосовых действий, а также в логах антирейда/анти-нака и автонаказаний.

## Дальше

Вкладки «Логи», «Безопасность» и «Сообщество» в настройках — следующий шаг.
