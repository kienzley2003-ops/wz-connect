import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { Spinner } from '@wz/ui'
import { useAuth } from '../lib/auth-context.js'

interface RequireAuthProps {
  children: ReactNode
  roles?: string[]
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Spinner />
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Você não tem permissão para acessar esta página.
        </p>
      </div>
    )
  }
  return <>{children}</>
}
