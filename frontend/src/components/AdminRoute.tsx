import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Guards the Admin / Research view — sends non-staff back to their dashboard.
 *
 * Mounted inside ProtectedRoute, so a session already exists by the time this runs; the only
 * question left is role. Hiding the nav link is not enough on its own because /admin can simply
 * be typed into the address bar.
 *
 * This is convenience, not security: the real gate is requireAdmin on the server. A student who
 * bypasses this renders an empty page and collects 403s from every endpoint behind it.
 */
export function AdminRoute() {
  const { student } = useAuth()

  // See the note in StudentRoute: never redirect on a null student, or the two guards volley.
  if (!student) return null
  return student.role === 'ADMIN' ? <Outlet /> : <Navigate to="/dashboard" replace />
}
