import { motion } from 'framer-motion';
import { Logo } from '@/components/brand/Logo';

/** Экран восстановления сессии: без спиннера — пульсирующий логотип и shimmer-скелетоны */
export function FullScreenLoader() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative mb-8 grid place-items-center">
          <motion.span
            className="absolute h-28 w-28 rounded-full border border-accent/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="absolute h-20 w-20 rounded-full bg-accent/20 blur-2xl"
            animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.08, 0.95] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Logo markOnly size="lg" />
          </motion.div>
        </div>

        <p className="text-sm font-semibold tracking-[-0.01em]">Подключаемся к NEXUS</p>
        <p className="mt-1.5 text-xs text-muted-foreground">Проверяем сессию Discord и права доступа…</p>

        <div className="mt-7 w-full space-y-2.5">
          <div className="skeleton h-3 w-full" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      </div>
    </div>
  );
}
