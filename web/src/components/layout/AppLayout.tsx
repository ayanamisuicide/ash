import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { APP_NAME, APP_VERSION, EASE_OUT_SOFT } from '@/lib/constants';

export function AppLayout() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="relative min-h-screen">
      <Sidebar />

      <div className="flex min-h-screen flex-col lg:pl-[252px]">
        <Topbar />

        <main className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(102,115,255,0.08),transparent_65%)]" />
          <motion.div
            key={`route-beam-${location.pathname}`}
            initial={{ scaleX: 0, opacity: 0.9 }}
            animate={{ scaleX: 1, opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT_SOFT }}
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px] origin-left bg-gradient-to-r from-accent via-info to-premium shadow-[0_0_14px_rgba(102,115,255,0.7)]"
            aria-hidden
          />
          <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 18, scale: 0.995, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{
                  opacity: 0,
                  y: -8,
                  scale: 0.998,
                  filter: 'blur(3px)',
                  transition: { duration: 0.18, ease: 'easeIn' },
                }}
                transition={{ duration: 0.4, ease: EASE_OUT_SOFT }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 pb-5 pt-2 text-[11px] uppercase tracking-[0.18em] text-white/40 sm:px-6 lg:px-8">
          <span>
            {APP_NAME} v{APP_VERSION}
          </span>
          <span className="hidden sm:inline">Discord.js 14 · OAuth2</span>
          <span>Control deck</span>
        </footer>
      </div>
    </div>
  );
}
