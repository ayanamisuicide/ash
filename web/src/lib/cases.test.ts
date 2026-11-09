import { describe, expect, it } from 'vitest';
import type { CaseType } from '@/api/types';
import {
  CASE_TONE_COLORS,
  CASE_TYPE_LABELS,
  caseTypeBadgeClasses,
  caseTypeColor,
  caseTypeLabel,
  caseTypeTone,
} from '@/lib/cases';

const ALL_TYPES = Object.keys(CASE_TYPE_LABELS) as CaseType[];

describe('caseTypeLabel', () => {
  it('переводит все типы кейсов', () => {
    expect(caseTypeLabel('ban')).toBe('Бан');
    expect(caseTypeLabel('temprole')).toBe('Временная роль');
    for (const type of ALL_TYPES) {
      expect(caseTypeLabel(type)).toBeTruthy();
      expect(caseTypeLabel(type)).not.toBe(type);
    }
  });

  it('неизвестный тип возвращает сам себя', () => {
    expect(caseTypeLabel('unknown' as CaseType)).toBe('unknown');
  });
});

describe('caseTypeTone / caseTypeColor', () => {
  it('цвет берётся из палитры тона', () => {
    for (const type of ALL_TYPES) {
      const tone = caseTypeTone(type);
      expect(CASE_TONE_COLORS[tone]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(caseTypeColor(type)).toBe(CASE_TONE_COLORS[tone]);
    }
  });

  it('баны красные, разбан зелёный', () => {
    expect(caseTypeTone('ban')).toBe('danger');
    expect(caseTypeTone('unban')).toBe('success');
    expect(caseTypeTone('mute')).toBe('info');
  });

  it('неизвестный тип — muted', () => {
    expect(caseTypeTone('unknown' as CaseType)).toBe('muted');
    expect(caseTypeBadgeClasses('unknown' as CaseType)).toBe(
      'border-white/[0.08] bg-white/[0.04] text-muted-foreground',
    );
  });
});
