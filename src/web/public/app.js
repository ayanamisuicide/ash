/* Панель модератора ProBot — vanilla JS SPA без сборки и внешних зависимостей. */

const root = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');

const ICONS = {
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/></svg>',
  cases:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1.5"/><path d="M9 12h6M9 16h4"/></svg>',
  users:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.4a5.3 5.3 0 0 1 2.6 4.6"/></svg>',
  appeals:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.5-4.5A8 8 0 1 1 21 12Z"/><path d="M8 11h8M8 15h5"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.3a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.7 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.7 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.7a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.1 4.7a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.3 9v.09a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  ban: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>',
  kick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="m9 8 4 4-4 4M3 12h10"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/></svg>',
  shield:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 6v6c0 4.4-3.2 7.5-8 9-4.8-1.5-8-4.6-8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
  activity:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-7 5 14L17 12h4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  chevronLeft:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  chevronRight:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  discord:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.2a18.3 18.3 0 0 0-5.6 0L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.7 9.1-.1 13.7.3 18.2A20 20 0 0 0 6.3 21l1.3-2.1a12.3 12.3 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 11.8 0l.5.4a12.3 12.3 0 0 1-2 1L17.7 21a20 20 0 0 0 6-2.8c.5-5.2-.8-9.7-3.4-13.8ZM8.2 15.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7.6 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/></svg>',
};

const CASE_LABELS = {
  ban: 'Бан',
  tempban: 'Временный бан',
  softban: 'Софтбан',
  kick: 'Кик',
  unban: 'Разбан',
  timeout: 'Таймаут',
  untimeout: 'Снятие таймаута',
  mute: 'Мут',
  unmute: 'Снятие мута',
  warn: 'Предупреждение',
  warnRemove: 'Снятие варна',
  note: 'Заметка',
  noteRemove: 'Удаление заметки',
  voice: 'Голосовое действие',
  nick: 'Ник',
  role: 'Роль',
  temprole: 'Временная роль',
  lock: 'Блокировка канала',
  unlock: 'Разблокировка канала',
  slowmode: 'Slowmode',
  purge: 'Очистка',
};

const WARN_ACTION_LABELS = {
  timeout: 'Таймаут',
  mute: 'Мут',
  kick: 'Кик',
  ban: 'Бан',
  tempban: 'Временный бан',
};

const state = {
  me: null,
  guildId: null,
  view: 'dashboard',
  settingsTab: 'moderation',
  meta: null,
  overview: null,
  cases: null,
  caseFilters: { q: '', type: '', active: '', page: 1 },
  members: { query: '', items: null, selected: null, tab: 'warns', loading: false },
  appeals: { status: 'pending', items: null },
  settings: null,
  settingsError: null,
  loadingView: false,
  loadingGuild: false,
  sidebarOpen: false,
  confirmHandler: null,
};

let searchTimer = null;

// ------------------------------------------------------------------ helpers

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ESC_MAP[char]);
}

function icon(name) {
  return ICONS[name] ?? '';
}

function fmtDate(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(timestamp) {
  if (!timestamp) return '—';
  const diff = Number(timestamp) - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return 'только что';
  const units = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat('ru', { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (abs >= size) return formatter.format(Math.round(diff / size), unit);
  }
  return 'только что';
}

function fmtDuration(ms) {
  if (!ms || ms <= 0) return 'бессрочно';
  let seconds = Math.floor(ms / 1000);
  const parts = [];
  for (const [label, size] of [
    ['д', 86_400],
    ['ч', 3_600],
    ['м', 60],
  ]) {
    const value = Math.floor(seconds / size);
    if (value > 0) {
      parts.push(`${value}${label}`);
      seconds -= value * size;
    }
  }
  if (!parts.length) parts.push(`${seconds}с`);
  return parts.join(' ');
}

function debounce(fn, delay = 320) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fn, delay);
}

function toast(message, type = 'info', timeout = 5000) {
  const element = document.createElement('div');
  element.className = `toast ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
  const text = document.createElement('div');
  text.className = 'toast-text';
  text.textContent = message;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.textContent = '×';
  close.addEventListener('click', () => element.remove());
  element.append(text, close);
  toastRoot.append(element);
  setTimeout(() => element.remove(), timeout);
}

function showModal({ title, body, footer = '', wide = false }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" type="button" data-action="close-modal" aria-label="Закрыть">${icon('close')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-actions">${footer}</div>` : ''}
    </div>`;
  document.body.classList.add('modal-open');
}

function closeModal() {
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  state.confirmHandler = null;
}

function confirmAction({ title, message, label = 'Подтвердить', danger = false, onConfirm }) {
  state.confirmHandler = onConfirm;
  showModal({
    title,
    body: `<p class="hint" style="font-size:13px;color:var(--muted);line-height:1.6">${esc(message)}</p>`,
    footer: `<div class="spacer"></div>
      <button class="btn" type="button" data-action="close-modal">Отмена</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-action="modal-confirm">${esc(label)}</button>`,
  });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  if (options.method && options.method !== 'GET') {
    if (state.me?.csrf) headers['x-csrf-token'] = state.me.csrf;
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers,
    body,
    credentials: 'same-origin',
  });

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401 && path !== '/api/me') {
      state.me = null;
      renderLogin();
    }
    throw new ApiError(response.status, data?.error ?? `Ошибка ${response.status}`);
  }
  return data;
}

function currentGuild() {
  return state.me?.guilds.find((guild) => guild.id === state.guildId) ?? null;
}

function access() {
  return (
    state.overview?.access ??
    state.meta?.access ?? {
      admin: false,
      moderate: false,
      kick: false,
      ban: false,
      manageMessages: false,
    }
  );
}

function pendingAppeals() {
  return state.overview?.stats?.pendingAppeals ?? 0;
}

function caseBadge(type) {
  if (['ban', 'tempban', 'softban', 'kick'].includes(type)) return 'badge-danger';
  if (['warn', 'timeout', 'mute'].includes(type)) return 'badge-warn';
  if (['note', 'voice', 'nick', 'role', 'temprole', 'slowmode'].includes(type)) return 'badge-info';
  if (['unban', 'unmute', 'untimeout', 'warnRemove', 'unlock'].includes(type))
    return 'badge-success';
  return 'badge-neutral';
}

function caseLabel(type) {
  return CASE_LABELS[type] ?? type;
}

function userCell(id, name) {
  if (!id) return '<span class="mono">—</span>';
  return `<div class="cell-main">${esc(name ?? 'Неизвестный')}</div><div class="mono">${esc(id)}</div>`;
}

function roleStyle(color) {
  const hex = color ? `#${Number(color).toString(16).padStart(6, '0')}` : '#8d97ac';
  return `color:${hex};border-color:${hex}55;background:${hex}14`;
}

function loadingPanel(text = 'Загружаем данные…') {
  return `<div class="panel"><div class="loading-panel"><span class="spinner dark"></span><span>${esc(text)}</span></div></div>`;
}

function emptyState(title, text, iconName = 'cases') {
  return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>`;
}

function statCard(iconName, label, value, note, tone = '') {
  return `<div class="stat-card ${tone}">
    <div class="stat-top"><span class="stat-icon">${icon(iconName)}</span>${esc(label)}</div>
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-note">${esc(note)}</div>
  </div>`;
}

function pageNumbers(page, pages) {
  const result = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);
  for (let index = start; index <= end; index += 1) result.push(index);
  return result;
}

// --------------------------------------------------------------------- auth

function renderLogin() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const messages = {
    state: 'Сессия авторизации истекла или была подменена. Попробуйте войти ещё раз.',
    oauth: 'Discord не подтвердил вход. Проверьте Client Secret и Redirect URI в Developer Portal.',
    rate: 'Слишком много попыток входа. Подождите минуту.',
  };

  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="brand-logo"></div>
        <h1>Панель модератора</h1>
        <p class="lead">Модерация, кейсы, апелляции и настройки сервера в одном месте. Вход — через ваш Discord-аккаунт.</p>
        ${messages[error] ? `<div class="login-error">${esc(messages[error])}</div>` : ''}
        <a class="btn-discord" href="/auth/login">${icon('discord')} Войти через Discord</a>
        <p class="login-note">Доступ получают только участники сервера с правами <b>модератора</b> или <b>управления сервером</b>. Бот должен находиться на сервере.</p>
      </div>
    </div>`;
}

