import {
  ClipboardList,
  Inbox,
  LayoutDashboard,
  Settings2,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Пункт виден только администраторам сервера */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Обзор', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Кейсы', href: '/cases', icon: ClipboardList },
  { label: 'Участники', href: '/members', icon: Users },
  { label: 'Тикеты', href: '/tickets', icon: Ticket },
  { label: 'Апелляции', href: '/appeals', icon: Inbox },
  { label: 'Настройки', href: '/settings', icon: Settings2, adminOnly: true },
];

export interface PageMeta {
  title: string;
  description: string;
}

const PAGE_META: Record<string, PageMeta> = {
  '/dashboard': {
    title: 'Обзор',
    description: 'Ключевые метрики сервера, последние кейсы и состояние защиты.',
  },
  '/cases': {
    title: 'Кейсы',
    description: 'Единая история наказаний с фильтрами, поиском и управлением причинами.',
  },
  '/members': {
    title: 'Участники',
    description: 'Профили, роли, предупреждения и действия модерации.',
  },
  '/appeals': {
    title: 'Апелляции',
    description: 'Очередь обращений и решения по разбанам.',
  },
  '/tickets': {
    title: 'Тикеты',
    description: 'Обращения в поддержку: статусы, транскрипты и закрытие из панели.',
  },
  '/settings': {
    title: 'Настройки',
    description: 'Модерация, логи, безопасность и сообщество.',
  },
};

export function getPageMeta(pathname: string): PageMeta {
  const match = Object.entries(PAGE_META)
    .sort(([a], [b]) => b.length - a.length)
    .find(([path]) => pathname === path || pathname.startsWith(`${path}/`));

  return match?.[1] ?? { title: 'Панель', description: '' };
}
