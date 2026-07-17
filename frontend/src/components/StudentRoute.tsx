import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * The mirror of AdminRoute: keeps staff out of the student portal.
 *
 * Without this an administrator would be shown a dashboard reporting GPA 0.00 and no courses —
 * not a permissions leak, just a meaningless page, since staff hold no academic record. The
 * server agrees: requireStudent 403s these routes for an ADMIN.
 */
export function StudentRoute() {
  const { student } = useAuth()

  // Redirect only on a *known* ADMIN. Bouncing on a null student would volley with AdminRoute
  // — /dashboard → /admin → /dashboard — forever. ProtectedRoute already guarantees a student
  // here (isAuthenticated is `!!student`); this stays correct even if that ever changes.
  if (!student) return null
  return student.role === 'STUDENT' ? <Outlet /> : <Navigate to="/admin" replace />
}

/** Send each role to its own landing page — students to the dashboard, staff to the trail. */
export function HomeRedirect() {
  const { student } = useAuth()

  return <Navigate to={student?.role === 'ADMIN' ? '/admin' : '/dashboard'} replace />
}
