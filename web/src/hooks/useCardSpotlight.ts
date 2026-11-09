import { useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Обновляет CSS-переменные --spot-x/--spot-y у ближайшей .glass-card,
 * чтобы карточки подсвечивались под курсором. Один слушатель на всё приложение.
 */
export function useCardSpotlight(): void {
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;

    let frame = 0;
    let lastEvent: PointerEvent | null = null;

    const update = (): void => {
      frame = 0;
      const event = lastEvent;
      if (!event || event.pointerType === 'touch') return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const card = target.closest<HTMLElement>('.glass-card');
      if (!card) return;

      const rect = card.getBoundingClientRect();
      card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
      card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
    };

    const onPointerMove = (event: PointerEvent): void => {
      lastEvent = event;
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [reduceMotion]);
}
