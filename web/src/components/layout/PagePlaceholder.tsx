import { useState } from 'react';
import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { usePageTitle } from '@/hooks/usePageTitle';
import { EASE_OUT_SOFT } from '@/lib/constants';

interface PagePlaceholderProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_SOFT } },
};

/**
 * Временный экран раздела. Он уже использует финальную сетку, motion-каскад
 * и shimmer-скелетоны — на шаге 2 останется заменить контент на данные API.
 */
export function PagePlaceholder({ title, description, icon: Icon }: PagePlaceholderProps) {
  usePageTitle(title);
  const [planOpen, setPlanOpen] = useState(false);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 sm:space-y-8"
    >
      <motion.div
        variants={item}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <p className="eyebrow flex items-center gap-2 text-accent">
            <span className="h-px w-5 bg-accent/70" />
            NEXUS / {title}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.03em] sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPlanOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent transition-colors hover:border-accent/40 hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
          Следующий шаг
        </button>
      </motion.div>

      <motion.div variants={item}>
        <Card className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute -top-28 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
            aria-hidden
          />
          <div className="relative flex flex-col items-center px-5 py-12 text-center sm:px-8 sm:py-16">
            <div className="relative mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-accent/20 bg-accent/10 text-accent shadow-glow-card">
              <span className="absolute inset-0 -z-10 rounded-2xl bg-accent/20 blur-xl" aria-hidden />
              <Icon className="h-7 w-7" strokeWidth={1.8} />
            </div>

            <h2 className="text-lg font-semibold tracking-[-0.02em]">
              Каркас раздела уже на месте
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Роутинг, права доступа и API-клиент с CSRF работают. Таблицы, виджеты и действия
              модерации подключим на следующем шаге.
            </p>

            <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
              {['Метрики', 'Данные', 'Действия'].map((label, index) => (
                <div
                  key={label}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 text-left"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {label}
                  </p>
                  <div className="skeleton mt-3 h-2.5 w-16" />
                  <div
                    className="skeleton mt-2 h-2 w-full"
                    style={{ animationDelay: `${index * 120}ms` }}
                  />
                </div>
              ))}
            </div>

            <Button asChild variant="secondary" className="mt-7">
              <Link to="/dashboard">
                Вернуться к обзору
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </Card>
      </motion.div>

      <Modal
        open={planOpen}
        onOpenChange={setPlanOpen}
        title="Шаг 2 — данные и действия"
        description={`Раздел «${title}» получит реальные данные из существующего API бота.`}
        footer={
          <Button type="button" onClick={() => setPlanOpen(false)}>
            Понятно
          </Button>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>Каркас уже готов. На следующем шаге подключим:</p>
          <ul className="space-y-2.5">
            {[
              'Stat-карточки с count-up и плавными переходами',
              'Графики активности и распределение наказаний',
              'Таблицы кейсов и участников с фильтрами',
              'Формы действий модерации с проверкой прав',
            ].map((line) => (
              <li key={line} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_8px_rgba(102,115,255,0.7)]" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </Modal>
    </motion.div>
  );
}
