import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { StepUpProvider } from '@/context/StepUpContext'
import { AdminRoute } from '@/components/AdminRoute'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { HomeRedirect, StudentRoute } from '@/components/StudentRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { CourseRegistration } from '@/pages/CourseRegistration'
import { FeeStatement } from '@/pages/FeeStatement'
import { Results } from '@/pages/Results'
import { Admin } from '@/pages/Admin'

export default function App() {
  return (
    <AuthProvider>
      <StepUpProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Authenticated app shell. The two roles get disjoint route sets — staff have no
                academic record to show, students may not read the audit trail. */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route element={<StudentRoute />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/courses" element={<CourseRegistration />} />
                  <Route path="/fees" element={<FeeStatement />} />
                  <Route path="/results" element={<Results />} />
                </Route>
                <Route element={<AdminRoute />}>
                  <Route path="/admin" element={<Admin />} />
                </Route>
              </Route>
            </Route>

            {/* Role decides the landing page, so neither of these can hardcode a destination. */}
            <Route path="/" element={<HomeRedirect />} />
            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </BrowserRouter>
      </StepUpProvider>
    </AuthProvider>
  )
}