function renderFatal(message) {
  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="brand-logo"></div>
        <h1>Что-то пошло не так</h1>
        <p class="lead">${esc(message)}</p>
        <a class="btn-discord" href="/auth/login">Войти заново</a>
      </div>
    </div>`;
}

function renderNoAccess() {
  root.innerHTML = `
    <div class="login-page">
      <div class="login-card">
        <div class="brand-logo"></div>
        <h1>Нет доступных серверов</h1>
        <p class="lead">Вы не состоите ни на одном сервере с ботом ProBot или у вас нет модераторских прав. Попросите администратора выдать роль и обновите страницу после входа.</p>
        <button class="btn-discord" type="button" data-action="logout">Выйти</button>
      </div>
    </div>`;
}

async function logout() {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch {
    // выходим локально в любом случае
  }
  state.me = null;
  window.location.href = '/';
}

// -------------------------------------------------------------------- shell

function renderShell() {
  const guild = currentGuild();
  const accessInfo = access();
  const overview = state.overview;
  const bot = overview?.bot ?? state.me?.bot;
  const guildName = guild?.name ?? state.meta?.guild?.name ?? 'Сервер';
  const guildIcon = state.meta?.guild?.iconUrl ?? guild?.iconUrl ?? null;
  const online = bot && bot.uptime >= 0;

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}" id="sidebar">
        <div class="brand">
          <div class="brand-logo"></div>
          <div><div class="brand-name">ProBot</div><div class="brand-sub">Moderator</div></div>
        </div>

        <div class="guild-switch">
          <span class="guild-switch-label">Сервер</span>
          <select data-change="guild" aria-label="Выбор сервера">
            ${state.me.guilds
              .map(
                (item) =>
                  `<option value="${esc(item.id)}" ${item.id === state.guildId ? 'selected' : ''}>${esc(item.name)}</option>`,
              )
              .join('')}
          </select>
        </div>

        <nav class="nav">
          ${navItem('dashboard', 'Обзор', 'dashboard')}
          ${navItem('cases', 'Кейсы', 'cases')}
          ${navItem('members', 'Участники', 'users')}
          ${navItem('appeals', 'Апелляции', 'appeals', pendingAppeals())}
          ${accessInfo.admin ? `<div class="nav-section">Управление</div>${navItem('settings', 'Настройки', 'settings')}` : ''}
        </nav>

        <div class="sidebar-footer">
          <div class="user-card">
            <img class="avatar" src="${esc(state.me.user.avatarUrl)}" alt="" />
            <div class="user-card-info">
              <div class="user-card-name">${esc(state.me.user.displayName)}</div>
              <div class="user-card-sub">@${esc(state.me.user.username)}</div>
            </div>
            <button class="icon-btn" type="button" data-action="logout" title="Выйти">${icon('logout')}</button>
          </div>
        </div>
      </aside>

      ${state.sidebarOpen ? '<div class="sidebar-backdrop" data-action="toggle-sidebar"></div>' : ''}

      <div class="main">
        <header class="topbar">
          <button class="icon-btn menu-btn" type="button" data-action="toggle-sidebar" aria-label="Меню">${icon('menu')}</button>
          <div class="topbar-title">
            <div class="topbar-icon">${guildIcon ? `<img src="${esc(guildIcon)}" alt="" />` : esc(guildName.slice(0, 1).toUpperCase())}</div>
            <div>
              <div class="crumb">Панель модератора</div>
              <h2>${esc(guildName)}</h2>
            </div>
          </div>
          <div class="topbar-meta">
            <span class="ping-pill"><span class="dot ${online ? '' : 'offline'}"></span>${bot ? `${esc(bot.ping)} мс` : 'бот офлайн'}</span>
            <img class="avatar sm" src="${esc(state.me.user.avatarUrl)}" alt="" />
          </div>
        </header>
        <main class="content" id="view"></main>
      </div>
    </div>`;

  renderView();
}

function navItem(view, label, iconName, count = 0) {
  const active = state.view === view ? 'active' : '';
  return `<button class="nav-item ${active}" type="button" data-action="nav" data-view="${view}">
    ${icon(iconName)}<span>${esc(label)}</span>${count > 0 ? `<span class="count">${esc(count)}</span>` : ''}
  </button>`;
}

function renderView() {
  const container = document.getElementById('view');
  if (!container) return;

  if (state.loadingGuild || !state.meta || !state.overview) {
    container.innerHTML = loadingPanel('Подключаемся к серверу…');
    return;
  }

  if (state.loadingView) {
    container.innerHTML = loadingPanel('Загружаем данные…');
    return;
  }

  switch (state.view) {
    case 'cases':
      container.innerHTML = renderCasesView();
      break;
    case 'members':
      container.innerHTML = renderMembersView();
      break;
    case 'appeals':
      container.innerHTML = renderAppealsView();
      break;
    case 'settings':
      container.innerHTML = renderSettingsView();
      break;
    default:
      container.innerHTML = renderDashboardView();
  }
}

// ----------------------------------------------------------------- dashboard

function renderDashboardView() {
  const overview = state.overview;
  const stats = overview.stats;
  const security = overview.security;
  const active = overview.activeByType;
  const maxActive = Math.max(1, ...active.map((item) => item.count));

  return `
    <div class="page-head">
      <div>
        <h1>Обзор</h1>
        <p>Сводка по модерации, активности и защите сервера. Данные обновляются по кнопке.</p>
      </div>
      <div class="spacer"></div>
      <div class="page-head-actions">
        <button class="btn" type="button" data-action="refresh">${icon('refresh')} Обновить</button>
      </div>
    </div>

    <div class="stats-grid">
      ${statCard('users', 'Участники', stats.members, 'на сервере')}
      ${statCard('cases', 'Кейсы', stats.totalCases, 'всего записей')}
      ${statCard('activity', 'За сегодня', stats.todayCases, 'новых кейсов', 'info')}
      ${statCard('shield', 'Активные', stats.activeCases, 'наказания', 'warn')}
      ${statCard('warn', 'Варны', stats.warns, 'предупреждений', 'danger')}
      ${statCard('appeals', 'Апелляции', stats.pendingAppeals, `из ${stats.totalAppeals} всего`, 'success')}
    </div>

    <div class="grid two">
      <section class="panel">
        <div class="panel-head">
          <h2>Последние кейсы</h2>
          <div class="spacer"></div>
          <button class="btn btn-sm btn-ghost" type="button" data-action="nav" data-view="cases">Все кейсы ${icon('chevronRight')}</button>
        </div>
        ${
          overview.recentCases.length
            ? caseTable(overview.recentCases, { compact: true })
            : emptyState('Кейсов пока нет', 'Первое наказание или заметка появятся здесь.', 'cases')
        }
      </section>

      <div class="grid">
        <section class="panel">
          <div class="panel-head">
            <h2>Защита сервера</h2>
            <div class="spacer"></div>
            <span class="badge ${security.raid.enabled || security.nuke.enabled ? 'badge-success' : 'badge-neutral'}">${security.raid.enabled || security.nuke.enabled ? 'Активна' : 'Выключена'}</span>
          </div>
          <div class="panel-body">
            <div class="security-list">
              <div class="security-item">
                <span class="security-icon">${icon('activity')}</span>
                <div class="grow"><div class="name">Антирейд</div><div class="sub">${security.raid.joinThreshold} заходов / ${security.raid.joinWindowSec} с · ${raidActionLabel(security.raid.action)}</div></div>
                <span class="badge ${security.raid.enabled ? 'badge-success' : 'badge-neutral'}">${security.raid.enabled ? 'Вкл' : 'Выкл'}</span>
              </div>
              <div class="security-item">
                <span class="security-icon">${icon('shield')}</span>
                <div class="grow"><div class="name">Анти-нак</div><div class="sub">${security.nuke.threshold} действий / ${security.nuke.windowSec} с · ${nukeActionLabel(security.nuke.action)}</div></div>
                <span class="badge ${security.nuke.enabled ? 'badge-success' : 'badge-neutral'}">${security.nuke.enabled ? 'Вкл' : 'Выкл'}</span>
              </div>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Активные наказания</h2></div>
          <div class="panel-body">
            ${
              active.length
                ? `<div class="bars">${active
                    .map(
                      (item) => `<div class="bar-row"><span>${esc(caseLabel(item.type))}</span>
                        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((item.count / maxActive) * 100)}%"></div></div>
                        <b>${esc(item.count)}</b></div>`,
                    )
                    .join('')}</div>`
                : '<div class="hint">Активных наказаний нет.</div>'
            }
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Бот</h2></div>
          <div class="panel-body">
            <div class="security-list">
              <div class="security-item">
                <span class="security-icon">${icon('activity')}</span>
                <div class="grow"><div class="name">${esc(overview.bot.tag ?? 'Не подключён')}</div><div class="sub">Аптайм ${esc(fmtDuration(overview.bot.uptime * 1000))}</div></div>
                <span class="badge ${overview.bot.tag ? 'badge-success' : 'badge-danger'}">${overview.bot.tag ? 'Онлайн' : 'Офлайн'}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>`;
}

function raidActionLabel(action) {
  return { alert: 'уведомление', kick: 'кик', ban: 'бан' }[action] ?? action;
}

function nukeActionLabel(action) {
  return { alert: 'уведомление', timeout: 'таймаут', kick: 'кик', ban: 'бан' }[action] ?? action;
}

