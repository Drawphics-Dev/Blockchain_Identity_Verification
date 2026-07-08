import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/** Guards the app shell — redirects to /login when there is no session. */
export function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-navy-200 border-t-navy-700" />
      </div>
    )
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />
}
