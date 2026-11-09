import { describe, expect, it } from 'vitest';
import { getReleaseNotes } from '@/lib/release-notes';

describe('getReleaseNotes', () => {
  it('отдаёт заметки для известной версии', () => {
    const notes = getReleaseNotes('2.2.1');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(' ')).toMatch(/пагинац/i);
  });

  it('для неизвестной версии — безопасный фолбэк', () => {
    expect(getReleaseNotes('9.9.9')).toEqual(['Улучшения интерфейса и стабильности.']);
  });
});