function caseTable(items, options = {}) {
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>#</th><th>Тип</th><th>Участник</th>${options.compact ? '' : '<th>Модератор</th>'}<th>Причина</th><th>Дата</th><th>Статус</th>
    </tr></thead>
    <tbody>
      ${items
        .map(
          (item) => `<tr class="row-click" data-action="open-case" data-id="${esc(item.id)}">
            <td class="mono">#${esc(item.id)}</td>
            <td><span class="badge ${caseBadge(item.type)}">${esc(item.label ?? caseLabel(item.type))}</span></td>
            <td>${userCell(item.userId, item.userName)}</td>
            ${options.compact ? '' : `<td>${userCell(item.moderatorId, item.moderatorName)}</td>`}
            <td><div class="cell-reason" title="${esc(item.reason)}">${esc(item.reason)}</div></td>
            <td><div>${esc(fmtDate(item.createdAt))}</div><div class="cell-sub">${esc(fmtRelative(item.createdAt))}</div></td>
            <td>${item.active ? '<span class="badge badge-warn">Активен</span>' : '<span class="badge badge-neutral">Закрыт</span>'}</td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table></div>`;
}

// --------------------------------------------------------------------- cases

function renderCasesView() {
  const filters = state.caseFilters;
  const typeOptions = Object.entries(CASE_LABELS)
    .map(
      ([value, label]) =>
        `<option value="${esc(value)}" ${filters.type === value ? 'selected' : ''}>${esc(label)}</option>`,
    )
    .join('');

  return `
    <div class="page-head">
      <div><h1>Кейсы</h1><p>Единая история наказаний, заметок и действий модерации.</p></div>
      <div class="spacer"></div>
      <div class="page-head-actions">
        <button class="btn" type="button" data-action="refresh">${icon('refresh')} Обновить</button>
      </div>
    </div>

    <section class="panel">
      <div class="toolbar">
        <div class="search">${icon('search')}<input class="input" id="case-search" placeholder="Поиск по причине, ID участника или модератора" value="${esc(filters.q)}" /></div>
        <select class="select" data-change="case-type">
          <option value="">Все типы</option>${typeOptions}
        </select>
        <select class="select" data-change="case-active">
          <option value="" ${filters.active === '' ? 'selected' : ''}>Все статусы</option>
          <option value="true" ${filters.active === 'true' ? 'selected' : ''}>Активные</option>
          <option value="false" ${filters.active === 'false' ? 'selected' : ''}>Закрытые</option>
        </select>
        <div class="spacer"></div>
        <button class="btn btn-ghost btn-sm" type="button" data-action="cases-reset">Сбросить</button>
      </div>
      <div id="cases-result">${casesResultHtml()}</div>
    </section>`;
}

function casesResultHtml() {
  if (!state.cases) return loadingPanel('Загружаем кейсы…');
  if (state.cases === 'error')
    return `<div class="loading-panel"><p>Не удалось загрузить кейсы.</p><button class="btn btn-sm" type="button" data-action="refresh">Повторить</button></div>`;

  const data = state.cases;
  if (!data.items.length) {
    return emptyState(
      'Ничего не найдено',
      'Попробуйте изменить фильтры или поисковый запрос.',
      'cases',
    );
  }

  const buttons = pageNumbers(data.page, data.pages)
    .map(
      (page) =>
        `<button type="button" class="${page === data.page ? 'active' : ''}" data-action="case-page" data-page="${page}">${page}</button>`,
    )
    .join('');

  return `${caseTable(data.items)}
    <div class="pagination">
      <span>Всего: <b>${esc(data.total)}</b></span>
      <div class="spacer"></div>
      <div class="pager">
        <button type="button" data-action="case-page" data-page="${Math.max(1, data.page - 1)}" ${data.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        ${buttons}
        <button type="button" data-action="case-page" data-page="${Math.min(data.pages, data.page + 1)}" ${data.page >= data.pages ? 'disabled' : ''}>${icon('chevronRight')}</button>
      </div>
    </div>`;
}

function renderCasesResult() {
  const container = document.getElementById('cases-result');
  if (container) container.innerHTML = casesResultHtml();
}

async function fetchCases() {
  const filters = state.caseFilters;
  const params = new URLSearchParams({ page: String(filters.page), pageSize: '25' });
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.type) params.set('type', filters.type);
  if (filters.active) params.set('active', filters.active);

  try {
    state.cases = await api(`/api/guilds/${state.guildId}/cases?${params.toString()}`);
  } catch (error) {
    state.cases = 'error';
    toast(error.message, 'error');
  }
}

async function openCaseModal(caseId) {
  try {
    const data = await api(`/api/guilds/${state.guildId}/cases/${caseId}`);
    const item = data.case;
    const canEdit = access().admin || access().moderate;

    showModal({
      title: `Кейс #${item.id}`,
      wide: true,
      body: `
        <div class="detail-grid" style="padding:0 0 16px;border:0">
          <div class="detail"><span>Тип</span><b>${esc(item.label ?? caseLabel(item.type))}</b></div>
          <div class="detail"><span>Статус</span><b>${item.active ? 'Активен' : 'Закрыт'}</b></div>
          <div class="detail"><span>Создан</span><b>${esc(fmtDate(item.createdAt))}</b></div>
          <div class="detail"><span>Истекает</span><b>${item.expiresAt ? esc(fmtDate(item.expiresAt)) : '—'}</b></div>
          <div class="detail"><span>Участник</span><b>${esc(item.userName ?? item.userId ?? '—')}</b></div>
          <div class="detail"><span>Модератор</span><b>${esc(item.moderatorName ?? item.moderatorId)}</b></div>
        </div>
        ${
          canEdit
            ? `<form data-form="case-edit" data-id="${esc(item.id)}">
                <div class="field"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required>${esc(item.reason)}</textarea></div>
                <label class="checkbox" style="margin-top:12px"><input type="checkbox" name="active" ${item.active ? 'checked' : ''} /><span>Наказание активно<small class="check-sub">Снимите галочку, чтобы закрыть кейс.</small></span></label>
                <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button><button class="btn" type="button" data-action="close-modal">Отмена</button></div>
              </form>`
            : `<div class="notice info">У вас нет прав на редактирование кейса.</div><div class="appeal-reason" style="margin-top:14px">${esc(item.reason)}</div>`
        }`,
    });
  } catch (error) {
    toast(error.message, 'error');
  }
}

// ------------------------------------------------------------------- members

function renderMembersView() {
  const members = state.members;
  const selected = members.selected;

  const list = members.items
    ? members.items.length
      ? members.items
          .map(
            (
              member,
            ) => `<button class="member-item ${selected?.id === member.id ? 'active' : ''}" type="button" data-action="select-member" data-id="${esc(member.id)}">
              <img class="avatar sm" src="${esc(member.avatarUrl)}" alt="" />
              <div class="info"><div class="name">${esc(member.displayName)}</div><div class="username">@${esc(member.username)}${member.bot ? ' · бот' : ''}</div></div>
              ${member.timeoutUntil ? '<span class="badge badge-warn">мут</span>' : ''}
            </button>`,
          )
          .join('')
      : '<div class="empty-state" style="padding:26px 16px"><p>Никого не нашли. Попробуйте другой запрос.</p></div>'
    : '<div class="empty-state" style="padding:26px 16px"><p>Введите имя или ID участника, чтобы начать.</p></div>';

  return `
    <div class="page-head">
      <div><h1>Участники</h1><p>Профиль участника, история наказаний, варны и заметки. Действия сразу применяются в Discord.</p></div>
    </div>

    <div class="members-layout">
      <section class="panel">
        <form class="toolbar" data-form="member-search">
          <div class="search">${icon('search')}<input class="input" id="member-search" name="q" placeholder="Имя, ник или ID" value="${esc(members.query)}" /></div>
          <button class="btn btn-primary" type="submit">${icon('search')} Найти</button>
        </form>
        <div class="member-list">${list}</div>
      </section>

      <section class="panel" id="member-profile">
        ${selected ? renderMemberProfile(selected) : emptyState('Выберите участника', 'Результаты поиска появятся слева, а профиль — здесь.', 'users')}
      </section>
    </div>`;
}

function renderMemberProfile(member) {
  const can = access();
  const canModerate = can.admin || can.moderate;
  const tabs = [
    ['warns', `Варны (${member.warnings.length})`],
    ['notes', `Заметки (${member.notes.length})`],
    ['cases', `Кейсы (${member.cases.length})`],
  ];

  const actions = [];
  if (canModerate) {
    actions.push(actionButton('warn', 'Предупреждение', 'warn', 'btn'));
    actions.push(actionButton('note', 'Заметка', 'note', 'btn'));
    if (member.timeoutUntil)
      actions.push(actionButton('untimeout', 'Снять таймаут', 'clock', 'btn'));
    else actions.push(actionButton('timeout', 'Таймаут', 'clock', 'btn'));
  }
  if ((can.admin || can.kick) && member.inGuild) {
    actions.push(actionButton('kick', 'Кикнуть', 'kick', 'btn btn-danger'));
  }
  if (can.admin || can.ban) {
    if (member.banned)
      actions.push(actionButton('unban', 'Разбанить', 'shield', 'btn btn-success'));
    else actions.push(actionButton('ban', 'Забанить', 'ban', 'btn btn-danger'));
  }

  const timeout = member.timeoutUntil
    ? `<span class="badge badge-warn">до ${esc(fmtDate(member.timeoutUntil))}</span>`
    : '';
  const banBadge = member.banned ? '<span class="badge badge-danger">Забанен</span>' : '';
  const botBadge = member.bot ? '<span class="badge badge-neutral">Бот</span>' : '';
  const inGuildBadge = member.inGuild
    ? '<span class="badge badge-success">На сервере</span>'
    : '<span class="badge badge-neutral">Не на сервере</span>';

  return `
    <div class="profile-head">
      <img class="avatar xl" src="${esc(member.avatarUrl)}" alt="" />
      <div class="profile-info">
        <h2>${esc(member.displayName)} ${botBadge}${banBadge}${timeout}</h2>
        <div class="sub">@${esc(member.username)} · <span class="mono">${esc(member.id)}</span>
          <button class="icon-btn" type="button" data-action="copy" data-copy="${esc(member.id)}" title="Скопировать ID">${icon('copy')}</button>
        </div>
        <div class="chips" style="margin-top:8px">${inGuildBadge}${member.highestRole ? `<span class="chip">${esc(member.highestRole)}</span>` : ''}</div>
      </div>
    </div>

    <div class="profile-actions">${actions.join('') || '<span class="hint">Недостаточно прав для действий.</span>'}</div>

    <div class="detail-grid">
      <div class="detail"><span>Зашёл на сервер</span><b>${member.joinedAt ? esc(fmtDate(member.joinedAt)) : '—'}</b></div>
      <div class="detail"><span>Аккаунт создан</span><b>${esc(fmtDate(member.createdAt))}</b></div>
      <div class="detail"><span>Таймаут</span><b>${member.timeoutUntil ? esc(fmtDate(member.timeoutUntil)) : 'нет'}</b></div>
      <div class="detail"><span>Активных кейсов</span><b>${esc(member.activeCases.length)}</b></div>
    </div>

    ${
      member.roles.length
        ? `<div class="roles">${member.roles.map((role) => `<span class="role-chip" style="${roleStyle(role.color)}">${esc(role.name)}</span>`).join('')}</div>`
        : '<div class="roles"><span class="hint">Ролей нет.</span></div>'
    }

    <div class="tabs">
      ${tabs
        .map(
          ([id, label]) =>
            `<button class="tab ${state.members.tab === id ? 'active' : ''}" type="button" data-action="member-tab" data-tab="${id}">${esc(label)}</button>`,
        )
        .join('')}
    </div>

    <div class="list">${memberTabContent(member)}</div>`;
}

function actionButton(kind, label, iconName, classes) {
  return `<button class="${classes}" type="button" data-action="member-action" data-kind="${kind}" data-user="${esc(state.members.selected?.id ?? '')}">${icon(iconName)} ${esc(label)}</button>`;
}

function memberTabContent(member) {
  const canModerate = access().admin || access().moderate;

  if (state.members.tab === 'notes') {
    if (!member.notes.length)
      return emptyState('Заметок нет', 'Внутренние заметки не видны участнику.', 'note');
    return member.notes
      .map(
        (note) => `<div class="list-item">
          <div class="grow"><div class="title">${esc(note.text)}</div><div class="meta"><span class="mono">${esc(note.id)}</span><span>автор ${esc(note.authorId)}</span><span>${esc(fmtDate(note.createdAt))}</span></div></div>
          ${canModerate ? `<button class="icon-btn" type="button" data-action="delete-note" data-id="${esc(note.id)}" title="Удалить заметку">${icon('trash')}</button>` : ''}
        </div>`,
      )
      .join('');
  }

  if (state.members.tab === 'cases') {
    if (!member.cases.length) return emptyState('Кейсов нет', 'История модерации пуста.', 'cases');
    return `<div class="table-wrap"><table><thead><tr><th>#</th><th>Тип</th><th>Причина</th><th>Дата</th><th>Статус</th></tr></thead><tbody>
      ${member.cases
        .map(
          (item) => `<tr class="row-click" data-action="open-case" data-id="${esc(item.id)}">
            <td class="mono">#${esc(item.id)}</td>
            <td><span class="badge ${caseBadge(item.type)}">${esc(item.label ?? caseLabel(item.type))}</span></td>
            <td><div class="cell-reason">${esc(item.reason)}</div></td>
            <td>${esc(fmtDate(item.createdAt))}</td>
            <td>${item.active ? '<span class="badge badge-warn">Активен</span>' : '<span class="badge badge-neutral">Закрыт</span>'}</td>
          </tr>`,
        )
        .join('')}
    </tbody></table></div>`;
  }

  if (!member.warnings.length)
    return emptyState('Варнов нет', 'У участника чистая история предупреждений.', 'check');
  return member.warnings
    .map(
      (warn) => `<div class="list-item">
        <div class="grow"><div class="title">${esc(warn.reason)}</div><div class="meta"><span class="mono">${esc(warn.id)}</span><span>выдал ${esc(warn.moderatorId)}</span><span>${esc(fmtDate(warn.createdAt))}</span></div></div>
        ${canModerate ? `<button class="icon-btn" type="button" data-action="delete-warn" data-id="${esc(warn.id)}" title="Снять предупреждение">${icon('trash')}</button>` : ''}
      </div>`,
    )
    .join('');
}

async function selectMember(userId, options = {}) {
  if (!options.silent) {
    state.members.selected = { id: userId, loading: true };
    const profile = document.getElementById('member-profile');
    if (profile) profile.innerHTML = loadingPanel('Загружаем профиль…');
    else renderView();
  }

  try {
    const data = await api(`/api/guilds/${state.guildId}/members/${userId}`);
    state.members.selected = data.member;
    if (!options.keepTab) state.members.tab = 'warns';
  } catch (error) {
    state.members.selected = null;
    toast(error.message, 'error');
  }
  renderView();
}

function openMemberAction(kind, userId) {
  const member = state.members.selected;
  if (!member || member.id !== userId) return;

  const config = {
    warn: {
      title: 'Выдать предупреждение',
      body: `<div class="field"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required placeholder="За что выдаётся предупреждение"></textarea></div>`,
      label: 'Выдать варн',
      classes: 'btn btn-primary',
    },
    timeout: {
      title: 'Выдать таймаут',
      body: `<div class="form-grid">
        <div class="field"><label>Длительность</label><input class="input" name="duration" value="1h" required placeholder="1h" /><span class="hint">Например: 10m, 1h, 2d, 1w. Максимум 28 дней.</span></div>
        <div class="field"><label>Причина</label><input class="input" name="reason" maxlength="500" required placeholder="Причина таймаута" /></div>
      </div>`,
      label: 'Заглушить',
      classes: 'btn btn-primary',
    },
    untimeout: {
      title: 'Снять таймаут',
      body: `<div class="field"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required>Снятие таймаута через веб-панель</textarea></div>`,
      label: 'Снять таймаут',
      classes: 'btn btn-primary',
    },
    kick: {
      title: 'Кикнуть участника',
      body: `<div class="field"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required placeholder="Причина кика"></textarea></div>`,
      label: 'Кикнуть',
      classes: 'btn btn-danger',
    },
    ban: {
      title: 'Забанить участника',
      body: `<div class="form-grid">
        <div class="field"><label>Длительность</label><input class="input" name="duration" placeholder="пусто — навсегда" /><span class="hint">1h, 2d, 1w. Пусто — бессрочный бан.</span></div>
        <div class="field"><label>Удалить сообщения</label><select class="select" name="deleteSeconds">
          <option value="0">Не удалять</option><option value="3600">За 1 час</option><option value="86400">За 24 часа</option><option value="604800">За 7 дней</option>
        </select></div>
        <div class="field full"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required placeholder="Причина бана"></textarea></div>
      </div>`,
      label: 'Забанить',
      classes: 'btn btn-danger',
    },
    unban: {
      title: 'Разбанить участника',
      body: `<div class="field"><label>Причина</label><textarea class="textarea" name="reason" maxlength="500" required placeholder="Причина разбана"></textarea></div>`,
      label: 'Разбанить',
      classes: 'btn btn-success',
    },
    note: {
      title: 'Добавить заметку',
      body: `<div class="field"><label>Текст заметки</label><textarea class="textarea" name="text" maxlength="500" required placeholder="Внутренняя информация для staff"></textarea></div>`,
      label: 'Сохранить заметку',
      classes: 'btn btn-primary',
    },
  }[kind];

  if (!config) return;

  showModal({
    title: config.title,
    body: `<form data-form="member-action" data-kind="${esc(kind)}" data-user="${esc(userId)}">
      ${config.body}
      <div class="form-actions"><button class="${config.classes}" type="submit">${esc(config.label)}</button><button class="btn" type="button" data-action="close-modal">Отмена</button></div>
    </form>`,
  });
}

async function submitMemberAction(form) {
  const kind = form.dataset.kind;
  const userId = form.dataset.user;
  const data = new FormData(form);
  const body = { userId };

  for (const [key, value] of data.entries()) {
    if (key === 'deleteSeconds') body[key] = Number(value);
    else body[key] = String(value);
  }

  const result = await api(`/api/guilds/${state.guildId}/actions/${kind}`, {
    method: 'POST',
    body,
  });

  if (!result.ok) {
    toast(result.message ?? 'Discord отклонил действие.', 'error');
    return;
  }

  toast(result.message ?? 'Готово.', 'success');
  closeModal();
  await refreshOverview();
  await selectMember(userId, { silent: true, keepTab: true });
}

// ------------------------------------------------------------------- appeals

function renderAppealsView() {
  return `
    <div class="page-head">
      <div><h1>Апелляции</h1><p>Заявки участников на пересмотр наказаний. Одобрение снимает бан и мут.</p></div>
      <div class="spacer"></div>
      <div class="page-head-actions">
        <button class="btn" type="button" data-action="refresh">${icon('refresh')} Обновить</button>
      </div>
    </div>

    <div class="tabs" style="border:0;padding:0;margin-bottom:16px">
      <button class="tab ${state.appeals.status === 'pending' ? 'active' : ''}" type="button" data-action="appeals-tab" data-status="pending">Ожидают</button>
      <button class="tab ${state.appeals.status === 'all' ? 'active' : ''}" type="button" data-action="appeals-tab" data-status="all">Все апелляции</button>
    </div>

    ${appealsContent()}`;
}

function appealsContent() {
  if (!state.appeals.items) return loadingPanel('Загружаем апелляции…');
  if (state.appeals.items === 'error')
    return `<div class="panel"><div class="loading-panel"><p>Не удалось загрузить апелляции.</p><button class="btn btn-sm" type="button" data-action="refresh">Повторить</button></div></div>`;
  if (!state.appeals.items.length) {
    return `<div class="panel">${emptyState('Апелляций нет', state.appeals.status === 'pending' ? 'Ожидающих рассмотрения заявок нет.' : 'Апелляций пока не было.', 'appeals')}</div>`;
  }

  const canReview = access().admin || access().ban;
  return `<div class="appeal-grid">${state.appeals.items
    .map((appeal) => {
      const status =
        appeal.status === 'pending'
          ? '<span class="badge badge-warn">Ожидает</span>'
          : appeal.status === 'approved'
            ? '<span class="badge badge-success">Одобрена</span>'
            : '<span class="badge badge-danger">Отклонена</span>';

      return `<article class="appeal-card">
        <div class="appeal-head">
          <div class="topbar-icon" style="width:34px;height:34px;border-radius:10px">${icon('appeals')}</div>
          <div class="grow"><div class="name">Апелляция #${esc(appeal.id)}</div><div class="sub">пользователь <span class="mono">${esc(appeal.userId)}</span> · ${esc(fmtDate(appeal.createdAt))}</div></div>
          ${status}
        </div>
        <div class="appeal-reason">${esc(appeal.reason)}</div>
        ${
          appeal.status === 'pending'
            ? `<div class="appeal-actions"><span class="hint">${canReview ? 'Проверьте причину бана перед решением.' : 'Нужно право «Банить участников».'}</span><span class="spacer"></span>
                <button class="btn btn-sm btn-danger" type="button" data-action="review-appeal" data-id="${esc(appeal.id)}" data-approve="false" ${canReview ? '' : 'disabled'}>Отклонить</button>
                <button class="btn btn-sm btn-success" type="button" data-action="review-appeal" data-id="${esc(appeal.id)}" data-approve="true" ${canReview ? '' : 'disabled'}>Одобрить</button>
              </div>`
            : `<div class="hint">Рассмотрел: <span class="mono">${esc(appeal.reviewedBy ?? '—')}</span>${appeal.reviewedAt ? ` · ${esc(fmtDate(appeal.reviewedAt))}` : ''}</div>`
        }
      </article>`;
    })
    .join('')}</div>`;
}

function reviewAppeal(id, approve) {
  confirmAction({
    title: approve ? 'Одобрить апелляцию?' : 'Отклонить апелляцию?',
    message: approve
      ? 'Бот попробует снять бан и мут, уведомит участника и обновит сообщение в Discord.'
      : 'Участник получит уведомление об отказе. Наказание останется в силе.',
    label: approve ? 'Одобрить' : 'Отклонить',
    danger: !approve,
    onConfirm: async () => {
      const result = await api(`/api/guilds/${state.guildId}/appeals/${id}/review`, {
        method: 'POST',
        body: { approve },
      });
      toast(result.message ?? 'Готово.', 'success');
      await fetchAppeals();
      await refreshOverview();
    },
  });
}

// ------------------------------------------------------------------ settings

function renderSettingsView() {
  if (!access().admin) {
    return `<div class="page-head"><div><h1>Настройки</h1><p>Доступ только для права «Управление сервером».</p></div></div>
      <div class="panel">${emptyState('Недостаточно прав', 'Попросите администратора выдать право «Управление сервером».', 'settings')}</div>`;
  }

  if (state.settingsError) {
    return `<div class="page-head"><div><h1>Настройки</h1></div></div><div class="panel"><div class="loading-panel"><p>${esc(state.settingsError)}</p><button class="btn btn-sm" type="button" data-action="reload-settings">Повторить</button></div></div>`;
  }

  if (!state.settings) return loadingPanel('Загружаем настройки…');

  const tabs = [
    ['moderation', 'Модерация'],
    ['logs', 'Логи'],
    ['security', 'Безопасность'],
    ['community', 'Сообщество'],
  ];

  const content = {
    moderation: renderModerationSettings,
    logs: renderLogSettings,
    security: renderSecuritySettings,
    community: renderCommunitySettings,
  }[state.settingsTab];

  return `
    <div class="page-head">
      <div><h1>Настройки</h1><p>Автомодерация, наказания, логи, защита и community-модули сервера.</p></div>
    </div>
    <div class="settings-tabs">
      ${tabs
        .map(
          ([id, label]) =>
            `<button class="${state.settingsTab === id ? 'active' : ''}" type="button" data-action="settings-tab" data-tab="${id}">${esc(label)}</button>`,
        )
        .join('')}
    </div>
    ${content()}`;
}

function channelOptions(selected, kind) {
  const channels = state.meta.channels.filter((channel) => {
    if (kind === 'voice') return channel.isVoice;
    if (kind === 'category') return channel.isCategory;
    return channel.isText && !channel.isCategory;
  });
  return `<option value="">— не выбран —</option>${channels
    .map(
      (channel) =>
        `<option value="${esc(channel.id)}" ${selected === channel.id ? 'selected' : ''}>${esc(channel.name)}</option>`,
    )
    .join('')}`;
}

function roleOptions(selected, options = {}) {
  const roles = state.meta.roles.filter(
    (role) => !role.isEveryone && (options.managed ? true : !role.managed),
  );
  return `<option value="">— не выбран —</option>${roles
    .map(
      (role) =>
        `<option value="${esc(role.id)}" ${selected === role.id ? 'selected' : ''}>${esc(role.name)}</option>`,
    )
    .join('')}`;
}

function rolePicker(name, selectedIds) {
  const roles = state.meta.roles.filter((role) => !role.isEveryone && !role.managed);
  if (!roles.length) return '<div class="hint">На сервере нет подходящих ролей.</div>';
  return `<div class="role-picker">${roles
    .map(
      (role) =>
        `<label><input type="checkbox" name="${esc(name)}" value="${esc(role.id)}" ${selectedIds.includes(role.id) ? 'checked' : ''} /><span>${esc(role.name)}</span></label>`,
    )
    .join('')}</div>`;
}

function renderModerationSettings() {
  const moderation = state.settings.moderation;
  const automod = moderation.automod;
  const rules = moderation.warnActions;

  return `
    <div class="settings-grid">
      <section class="panel">
        <form data-form="settings-automod">
          <div class="settings-section">
            <div class="section-head">
              <div class="grow"><h3>Автомодерация</h3><p>Фильтры срабатывают на сообщения участников без модераторских прав. При нарушении бот удаляет сообщение и выдаёт варн.</p></div>
              <label class="switch"><input type="checkbox" name="enabled" ${automod.enabled ? 'checked' : ''} /><span class="track"></span></label>
            </div>
            <div class="check-grid">
              ${automodCheckbox('invites', 'Приглашения', 'Ссылки на другие серверы', automod.invites)}
              ${automodCheckbox('links', 'Ссылки', 'Любые внешние ссылки', automod.links)}
              ${automodCheckbox('caps', 'КАПС', 'Сообщения капсом', automod.caps)}
              ${automodCheckbox('spam', 'Спам', 'Повторяющиеся сообщения', automod.spam)}
            </div>
            <div class="form-grid" style="margin-top:14px">
              <div class="field"><label>Лимит упоминаний</label><input class="input" type="number" name="mentions" min="0" max="100" value="${esc(automod.mentions)}" /><span class="hint">0 — проверка упоминаний выключена.</span></div>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button></div>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Стоп-слова</h3><p>Слова и фразы, за которые автомодерация удаляет сообщение и выдаёт варн.</p></div></div>
          <div class="inline-form">
            <input class="input" id="word-input" placeholder="Новое стоп-слово" maxlength="100" />
            <button class="btn btn-primary" type="button" data-action="add-word">Добавить</button>
          </div>
          <div class="chips" style="margin-top:12px">
            ${
              automod.words.length
                ? automod.words
                    .map(
                      (word) =>
                        `<span class="chip">${esc(word)}<button class="icon-btn" style="width:18px;height:18px" type="button" data-action="remove-word" data-word="${esc(word)}" title="Удалить">${icon('close')}</button></span>`,
                    )
                    .join('')
                : '<span class="hint">Стоп-слов пока нет.</span>'
            }
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="settings-section">
          <div class="section-head">
            <div class="grow"><h3>Автонаказания по варнам</h3><p>Срабатывает первое правило, у которого количество свежих варнов совпало с порогом.</p></div>
            <button class="btn btn-sm btn-primary" type="button" data-action="add-warn-action">Добавить правило</button>
          </div>
          ${
            rules.length
              ? `<div class="rule-list">${rules
                  .map(
                    (rule) => `<div class="rule-item">
                      <span class="badge badge-info">${esc(rule.count)} варн.</span>
                      <div class="grow">за ${esc(rule.windowDays)} дн. → <b>${esc(WARN_ACTION_LABELS[rule.action] ?? rule.action)}</b>${rule.durationMs ? ` на ${esc(fmtDuration(rule.durationMs))}` : ''}</div>
                      <button class="icon-btn" type="button" data-action="remove-warn-action" data-id="${esc(rule.id)}" title="Удалить правило">${icon('trash')}</button>
                    </div>`,
                  )
                  .join('')}</div>
                <div class="form-actions"><button class="btn btn-sm btn-ghost" type="button" data-action="clear-warn-actions">Удалить все правила</button></div>`
              : '<div class="hint">Правил нет. Наказания по варнам не применяются.</div>'
          }
        </div>
      </section>

      <section class="panel">
        <form data-form="settings-base">
          <div class="settings-section">
            <div class="section-head"><div class="grow"><h3>Каналы и роли модерации</h3><p>Куда отправлять жалобы и апелляции, какую роль выдавать при муте.</p></div></div>
            <div class="form-grid">
              <div class="field"><label>Канал жалоб</label><select class="select" name="reportChannelId">${channelOptions(moderation.reportChannelId, 'text')}</select></div>
              <div class="field"><label>Канал апелляций</label><select class="select" name="appealChannelId">${channelOptions(moderation.appealChannelId, 'text')}</select></div>
              <div class="field"><label>Роль мута</label><select class="select" name="muteRoleId">${roleOptions(moderation.muteRoleId)}</select></div>
              <div class="field"><label>Срок жизни варнов, дней</label><input class="input" type="number" name="warnExpiryDays" min="0" max="365" value="${esc(moderation.warnExpiryDays)}" /><span class="hint">0 — варны не истекают.</span></div>
            </div>
          </div>
          <div class="settings-section">
            <div class="section-head"><div class="grow"><h3>Иммунитет</h3><p>Участники с этими ролями не могут быть наказаны командами бота и из панели.</p></div></div>
            ${rolePicker('immunity', moderation.immunityRoles)}
            <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button></div>
          </div>
        </form>
      </section>
    </div>`;
}

function automodCheckbox(name, label, sub, checked) {
  return `<label class="checkbox"><input type="checkbox" name="${esc(name)}" ${checked ? 'checked' : ''} /><span>${esc(label)}<small class="check-sub">${esc(sub)}</small></span></label>`;
}

function renderLogSettings() {
  const logs = state.settings.logs;
  const catalog = state.settings.catalog;
  const categories = catalog.logCategories;
  const events = catalog.logEvents;

  const groups = new Map();
  for (const [key, meta] of Object.entries(events)) {
    if (!groups.has(meta.category)) groups.set(meta.category, []);
    groups.get(meta.category).push({ key, label: meta.label });
  }

  const categoryChecks = Object.entries(categories)
    .map(
      ([key, label]) =>
        `<label class="checkbox"><input type="checkbox" name="category:${esc(key)}" ${logs.categories[key] ? 'checked' : ''} /><span>${esc(label)}</span></label>`,
    )
    .join('');

  const eventGroups = [...groups.entries()]
    .map(([category, list]) => {
      const label = categories[category] ?? category;
      return `<div class="event-group">
        <div class="event-group-head"><span>${esc(label)}</span><span class="spacer"></span><button class="btn btn-sm btn-ghost" type="button" data-action="toggle-events" data-group="${esc(category)}">Переключить все</button></div>
        <div class="event-list">${list
          .map(
            (event) =>
              `<label class="checkbox"><input type="checkbox" data-group="${esc(category)}" name="event:${esc(event.key)}" ${logs.events[event.key] ? 'checked' : ''} /><span>${esc(event.label)}</span></label>`,
          )
          .join('')}</div>
      </div>`;
    })
    .join('');

  return `
    <form data-form="settings-logs" class="settings-grid">
      <section class="panel">
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Канал логов</h3><p>Все события отправляются в выбранный текстовый канал. Без канала логирование выключено.</p></div></div>
          <div class="form-grid"><div class="field"><label>Канал</label><select class="select" name="channelId">${channelOptions(logs.channelId, 'text')}</select></div></div>
        </div>
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Категории</h3><p>Быстрое включение и выключение групп событий.</p></div><button class="btn btn-sm" type="button" data-action="toggle-categories">Переключить все</button></div>
          <div class="check-grid" id="log-categories">${categoryChecks}</div>
        </div>
      </section>

      <section class="panel">
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>События</h3><p>Точечная настройка. Категория должна быть включена, чтобы событие отправилось в канал.</p></div></div>
          ${eventGroups}
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">Сохранить</button>
            <button class="btn btn-ghost" type="button" data-action="reset-logs">Сбросить фильтры</button>
          </div>
        </div>
      </section>
    </form>`;
}

function renderSecuritySettings() {
  const security = state.settings.security;
  const raid = security.raid;
  const nuke = security.nuke;

  return `
    <form data-form="settings-security" class="settings-grid">
      <section class="panel">
        <div class="settings-section">
          <div class="section-head">
            <div class="grow"><h3>Антирейд</h3><p>Реагирует на массовые заходы и молодые аккаунты. При срабатывании применяет выбранное действие к новым участникам.</p></div>
            <label class="switch"><input type="checkbox" name="raid.enabled" ${raid.enabled ? 'checked' : ''} /><span class="track"></span></label>
          </div>
          <div class="form-grid">
            <div class="field"><label>Порог заходов</label><input class="input" type="number" name="raid.joinThreshold" min="1" max="1000" value="${esc(raid.joinThreshold)}" /></div>
            <div class="field"><label>Окно, секунд</label><input class="input" type="number" name="raid.joinWindowSec" min="5" max="3600" value="${esc(raid.joinWindowSec)}" /></div>
            <div class="field"><label>Мин. возраст аккаунта, дней</label><input class="input" type="number" name="raid.accountAgeDays" min="0" max="365" value="${esc(raid.accountAgeDays)}" /></div>
            <div class="field"><label>Действие</label><select class="select" name="raid.action">
              ${selectOption('alert', 'Только уведомление', raid.action)}${selectOption('kick', 'Кик', raid.action)}${selectOption('ban', 'Бан', raid.action)}
            </select></div>
            <div class="field"><label>Длительность режима, секунд</label><input class="input" type="number" name="raid.durationSec" min="30" max="86400" value="${esc(raid.durationSec)}" /></div>
            <label class="checkbox" style="align-self:end"><input type="checkbox" name="raid.ignoreBots" ${raid.ignoreBots ? 'checked' : ''} /><span>Игнорировать ботов<small class="check-sub">Заходы ботов не считаются рейдом.</small></span></label>
          </div>
        </div>
      </section>

      <section class="panel">
        <div class="settings-section">
          <div class="section-head">
            <div class="grow"><h3>Анти-нак</h3><p>Следит за массовыми разрушительными действиями через Audit Log и наказывает исполнителя.</p></div>
            <label class="switch"><input type="checkbox" name="nuke.enabled" ${nuke.enabled ? 'checked' : ''} /><span class="track"></span></label>
          </div>
          <div class="form-grid">
            <div class="field"><label>Порог действий</label><input class="input" type="number" name="nuke.threshold" min="1" max="100" value="${esc(nuke.threshold)}" /></div>
            <div class="field"><label>Окно, секунд</label><input class="input" type="number" name="nuke.windowSec" min="5" max="3600" value="${esc(nuke.windowSec)}" /></div>
            <div class="field"><label>Действие</label><select class="select" name="nuke.action">
              ${selectOption('alert', 'Только уведомление', nuke.action)}${selectOption('timeout', 'Таймаут 1 час', nuke.action)}${selectOption('kick', 'Кик', nuke.action)}${selectOption('ban', 'Бан', nuke.action)}
            </select></div>
            <label class="checkbox" style="align-self:end"><input type="checkbox" name="nuke.ignoreAdmins" ${nuke.ignoreAdmins ? 'checked' : ''} /><span>Игнорировать администраторов<small class="check-sub">Не наказывать администраторов автоматически.</small></span></label>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button></div>
        </div>
      </section>
    </form>`;
}

function selectOption(value, label, selected) {
  return `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`;
}

function renderCommunitySettings() {
  const community = state.settings.community;
  return `
    <form data-form="settings-community" class="settings-grid">
      <section class="panel">
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Приветствия и прощания</h3><p>Шаблоны: <code>{user}</code>, <code>{guild}</code>, <code>{memberCount}</code>.</p></div></div>
          <div class="form-grid">
            <div class="field"><label>Канал приветствий</label><select class="select" name="welcomeChannelId">${channelOptions(community.welcomeChannelId, 'text')}</select></div>
            <div class="field"><label>Канал прощаний</label><select class="select" name="goodbyeChannelId">${channelOptions(community.goodbyeChannelId, 'text')}</select></div>
            <div class="field full"><label>Приветствие</label><textarea class="textarea" name="welcomeMessage" maxlength="1000">${esc(community.welcomeMessage)}</textarea></div>
            <div class="field full"><label>Прощание</label><textarea class="textarea" name="goodbyeMessage" maxlength="1000">${esc(community.goodbyeMessage)}</textarea></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Автороли</h3><p>Роли, которые выдаются участнику при входе на сервер.</p></div></div>
          ${rolePicker('autoroles', community.autoroleIds)}
        </div>
      </section>

      <section class="panel">
        <div class="settings-section">
          <div class="section-head">
            <div class="grow"><h3>Уровни</h3><p>XP за сообщения, команды /rank и /top.</p></div>
            <label class="switch"><input type="checkbox" name="levelingEnabled" ${community.levelingEnabled ? 'checked' : ''} /><span class="track"></span></label>
          </div>
          <div class="form-grid">
            <div class="field"><label>Канал уведомлений об уровне</label><select class="select" name="levelupChannelId">${channelOptions(community.levelupChannelId, 'text')}</select></div>
            <div class="field full"><label>Сообщение об уровне</label><input class="input" name="levelupMessage" maxlength="1000" value="${esc(community.levelupMessage)}" /></div>
          </div>
        </div>
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Временные голосовые</h3><p>Канал, при входе в который создаётся личная голосовая комната.</p></div></div>
          <div class="form-grid"><div class="field"><label>Голосовой канал</label><select class="select" name="tempVoiceChannelId">${channelOptions(community.tempVoiceChannelId, 'voice')}</select></div></div>
        </div>
        <div class="settings-section">
          <div class="section-head"><div class="grow"><h3>Тикеты</h3><p>Категория и служебные каналы для системы поддержки.</p></div></div>
          <div class="form-grid">
            <div class="field"><label>Категория тикетов</label><select class="select" name="ticketCategoryId">${channelOptions(community.ticketCategoryId, 'category')}</select></div>
            <div class="field"><label>Канал логов тикетов</label><select class="select" name="ticketLogChannelId">${channelOptions(community.ticketLogChannelId, 'text')}</select></div>
            <div class="field"><label>Роль поддержки</label><select class="select" name="ticketSupportRoleId">${roleOptions(community.ticketSupportRoleId)}</select></div>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Сохранить</button></div>
        </div>
      </section>
    </form>`;
}

function formValue(form, name) {
  const element = form.elements.namedItem(name);
  return element && 'value' in element ? element.value : '';
}

function formChecked(form, name) {
  const element = form.elements.namedItem(name);
  return Boolean(element && 'checked' in element && element.checked);
}

function checkedValues(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}

// ---------------------------------------------------------------- data flows

async function refreshOverview() {
  try {
    state.overview = await api(`/api/guilds/${state.guildId}/overview`);
    const badge = document.querySelector('.nav-item[data-view="appeals"] .count');
    if (badge) {
      const count = pendingAppeals();
      badge.textContent = String(count);
      badge.style.display = count > 0 ? '' : 'none';
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function fetchAppeals() {
  const status = state.appeals.status === 'all' ? 'all' : 'pending';
  try {
    const data = await api(`/api/guilds/${state.guildId}/appeals?status=${status}`);
    state.appeals.items = data.items;
  } catch (error) {
    state.appeals.items = 'error';
    toast(error.message, 'error');
  }
}

async function fetchSettings() {
  state.settingsError = null;
  try {
    state.settings = await api(`/api/guilds/${state.guildId}/settings`);
  } catch (error) {
    state.settingsError = error.message;
  }
}

async function loadGuildData(guildId) {
  const [meta, overview] = await Promise.all([
    api(`/api/guilds/${guildId}/meta`),
    api(`/api/guilds/${guildId}/overview`),
  ]);
  state.meta = meta;
  state.overview = overview;
}

async function activateGuild(guildId) {
  state.guildId = guildId;
  localStorage.setItem('pp_guild', guildId);
  state.meta = null;
  state.overview = null;
  state.cases = null;
  state.settings = null;
  state.settingsError = null;
  state.appeals = { status: 'pending', items: null };
  state.members = { query: '', items: null, selected: null, tab: 'warns', loading: false };
  state.caseFilters = { q: '', type: '', active: '', page: 1 };
  state.loadingGuild = true;
  renderShell();

  try {
    await loadGuildData(guildId);
  } catch (error) {
    state.loadingGuild = false;
    toast(error.message, 'error');
    state.overview = null;
    renderFatal(error.message);
    return;
  }

  state.loadingGuild = false;
  renderShell();
  await ensureView();
}

async function ensureView() {
  if (!state.meta || !state.overview) {
    renderView();
    return;
  }

  const view = state.view;

  if (view === 'cases' && !state.cases) {
    state.loadingView = true;
    renderView();
    await fetchCases();
    state.loadingView = false;
    renderView();
    return;
  }

  if (view === 'appeals' && !state.appeals.items) {
    state.loadingView = true;
    renderView();
    await fetchAppeals();
    state.loadingView = false;
    renderView();
    return;
  }

  if (view === 'settings' && !state.settings && !state.settingsError) {
    state.loadingView = true;
    renderView();
    await fetchSettings();
    state.loadingView = false;
    renderView();
    return;
  }

  renderView();
}

// ------------------------------------------------------------------- routing

const VIEWS = ['dashboard', 'cases', 'members', 'appeals', 'settings'];

function parseRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [rawView, rawTab] = hash.split('/');
  state.view = VIEWS.includes(rawView) ? rawView : 'dashboard';
  if (state.view === 'settings') {
    const tabs = ['moderation', 'logs', 'security', 'community'];
    state.settingsTab = tabs.includes(rawTab) ? rawTab : 'moderation';
  }
}

async function handleRoute() {
  parseRoute();
  state.sidebarOpen = false;
  renderShell();
  await ensureView();
}

function navigate(view, tab) {
  const hash = tab ? `#/${view}/${tab}` : `#/${view}`;
  if (window.location.hash === hash) {
    handleRoute();
  } else {
    window.location.hash = hash;
  }
}

// -------------------------------------------------------------------- events

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  if (action === 'toggle-sidebar') {
    state.sidebarOpen = !state.sidebarOpen;
    renderShell();
    return;
  }

  if (action === 'nav') {
    navigate(target.dataset.view ?? 'dashboard');
    return;
  }

  if (action === 'logout') {
    void logout();
    return;
  }

  if (action === 'close-modal') {
    closeModal();
    return;
  }

  if (action === 'modal-confirm') {
    const handler = state.confirmHandler;
    closeModal();
    if (handler) {
      Promise.resolve()
        .then(handler)
        .catch((error) => toast(error.message, 'error'));
    }
    return;
  }

  if (action === 'refresh') {
    void (async () => {
      await refreshOverview();
      if (state.view === 'cases') await fetchCases();
      if (state.view === 'appeals') await fetchAppeals();
      if (state.view === 'settings') {
        state.settings = null;
        await fetchSettings();
      }
      renderView();
    })();
    return;
  }

  if (action === 'open-case') {
    void openCaseModal(target.dataset.id);
    return;
  }

  if (action === 'case-page') {
    state.caseFilters.page = Number(target.dataset.page) || 1;
    void (async () => {
      await fetchCases();
      renderCasesResult();
    })();
    return;
  }

  if (action === 'cases-reset') {
    state.caseFilters = { q: '', type: '', active: '', page: 1 };
    void (async () => {
      await fetchCases();
      renderView();
    })();
    return;
  }

  if (action === 'select-member') {
    void selectMember(target.dataset.id);
    return;
  }

  if (action === 'member-action') {
    openMemberAction(target.dataset.kind, target.dataset.user);
    return;
  }

  if (action === 'member-tab') {
    state.members.tab = target.dataset.tab ?? 'warns';
    renderView();
    return;
  }

  if (action === 'delete-warn') {
    const userId = state.members.selected?.id;
    if (!userId) return;
    confirmAction({
      title: 'Снять предупреждение?',
      message: 'Варн будет удалён, связанный кейс закроется. Действие попадёт в логи.',
      label: 'Снять варн',
      danger: true,
      onConfirm: async () => {
        const result = await api(
          `/api/guilds/${state.guildId}/warns/${userId}/${encodeURIComponent(target.dataset.id)}`,
          { method: 'DELETE' },
        );
        toast(result.message ?? 'Предупреждение снято.', 'success');
        await refreshOverview();
        await selectMember(userId, { silent: true, keepTab: true });
      },
    });
    return;
  }

  if (action === 'delete-note') {
    const userId = state.members.selected?.id;
    if (!userId) return;
    confirmAction({
      title: 'Удалить заметку?',
      message: 'Заметка будет удалена из профиля участника.',
      label: 'Удалить',
      danger: true,
      onConfirm: async () => {
        const result = await api(
          `/api/guilds/${state.guildId}/notes/${userId}/${encodeURIComponent(target.dataset.id)}`,
          { method: 'DELETE' },
        );
        toast(result.message ?? 'Заметка удалена.', 'success');
        await selectMember(userId, { silent: true, keepTab: true });
      },
    });
    return;
  }

  if (action === 'appeals-tab') {
    state.appeals.status = target.dataset.status ?? 'pending';
    state.appeals.items = null;
    renderView();
    void (async () => {
      state.loadingView = true;
      renderView();
      await fetchAppeals();
      state.loadingView = false;
      renderView();
    })();
    return;
  }

  if (action === 'review-appeal') {
    reviewAppeal(Number(target.dataset.id), target.dataset.approve === 'true');
    return;
  }

  if (action === 'settings-tab') {
    navigate('settings', target.dataset.tab ?? 'moderation');
    return;
  }

  if (action === 'reload-settings') {
    state.settings = null;
    state.settingsError = null;
    void ensureView();
    return;
  }

  if (action === 'add-word') {
    const input = document.getElementById('word-input');
    const word = input?.value.trim();
    if (!word) {
      toast('Введите стоп-слово.', 'error');
      return;
    }
    void (async () => {
      const data = await api(`/api/guilds/${state.guildId}/settings/moderation/words`, {
        method: 'POST',
        body: { word },
      });
      state.settings.moderation = data.moderation;
      toast('Стоп-слово добавлено.', 'success');
      renderView();
    })().catch((error) => toast(error.message, 'error'));
    return;
  }

  if (action === 'remove-word') {
    void (async () => {
      const word = target.dataset.word ?? '';
      const data = await api(
        `/api/guilds/${state.guildId}/settings/moderation/words/${encodeURIComponent(word)}`,
        { method: 'DELETE' },
      );
      state.settings.moderation = data.moderation;
      toast('Стоп-слово удалено.', 'success');
      renderView();
    })().catch((error) => toast(error.message, 'error'));
    return;
  }

  if (action === 'add-warn-action') {
    openWarnActionModal();
    return;
  }

  if (action === 'remove-warn-action') {
    void (async () => {
      const data = await api(
        `/api/guilds/${state.guildId}/settings/moderation/warn-actions/${encodeURIComponent(target.dataset.id)}`,
        { method: 'DELETE' },
      );
      state.settings.moderation = data.moderation;
      toast('Правило удалено.', 'success');
      renderView();
    })().catch((error) => toast(error.message, 'error'));
    return;
  }

  if (action === 'clear-warn-actions') {
    confirmAction({
      title: 'Удалить все правила?',
      message: 'Автонаказания по варнам перестанут применяться.',
      label: 'Удалить все',
      danger: true,
      onConfirm: async () => {
        const data = await api(`/api/guilds/${state.guildId}/settings/moderation/warn-actions`, {
          method: 'DELETE',
        });
        state.settings.moderation = data.moderation;
        toast('Все правила удалены.', 'success');
        renderView();
      },
    });
    return;
  }

  if (action === 'toggle-categories') {
    const boxes = [...document.querySelectorAll('#log-categories input[type="checkbox"]')];
    const all = boxes.every((box) => box.checked);
    for (const box of boxes) box.checked = !all;
    return;
  }

  if (action === 'toggle-events') {
    const group = target.dataset.group;
    const boxes = [...document.querySelectorAll(`input[data-group="${group}"][type="checkbox"]`)];
    const all = boxes.every((box) => box.checked);
    for (const box of boxes) box.checked = !all;
    return;
  }

  if (action === 'reset-logs') {
    confirmAction({
      title: 'Сбросить фильтры логов?',
      message: 'Категории и события вернутся к значениям по умолчанию.',
      label: 'Сбросить',
      danger: true,
      onConfirm: async () => {
        const data = await api(`/api/guilds/${state.guildId}/settings/logs`, {
          method: 'PATCH',
          body: { reset: true },
        });
        state.settings.logs = data.logs;
        toast('Фильтры сброшены.', 'success');
        renderView();
      },
    });
    return;
  }

  if (action === 'copy') {
    const value = target.dataset.copy ?? '';
    if (!value) return;
    navigator.clipboard
      ?.writeText(value)
      .then(() => toast('ID скопирован.', 'success', 2000))
      .catch(() => toast('Не удалось скопировать.', 'error'));
    return;
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;

  if (target.matches('[data-change="guild"]')) {
    void activateGuild(target.value);
    return;
  }

  if (target.matches('[data-change="case-type"]')) {
    state.caseFilters.type = target.value;
    state.caseFilters.page = 1;
    void (async () => {
      await fetchCases();
      renderCasesResult();
    })();
    return;
  }

  if (target.matches('[data-change="case-active"]')) {
    state.caseFilters.active = target.value;
    state.caseFilters.page = 1;
    void (async () => {
      await fetchCases();
      renderCasesResult();
    })();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'case-search') {
    state.caseFilters.q = event.target.value;
    state.caseFilters.page = 1;
    debounce(() => {
      void (async () => {
        await fetchCases();
        renderCasesResult();
      })();
    });
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();

  const kind = form.dataset.form;
  const submit = form.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;

  const finish = () => {
    if (submit) submit.disabled = false;
  };

  const run = async () => {
    if (kind === 'member-search') {
      const query = formValue(form, 'q').trim();
      state.members.query = query;
      state.members.items = null;
      state.members.selected = null;
      renderView();
      if (!query) return;
      const data = await api(`/api/guilds/${state.guildId}/members?q=${encodeURIComponent(query)}`);
      state.members.items = data.items;
      renderView();
      return;
    }

    if (kind === 'member-action') {
      await submitMemberAction(form);
      return;
    }

    if (kind === 'case-edit') {
      const reason = formValue(form, 'reason').trim();
      const active = formChecked(form, 'active');
      const data = await api(
        `/api/guilds/${state.guildId}/cases/${encodeURIComponent(form.dataset.id)}`,
        { method: 'PATCH', body: { reason, active } },
      );
      toast('Кейс обновлён.', 'success');
      closeModal();
      if (state.cases && state.cases !== 'error') {
        const index = state.cases.items.findIndex((item) => item.id === data.case.id);
        if (index >= 0) state.cases.items[index] = data.case;
      }
      await refreshOverview();
      if (state.members.selected && state.members.selected.id === data.case.userId) {
        await selectMember(data.case.userId, { silent: true, keepTab: true });
      } else {
        renderView();
      }
      return;
    }

    if (kind === 'warn-action') {
      const data = await api(`/api/guilds/${state.guildId}/settings/moderation/warn-actions`, {
        method: 'POST',
        body: {
          count: Number(formValue(form, 'count')),
          windowDays: Number(formValue(form, 'windowDays')),
          action: formValue(form, 'action'),
          duration: formValue(form, 'duration'),
        },
      });
      state.settings.moderation = data.moderation;
      toast('Правило добавлено.', 'success');
      closeModal();
      renderView();
      return;
    }

    if (kind === 'settings-automod') {
      const body = {
        automod: {
          enabled: formChecked(form, 'enabled'),
          invites: formChecked(form, 'invites'),
          links: formChecked(form, 'links'),
          caps: formChecked(form, 'caps'),
          spam: formChecked(form, 'spam'),
          mentions: Number(formValue(form, 'mentions')),
        },
      };
      const data = await api(`/api/guilds/${state.guildId}/settings/moderation`, {
        method: 'PATCH',
        body,
      });
      state.settings.moderation = data.moderation;
      toast('Автомодерация сохранена.', 'success');
      renderView();
      return;
    }

    if (kind === 'settings-base') {
      const body = {
        warnExpiryDays: Number(formValue(form, 'warnExpiryDays')),
        reportChannelId: formValue(form, 'reportChannelId') || null,
        appealChannelId: formValue(form, 'appealChannelId') || null,
        muteRoleId: formValue(form, 'muteRoleId') || null,
        immunityRoles: checkedValues(form, 'immunity'),
      };
      const data = await api(`/api/guilds/${state.guildId}/settings/moderation`, {
        method: 'PATCH',
        body,
      });
      state.settings.moderation = data.moderation;
      toast('Настройки модерации сохранены.', 'success');
      renderView();
      return;
    }

    if (kind === 'settings-logs') {
      const categories = {};
      const events = {};
      const entries = [...form.querySelectorAll('input[type="checkbox"]')];
      for (const input of entries) {
        if (input.name.startsWith('category:')) categories[input.name.slice(9)] = input.checked;
        if (input.name.startsWith('event:')) events[input.name.slice(6)] = input.checked;
      }
      const data = await api(`/api/guilds/${state.guildId}/settings/logs`, {
        method: 'PATCH',
        body: { channelId: formValue(form, 'channelId') || null, categories, events },
      });
      state.settings.logs = data.logs;
      toast('Логи сохранены.', 'success');
      renderView();
      return;
    }

    if (kind === 'settings-security') {
      const body = {
        raid: {
          enabled: formChecked(form, 'raid.enabled'),
          joinThreshold: Number(formValue(form, 'raid.joinThreshold')),
          joinWindowSec: Number(formValue(form, 'raid.joinWindowSec')),
          accountAgeDays: Number(formValue(form, 'raid.accountAgeDays')),
          action: formValue(form, 'raid.action'),
          durationSec: Number(formValue(form, 'raid.durationSec')),
          ignoreBots: formChecked(form, 'raid.ignoreBots'),
        },
        nuke: {
          enabled: formChecked(form, 'nuke.enabled'),
          threshold: Number(formValue(form, 'nuke.threshold')),
          windowSec: Number(formValue(form, 'nuke.windowSec')),
          action: formValue(form, 'nuke.action'),
          ignoreAdmins: formChecked(form, 'nuke.ignoreAdmins'),
        },
      };
      const data = await api(`/api/guilds/${state.guildId}/settings/security`, {
        method: 'PATCH',
        body,
      });
      state.settings.security = data.security;
      toast('Настройки безопасности сохранены.', 'success');
      renderView();
      return;
    }

    if (kind === 'settings-community') {
      const body = {
        welcomeChannelId: formValue(form, 'welcomeChannelId') || null,
        welcomeMessage: formValue(form, 'welcomeMessage'),
        goodbyeChannelId: formValue(form, 'goodbyeChannelId') || null,
        goodbyeMessage: formValue(form, 'goodbyeMessage'),
        autoroleIds: checkedValues(form, 'autoroles'),
        levelingEnabled: formChecked(form, 'levelingEnabled'),
        levelupChannelId: formValue(form, 'levelupChannelId') || null,
        levelupMessage: formValue(form, 'levelupMessage'),
        tempVoiceChannelId: formValue(form, 'tempVoiceChannelId') || null,
        ticketCategoryId: formValue(form, 'ticketCategoryId') || null,
        ticketLogChannelId: formValue(form, 'ticketLogChannelId') || null,
        ticketSupportRoleId: formValue(form, 'ticketSupportRoleId') || null,
      };
      const data = await api(`/api/guilds/${state.guildId}/settings/community`, {
        method: 'PATCH',
        body,
      });
      state.settings.community = data.community;
      toast('Настройки сообщества сохранены.', 'success');
      renderView();
    }
  };

  run()
    .catch((error) => toast(error.message, 'error'))
    .finally(finish);
});

function openWarnActionModal() {
  showModal({
    title: 'Новое правило автонаказания',
    body: `<form data-form="warn-action">
      <div class="form-grid">
        <div class="field"><label>Количество варнов</label><input class="input" type="number" name="count" min="1" max="100" value="3" required /></div>
        <div class="field"><label>Окно, дней</label><input class="input" type="number" name="windowDays" min="1" max="365" value="7" required /></div>
        <div class="field"><label>Действие</label><select class="select" name="action">${Object.entries(
          WARN_ACTION_LABELS,
        )
          .map(([value, label]) => `<option value="${esc(value)}">${esc(label)}</option>`)
          .join('')}</select></div>
        <div class="field"><label>Длительность</label><input class="input" name="duration" placeholder="1h" /><span class="hint">Нужна для таймаута, мута и временного бана.</span></div>
      </div>
      <div class="form-actions"><button class="btn btn-primary" type="submit">Добавить</button><button class="btn" type="button" data-action="close-modal">Отмена</button></div>
    </form>`,
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

window.addEventListener('hashchange', () => {
  void handleRoute();
});

// ----------------------------------------------------------------------- boot

async function boot() {
  parseRoute();

  try {
    const me = await api('/api/me');
    state.me = me;
    if (!me.guilds.length) {
      renderNoAccess();
      return;
    }

    const saved = localStorage.getItem('pp_guild');
    const guildId = me.guilds.some((guild) => guild.id === saved) ? saved : me.guilds[0].id;
    await activateGuild(guildId);
  } catch (error) {
    if (error.status === 401) {
      renderLogin();
      return;
    }
    renderFatal(error.message);
  }
}

void boot();
