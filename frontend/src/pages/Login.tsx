import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Fingerprint,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ArrowRight,
  ShieldCheck,
  LifeBuoy,
} from 'lucide-react'
import { brand } from '@/config/brand'
import { useAuth } from '@/context/AuthContext'
import { Crest } from '@/components/ui/Crest'

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [studentId, setStudentId] = useState('SU/CS/2023/0187')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await login(studentId, password)
    setLoading(false)
    if (res.ok) navigate('/dashboard')
    else setError(res.message ?? 'Unable to sign in.')
  }

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* ---- Slim institutional masthead ---- */}
      <header className="bg-navy-950 text-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Crest size={34} variant="light" />
            <div className="leading-tight">
              <p className="font-display text-[15px] font-semibold text-white">{brand.name}</p>
              <p className="hidden text-[10px] uppercase tracking-institutional text-gold-400/90 sm:block">
                {brand.motto}
              </p>
            </div>
          </div>
          <a
            href={`mailto:${brand.supportEmail}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-navy-200 transition-colors hover:text-white"
          >
            <LifeBuoy className="h-4 w-4" />
            <span className="hidden sm:inline">Need help?</span>
          </a>
        </div>
      </header>

      {/* ---- Editorial split: statement | form, divided by a hairline ---- */}
      <main className="flex flex-1 items-center justify-center px-6 py-14">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-0">
          {/* Left — dignified statement */}
          <div className="hidden flex-col justify-center lg:flex lg:pr-14">
            <p className="eyebrow">Student Portal</p>
            <div className="mt-4 h-px w-10 bg-gold-500" />
            <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.1] tracking-tight text-navy-900 text-balance">
              Welcome back to your academic record.
            </h1>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-navy-500">
              Sign in to view course registration, examination results, and fee statements. Your
              identity is verified continuously and every action is recorded on an immutable
              blockchain ledger.
            </p>
            <p className="mt-8 inline-flex items-center gap-2 text-sm text-navy-500">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Protected by Zero Trust verification &amp; blockchain audit
            </p>
          </div>

          {/* Right — sign-in form */}
          <div className="lg:border-l lg:border-navy-100 lg:pl-14">
            {/* Mobile brand + statement */}
            <div className="mb-8 lg:hidden">
              <p className="eyebrow">Student Portal</p>
              <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-navy-900">
                Sign in
              </h1>
              <p className="mt-1 text-sm text-navy-400">Use your university student credentials.</p>
            </div>

            <div className="hidden lg:block">
              <h2 className="font-display text-2xl font-semibold text-navy-900">Sign in</h2>
              <p className="mt-1 text-sm text-navy-400">Use your university student credentials.</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-navy-700">
                  Student ID
                </label>
                <div className="relative">
                  <Fingerprint className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input
                    className="input pl-10"
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="SU/CS/2023/0187"
                    autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-semibold text-navy-700">Password</label>
                  <a href="#" className="text-xs font-semibold text-navy-500 hover:text-gold-600">
                    Forgot password?
                  </a>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-300" />
                  <input
                    className="input pl-10 pr-10"
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-600"
                  >
                    {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                  <AlertCircle className="h-4 w-4 flex-none" />
                  {error}
                </div>
              )}

              <button type="submit" className="btn-primary btn-lg w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying identity…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-8 border-t border-navy-100 pt-5 text-[13px] text-navy-400">
              <span className="font-semibold text-navy-600">Demonstration access</span> — ID{' '}
              <span className="font-mono text-navy-700">SU/CS/2023/0187</span>, password{' '}
              <span className="font-mono text-navy-700">demo1234</span>
            </p>
          </div>
        </div>
      </main>

      {/* ---- Footer ---- */}
      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-navy-400 sm:flex-row">
          <p>
            © {new Date().getFullYear()} {brand.name} · Established {brand.established}
          </p>
          <nav className="flex items-center gap-5">
            <a href="#" className="hover:text-navy-700">
              Help Desk
            </a>
            <a href="#" className="hover:text-navy-700">
              IT Support
            </a>
            <a href="#" className="hover:text-navy-700">
              Privacy Policy
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
