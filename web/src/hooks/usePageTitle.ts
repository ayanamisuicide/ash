import { useEffect } from 'react';
import { APP_NAME } from '@/lib/constants';

export function usePageTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}
