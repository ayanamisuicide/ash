import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageFallback } from '@/components/layout/PageFallback';

describe('PageFallback', () => {
  it('показывает скелетон и сообщает о загрузке скринридеру', () => {
    render(<PageFallback />);

    const region = screen.getByLabelText('Загрузка страницы');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(6);
  });
});
