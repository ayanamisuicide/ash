import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Pagination } from '@/components/ui/Pagination';

describe('Pagination', () => {
  it('показывает текущую страницу, всего страниц и количество кейсов', () => {
    render(<Pagination page={1} pages={20} total={1234} onPageChange={() => {}} />);

    expect(screen.getByLabelText('Пагинация')).toHaveTextContent('Страница 1 из 20');
    expect(screen.getByLabelText('Пагинация')).toHaveTextContent('1 234 кейса');
  });

  it('окно страниц: 1 … 9 10 11 … 20', () => {
    const { container } = render(<Pagination page={10} pages={20} onPageChange={() => {}} />);

    const numbers = [...container.querySelectorAll('button[aria-label^="Страница "]')].map((node) =>
      node.getAttribute('aria-label'),
    );
    expect(numbers).toEqual([
      'Страница 1',
      'Страница 9',
      'Страница 10',
      'Страница 11',
      'Страница 20',
    ]);
    expect(container.querySelectorAll('span[aria-hidden]')).toHaveLength(2);
  });

  it('переключает страницы вперёд и назад', () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<Pagination page={3} pages={10} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByLabelText('Следующая страница'));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    fireEvent.click(screen.getByLabelText('Предыдущая страница'));
    expect(onPageChange).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByLabelText('Страница 4'));
    expect(onPageChange).toHaveBeenLastCalledWith(4);

    rerender(<Pagination page={10} pages={10} onPageChange={onPageChange} />);
    expect(screen.getByLabelText('Следующая страница')).toBeDisabled();
    expect(screen.getByText('10', { selector: 'button' })).toHaveAttribute('aria-current', 'page');
  });

  it('блокирует «Назад» на первой странице', () => {
    render(<Pagination page={1} pages={5} onPageChange={() => {}} />);
    expect(screen.getByLabelText('Предыдущая страница')).toBeDisabled();
    expect(screen.getByLabelText('Следующая страница')).not.toBeDisabled();
  });

  it('не выходит за границы, если сервер прислал странную страницу', () => {
    render(<Pagination page={999} pages={3} onPageChange={() => {}} />);

    expect(screen.getByLabelText('Пагинация')).toHaveTextContent('Страница 3 из 3');
    expect(screen.getByLabelText('Следующая страница')).toBeDisabled();
    expect(screen.getByLabelText('Страница 3')).toHaveAttribute('aria-current', 'page');
  });

  it('при одной странице не рисует переключатели', () => {
    render(<Pagination page={1} pages={1} total={0} onPageChange={() => {}} />);

    expect(screen.getByLabelText('Пагинация')).toHaveTextContent('0 кейсов');
    expect(screen.queryByLabelText('Следующая страница')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Предыдущая страница')).not.toBeInTheDocument();
  });

  it('disabled блокирует все кнопки', () => {
    render(<Pagination page={2} pages={5} disabled onPageChange={() => {}} />);

    for (const label of ['Предыдущая страница', 'Следующая страница', 'Страница 1']) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });
});
