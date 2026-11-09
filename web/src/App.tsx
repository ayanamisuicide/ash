import { HashRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SessionBootstrap } from '@/components/auth/SessionBootstrap';
import { BackgroundFx } from '@/components/effects/BackgroundFx';
import { AppLayout } from '@/components/layout/AppLayout';
import { UpdateNotice } from '@/components/layout/UpdateNotice';
import { Toaster } from '@/components/ui/Toast';
import { useAutoUpdate } from '@/hooks/useAutoUpdate';
import { useCardSpotlight } from '@/hooks/useCardSpotlight';
import { AppealsPage } from '@/pages/Appeals';
import { CasesPage } from '@/pages/Cases';
import { DashboardPage } from '@/pages/Dashboard';
import { LoginPage } from '@/pages/Login';
import { MembersPage } from '@/pages/Members';
import { NotFoundPage } from '@/pages/NotFound';
import { SettingsPage } from '@/pages/Settings';

export default function App() {
  useAutoUpdate();
  useCardSpotlight();

  return (
    <>
      <BackgroundFx />
      <SessionBootstrap />

      <HashRouter>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cases" element={<CasesPage />} />
              <Route path="/members" element={<MembersPage />} />
              <Route path="/appeals" element={<AppealsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </HashRouter>

      <Toaster />
      <UpdateNotice />
    </>
  );
}
