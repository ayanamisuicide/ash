import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearUpdateNotice,
  getCurrentPanelBuild,
  normalizePanelBuild,
  readUpdateNotice,
  writeUpdateNotice,
} from '@/lib/autoUpdate';

const NOTICE_KEY = 'nexus.auto-update.notice';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  document.querySelectorAll('script[data-test-build]').forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe('normalizePanelBuild', () => {
  it('приводит абсолютный и относительный путь к pathname', () => {
    expect(normalizePanelBuild('http://127.0.0.1:8080/assets/index-abc.js')).toBe(
      '/assets/index-abc.js',
    );
    expect(normalizePanelBuild('/assets/index-abc.js')).toBe('/assets/index-abc.js');
  });

  it('пустое или битое значение даёт пустую строку', () => {
    expect(normalizePanelBuild()).toBe('');
    expect(normalizePanelBuild('')).toBe('');
  });
});

describe('getCurrentPanelBuild', () => {
  it('берёт src entry-скрипта и отбрасывает origin', () => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = '/assets/index-current.js';
    script.dataset.testBuild = '1';
    document.head.append(script);

    expect(getCurrentPanelBuild()).toBe('/assets/index-current.js');
  });

  it('без module-скрипта возвращает пустую строку', () => {
    expect(getCurrentPanelBuild()).toBe('');
  });
});

describe('update notice', () => {
  const payload = { version: '3.2.0', build: '/assets/index-new.js', at: Date.now() };

  it('сохраняется, читается и очищается', () => {
    writeUpdateNotice(payload);

    expect(readUpdateNotice()).toEqual(payload);

    clearUpdateNotice();
    expect(readUpdateNotice()).toBeNull();
  });

  it('битый JSON и неверные поля удаляются', () => {
    window.sessionStorage.setItem(NOTICE_KEY, '{oops');
    expect(readUpdateNotice()).toBeNull();

    window.sessionStorage.setItem(
      NOTICE_KEY,
      JSON.stringify({ version: 1, build: null, at: 'now' }),
    );
    expect(readUpdateNotice()).toBeNull();
    expect(window.sessionStorage.getItem(NOTICE_KEY)).toBeNull();
  });

  it('просроченное уведомление не показывается', () => {
    window.sessionStorage.setItem(
      NOTICE_KEY,
      JSON.stringify({ ...payload, at: Date.now() - 3 * 60_000 }),
    );

    expect(readUpdateNotice()).toBeNull();
    expect(window.sessionStorage.getItem(NOTICE_KEY)).toBeNull();
  });

  it('недоступный sessionStorage не роняет панель', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeUpdateNotice(payload)).not.toThrow();

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readUpdateNotice()).toBeNull();

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => clearUpdateNotice()).not.toThrow();
  });
});
