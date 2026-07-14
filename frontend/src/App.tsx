import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/context/AuthContext'
import { StepUpProvider } from '@/context/StepUpContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
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

            {/* Authenticated app shell */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/courses" element={<CourseRegistration />} />
                <Route path="/fees" element={<FeeStatement />} />
                <Route path="/results" element={<Results />} />
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </StepUpProvider>
    </AuthProvider>
  )
}
