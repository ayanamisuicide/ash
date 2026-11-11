import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SessionBootstrap } from '@/components/auth/SessionBootstrap';
import { BackgroundFx } from '@/components/effects/BackgroundFx';
import { AppLayout } from '@/components/layout/AppLayout';
import { UpdateNotice } from '@/components/layout/UpdateNotice';
import { Toaster } from '@/components/ui/Toast';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useCardSpotlight } from '@/hooks/useCardSpotlight';
import { LoginPage } from '@/pages/Login';
import { NotFoundPage } from '@/pages/NotFound';

// Тяжёлые страницы грузим по требованию: entry-чанк не тянет demo-data,
// таблицы кейсов и настройки, пока пользователь не откроет раздел.
const DashboardPage = lazy(() =>
  import('@/pages/Dashboard').then((module) => ({ default: module.DashboardPage })),
);
const CasesPage = lazy(() =>
  import('@/pages/Cases').then((module) => ({ default: module.CasesPage })),
);
const MembersPage = lazy(() =>
  import('@/pages/Members').then((module) => ({ default: module.MembersPage })),
);
const AppealsPage = lazy(() =>
  import('@/pages/Appeals').then((module) => ({ default: module.AppealsPage })),
);
const TicketsPage = lazy(() =>
  import('@/pages/Tickets').then((module) => ({ default: module.TicketsPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((module) => ({ default: module.SettingsPage })),
);

export default function App() {
  useAutoUpdate();
  useCardSpotlight();

  return (
    <>
      <BackgroundFx />
      <SessionBootstrap />

      <HashRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<LoginPage />} />
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/cases" element={<CasesPage />} />
                <Route path="/members" element={<MembersPage />} />
                <Route path="/tickets" element={<TicketsPage />} />
                <Route path="/appeals" element={<AppealsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </HashRouter>

      <Toaster />
      <UpdateNotice />
    </>
  );
}
