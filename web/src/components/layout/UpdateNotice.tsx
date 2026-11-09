import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  clearUpdateNotice,
  isNoticeForCurrentBuild,
  readUpdateNotice,
  type UpdateNoticePayload,
} from '@/lib/autoUpdate';
import { APP_VERSION, EASE_OUT_SOFT } from '@/lib/constants';
import { getReleaseNotes } from '@/lib/release-notes';

const AUTO_HIDE_MS = 6000;

/**
 * Показывается один раз после автообновления: подтверждает, что панель
 * перезагрузилась на новую сборку, и показывает актуальную версию.
 */
export function UpdateNotice() {
  const [notice, setNotice] = useState<UpdateNoticePayload | null>(() => {
    const payload = readUpdateNotice();
    if (!payload) return null;
    if (!isNoticeForCurrentBuild(payload)) {
      clearUpdateNotice();
      return null;
    }
    return payload;
  });
  const reduceMotion = useReducedMotion();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const notes = getReleaseNotes(APP_VERSION);

  const dismiss = (): void => {
    setSummaryOpen(false);
    setNotice(null);
  };

  useEffect(() => {
    if (!notice) return;

    clearUpdateNotice();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') dismiss();
    };

    window.addEventListener('keydown', onKeyDown);
    // Пока открыта сводка, не закрываем окно автоматически.
    const timer = summaryOpen ? undefined : window.setTimeout(() => setNotice(null), AUTO_HIDE_MS);

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [notice, summaryOpen]);

  return (
    <AnimatePresence>
      {notice ? (
        <motion.div
          key="update-notice"
          className="fixed inset-0 z-[90] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.button
            type="button"
            aria-label="Закрыть уведомление об обновлении"
            onClick={dismiss}
            className="absolute inset-0 cursor-default bg-[#07090e]/65 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            role="status"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.96, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.7 }}
            className="glass-modal relative max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto p-6 text-center shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95),0_0_100px_-30px_rgba(61,214,140,0.35)]"
          >
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-success/20 blur-3xl"
              aria-hidden
            />

            <button
              type="button"
              onClick={dismiss}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-success/25 bg-success/10 text-success shadow-glow-success">
              <span
                className="absolute inset-0 animate-pulse-soft rounded-2xl bg-success/25 blur-xl"
                aria-hidden
              />
              <Check className="relative h-7 w-7" strokeWidth={2.4} />
            </div>

            <p className="eyebrow text-success">Обновление установлено</p>
            <h2 className="mt-2 text-xl font-bold tracking-[-0.03em]">
              Обновлено до версии <span className="text-gradient">{APP_VERSION}</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Новые анимации и улучшения уже загружены. Можно продолжать работу.
            </p>

            <button
              type="button"
              onClick={() => setSummaryOpen((open) => !open)}
              aria-expanded={summaryOpen}
              aria-controls="update-summary"
              className="focus-ring mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-accent/25 hover:bg-accent/10 hover:text-accent-soft"
            >
              <Sparkles className="h-3 w-3" />
              Сводка изменений
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-300 ${
                  summaryOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence initial={false}>
              {summaryOpen ? (
                <motion.div
                  key="update-summary"
                  id="update-summary"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT_SOFT }}
                  className="overflow-hidden"
                >
                  <motion.div
                    initial={{ y: 14 }}
                    animate={{ y: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5 text-left"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Что нового в {APP_VERSION}
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {notes.map((note, index) => (
                        <motion.li
                          key={note}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{
                            delay: 0.05 + index * 0.045,
                            duration: 0.24,
                            ease: EASE_OUT_SOFT,
                          }}
                          className="flex gap-2 text-[12px] leading-relaxed text-foreground/85"
                        >
                          <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-accent to-info shadow-[0_0_8px_rgba(102,115,255,0.65)]" />
                          {note}
                        </motion.li>
                      ))}
                    </ul>
                  </motion.div>
                </motion.div>
              ) : null}
            </AnimatePresence>

            <Button type="button" size="sm" onClick={dismiss} className="mt-4 w-full">
              Продолжить
            </Button>

            {!summaryOpen ? (
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-success/15" aria-hidden>
                <motion.div
                  className="h-full origin-left bg-success"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: AUTO_HIDE_MS / 1000, ease: 'linear' }}
                />
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
