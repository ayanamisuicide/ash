import { describe, expect, it } from 'vitest';
import { getPageMeta, NAV_ITEMS } from '@/lib/navigation';

describe('NAV_ITEMS', () => {
  it('ведёт на уникальные разделы и прячет настройки от модераторов', () => {
    const hrefs = NAV_ITEMS.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(NAV_ITEMS.find((item) => item.href === '/settings')?.adminOnly).toBe(true);
    expect(NAV_ITEMS.find((item) => item.href === '/cases')?.adminOnly).toBeUndefined();
  });
});

describe('getPageMeta', () => {
  it('возвращает заголовок для точного пути', () => {
    expect(getPageMeta('/dashboard').title).toBe('Обзор');
  });

  it('поддерживает вложенные пути', () => {
    expect(getPageMeta('/cases/42').title).toBe('Кейсы');
  });

  it('для неизвестного пути — безопасный фолбэк', () => {
    expect(getPageMeta('/unknown')).toEqual({ title: 'Панель', description: '' });
  });
});
