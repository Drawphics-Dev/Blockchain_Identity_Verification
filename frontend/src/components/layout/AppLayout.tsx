import { Outlet } from 'react-router-dom'
import { Masthead } from './Masthead'
import { brand } from '@/config/brand'

export function AppLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <Masthead />
      <main className="mx-auto max-w-6xl px-5 py-8 lg:px-8 lg:py-10">
        <div className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <footer className="border-t border-navy-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-navy-400 sm:flex-row lg:px-8">
          <p>
            © {new Date().getFullYear()} {brand.name} · Established {brand.established}
          </p>
          <p className="inline-flex items-center gap-1.5">
            Secured by Zero Trust verification &amp; blockchain audit
          </p>
        </div>
      </footer>
    </div>
  )
}
