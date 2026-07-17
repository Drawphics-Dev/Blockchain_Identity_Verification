import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ShieldCheck, LogOut, Menu, X, ChevronDown } from 'lucide-react'
import { brand } from '@/config/brand'
import { useAuth } from '@/context/AuthContext'
import { Crest } from '@/components/ui/Crest'
import { cn } from '@/lib/utils'

/**
 * The two roles get disjoint navigation, not a shared portal with one extra tab. A security
 * administrator has no GPA, no courses and no fees, so every student link would render an empty
 * shell for them; a student must never see the audit trail at all.
 */
const studentNav = [
  { to: '/dashboard', label: 'Overview' },
  { to: '/courses', label: 'Course Registration' },
  { to: '/fees', label: 'Fee Statement' },
  { to: '/results', label: 'Examination Results' },
]

const adminNav = [{ to: '/admin', label: 'Audit Trail' }]

export function Masthead() {
  const { student, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const links = student?.role === 'ADMIN' ? adminNav : studentNav

  return (
    <header className="sticky top-0 z-30">
      {/* ---- Tier 1: navy brand bar ---- */}
      <div className="bg-navy-950 text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-3">
            <Crest size={38} variant="light" />
            <div className="leading-tight">
              <p className="font-display text-[17px] font-semibold text-white">{brand.name}</p>
              <p className="hidden text-[10px] uppercase tracking-institutional text-gold-400/90 sm:block">
                {brand.motto}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-emerald-300 sm:inline-flex">
              <ShieldCheck className="h-3.5 w-3.5" /> Trust {student?.trustScore}
            </span>

            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-full border border-gold-500/40 bg-navy-900 font-display text-sm font-semibold text-gold-400">
                {student?.fullName.charAt(0)}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-[13px] font-semibold text-white">{student?.fullName}</p>
                <p className="text-[11px] text-navy-400">{student?.studentId}</p>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="grid h-8 w-8 place-items-center rounded-md text-navy-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            <button
              className="grid h-9 w-9 place-items-center rounded-md text-navy-200 hover:bg-white/10 lg:hidden"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ---- Tier 2: nav bar ---- */}
      <div className="border-b border-navy-100 bg-white">
        <div className="mx-auto max-w-6xl px-5 lg:px-8">
          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            {links.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'relative -mb-px border-b-2 py-3.5 text-[13.5px] font-semibold transition-colors',
                    isActive
                      ? 'border-gold-500 text-navy-900'
                      : 'border-transparent text-navy-500 hover:text-navy-900',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Mobile nav (collapsible) */}
          {menuOpen && (
            <nav className="flex flex-col py-2 lg:hidden">
              {links.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center justify-between rounded-md px-3 py-3 text-sm font-semibold',
                      isActive ? 'bg-navy-50 text-navy-900' : 'text-navy-600',
                    )
                  }
                >
                  {label}
                  {}
                  <ChevronDown className="h-4 w-4 -rotate-90 text-navy-300" />
                </NavLink>
              ))}
            </nav>
          )}
        </div>
      </div>
    </header>
  )
}
