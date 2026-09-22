import { Routes, Route, Link, useLocation, Navigate } from 'react-router'
import { AppShell, Spinner } from '@wz/ui'
import { useAuth } from './lib/auth-context.js'
import { RequireAuth } from './routes/RequireAuth.js'
import { LoginPage } from './routes/LoginPage.js'
import { OnboardingPage } from './routes/OnboardingPage.js'
import { AcceptInvitePage } from './routes/AcceptInvitePage.js'
import { OrgUsersPage } from './routes/org/UsersPage.js'
import { OrgInvitesPage } from './routes/org/InvitesPage.js'
import { ProfilePage } from './routes/org/ProfilePage.js'
import { HubOrganizationsPage } from './routes/hub/OrganizationsPage.js'
import { HubUsersPage } from './routes/hub/UsersPage.js'
import { HubAuditPage } from './routes/hub/AuditPage.js'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route
        path="/app/*"
        element={
          <RequireAuth>
            <OrgShell />
          </RequireAuth>
        }
      />
      <Route
        path="/hub/*"
        element={
          <RequireAuth roles={['super_admin']}>
            <HubShell />
          </RequireAuth>
        }
      />
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Raiz `/`: manda para a área certa assim que sabemos se há sessão e qual o papel. */
function Landing() {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'super_admin' ? '/hub' : '/app'} replace />
}

function OrgShell() {
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <AppShell
      brand="WZ Connect"
      sections={[
        {
          label: 'Organização',
          links: [
            { to: '/app/users', icon: '👥', label: 'Usuários' },
            { to: '/app/invites', icon: '✉️', label: 'Convites' },
            { to: '/app/profile', icon: '⚙️', label: 'Perfil' },
          ],
        },
      ]}
      userEmail={user?.email ?? ''}
      onLogout={logout}
      LinkComponent={Link}
      isActive={(to) => location.pathname.startsWith(to)}
    >
      <Routes>
        <Route path="users" element={<OrgUsersPage />} />
        <Route path="invites" element={<OrgInvitesPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/app/users" replace />} />
      </Routes>
    </AppShell>
  )
}

function HubShell() {
  const location = useLocation()
  const { user, logout } = useAuth()

  return (
    <AppShell
      brand="WZ Connect · Hub"
      sections={[
        {
          label: 'Plataforma',
          links: [
            { to: '/hub/organizations', icon: '🏢', label: 'Organizações' },
            { to: '/hub/users', icon: '👥', label: 'Usuários globais' },
            { to: '/hub/audit', icon: '📋', label: 'Auditoria' },
          ],
        },
      ]}
      userEmail={user?.email ?? ''}
      onLogout={logout}
      LinkComponent={Link}
      isActive={(to) => location.pathname.startsWith(to)}
    >
      <Routes>
        <Route path="organizations" element={<HubOrganizationsPage />} />
        <Route path="users" element={<HubUsersPage />} />
        <Route path="audit" element={<HubAuditPage />} />
        <Route path="*" element={<Navigate to="/hub/organizations" replace />} />
      </Routes>
    </AppShell>
  )
}
