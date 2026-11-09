import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { AlertTriangle, ClipboardList, FlaskConical, Inbox, ShieldCheck } from 'lucide-react';
import { DiscordIcon } from '@/components/brand/DiscordIcon';
import { Logo } from '@/components/brand/Logo';
import { FullScreenLoader } from '@/components/layout/FullScreenLoader';
import { Button } from '@/components/ui/Button';
import { usePageTitle } from '@/hooks/usePageTitle';
import { APP_VERSION, EASE_OUT_SOFT } from '@/lib/constants';
import { useAuthStore } from '@/store/auth';
import { toast } from '@/store/ui';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT_SOFT } },
};

const OAUTH_ERRORS: Record<string, string> = {
  rate: 'Слишком много попыток входа. Подождите минуту и попробуйте снова.',
  state: 'Сессия входа истекла. Начните авторизацию заново.',
  oauth: 'Discord не подтвердил вход. Попробуйте ещё раз.',
};

const features = [
  { label: 'Модерация', icon: ShieldCheck },
  { label: 'Кейсы', icon: ClipboardList },
  { label: 'Апелляции', icon: Inbox },
];

export function LoginPage() {
  const status = useAuthStore((state) => state.status);
  const sessionError = useAuthStore((state) => state.sessionError);
  const setSession = useAuthStore((state) => state.setSession);
  usePageTitle('Вход');

  const oauthError = useMemo(
    () => new URLSearchParams(window.location.search).get('error'),
    [],
  );
  const oauthMessage = oauthError ? OAUTH_ERRORS[oauthError] : null;
  const errorMessage = sessionError ?? oauthMessage;

  const enterDemo = async () => {
    const { DEMO_SESSION } = await import('@/lib/demo-session');
    setSession(DEMO_SESSION);
    toast.info(
      'Демо-режим',
      'Данные сервера ненастоящие. После входа через Discord панель использует реальный API.',
    );
  };

  if (status === 'idle' || status === 'loading') return <FullScreenLoader />;
  if (status === 'authenticated') return <Navigate to="/dashboard" replace />;

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
        aria-hidden
      >
        <span className="select-none whitespace-nowrap text-[26vw] font-black tracking-[0.08em] text-white/[0.014]">
          NEXUS
        </span>
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <span className="hidden items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground sm:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          OAuth2 · защищено
        </span>
      </header>

      <section className="relative z-10 flex flex-1 items-center justify-center px-4 py-8 sm:py-10">
        {/* Тонкие орбиты вокруг карточки — глубина без перегруза */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2" aria-hidden>
          <div className="h-[560px] w-[560px] max-w-[120vw] rounded-full border border-white/[0.035]" />
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[400px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 animate-spin-slow rounded-full border border-dashed border-accent/15" />
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-[440px]"
        >
          <motion.div variants={item} className="text-center">
            <div className="relative mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-accent/20 bg-accent/10 shadow-glow-card">
              <span className="absolute inset-0 -z-10 rounded-2xl bg-accent/30 blur-2xl" aria-hidden />
              <DiscordIcon className="h-8 w-8 text-[#aab0ff]" />
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.03em] sm:text-[30px]">
              Вход в <span className="text-gradient">NEXUS</span>
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Подключите Discord-аккаунт — покажем только серверы, где у вас есть права
              модератора.
            </p>
          </motion.div>

          <motion.div
            variants={item}
            className="mt-7 rounded-3xl bg-gradient-to-b from-accent/30 via-white/[0.08] to-info/20 p-px shadow-modal"
          >
            <div className="glass-modal rounded-[calc(1.5rem-1px)] p-5 sm:p-7">
              {errorMessage ? (
                <div
                  className="mb-4 flex gap-2.5 rounded-xl border border-danger/25 bg-danger/10 p-3 text-left text-xs leading-relaxed text-danger"
                  role="alert"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              ) : null}

              <Button asChild size="lg" className="group w-full">
                <a href="/auth/login">
                  <DiscordIcon className="h-[18px] w-[18px]" />
                  Войти через Discord
                </a>
              </Button>

              <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                OAuth2 · без пароля
              </div>

              {import.meta.env.DEV ? (
                <div className="mt-5 border-t border-white/[0.06] pt-4 text-center">
                  <button
                    type="button"
                    onClick={() => void enterDemo()}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <FlaskConical className="h-3.5 w-3.5" />
                    Посмотреть демо-панель · dev
                  </button>
                </div>
              ) : null}
            </div>
          </motion.div>

          <motion.div variants={item} className="mt-5 grid grid-cols-3 gap-2.5">
            {features.map((feature) => (
              <div
                key={feature.label}
                className="glass-card flex flex-col items-center gap-2 px-2 py-3 text-center"
              >
                <feature.icon className="h-4 w-4 text-accent" strokeWidth={1.8} />
                <span className="text-[10px] text-muted-foreground">{feature.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <footer className="relative z-10 flex items-center justify-between gap-3 px-5 py-5 text-[9px] font-medium uppercase tracking-[0.18em] text-white/20 sm:px-8">
        <span>NEXUS v{APP_VERSION}</span>
        <span className="hidden sm:inline">Moderation suite</span>
        <span>Discord.js 14</span>
      </footer>
    </main>
  );
}
