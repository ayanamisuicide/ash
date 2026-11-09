import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useAuthStore } from '@/store/auth';

export function NotFoundPage() {
  const status = useAuthStore((state) => state.status);
  usePageTitle('Страница не найдена');

  const target = status === 'authenticated' ? '/dashboard' : '/login';
  const label = status === 'authenticated' ? 'Вернуться к обзору' : 'Перейти ко входу';

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 text-center">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
        <span className="select-none text-[38vw] font-black leading-none tracking-tighter text-white/[0.02]">
          404
        </span>
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <Logo size="lg" />
        <p className="mt-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          Lost in the void
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">
          Такой страницы нет
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
          Возможно, ссылка устарела или раздел ещё не подключён к панели.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link to={target}>
            <ArrowLeft />
            {label}
          </Link>
        </Button>
      </div>
    </main>
  );
}
