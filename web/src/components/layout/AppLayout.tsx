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
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(102,115,255,0.06),transparent_65%)]" />
          <div className="relative mx-auto w-full max-w-[1600px] px-4 pb-10 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pb-12 lg:pt-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, ease: EASE_OUT_SOFT }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <footer className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 pb-5 pt-2 text-[9px] uppercase tracking-[0.18em] text-white/20 sm:px-6 lg:px-8">
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
