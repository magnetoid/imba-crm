import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useSession } from './useSession'
import { hasRole, type Role } from './roles'

interface RequireAuthProps {
  children: React.ReactNode
  redirectTo?: string
  roles?: Role[]
}

/**
 * Gate a subtree behind auth (and optional role membership). Redirects to
 * `redirectTo` (default `/`) with `?from=` preserved when unauthenticated.
 * When a role list is provided and the user has no matching role, renders
 * a 403-style fallback.
 */
export function RequireAuth({ children, redirectTo = '/', roles }: RequireAuthProps) {
  const { loading, session } = useSession()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!session) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />
  }

  if (roles && !hasRole(session, ...roles)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="max-w-sm text-center space-y-2">
          <h1 className="text-lg font-semibold text-foreground">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            Your account doesn't have permission to view this page.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
