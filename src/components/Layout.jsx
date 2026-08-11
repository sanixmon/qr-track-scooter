import { useState, useEffect } from 'react'
import { Outlet, useLocation, NavLink } from 'react-router-dom'
import Sidebar from './Sidebar'
import { LayoutDashboard, Monitor, QrCode, Package, Sun, Moon } from 'lucide-react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/monitor', icon: Monitor, label: 'Monitor' },
  { to: '/scan', icon: QrCode, label: 'Scan' },
  { to: '/manage', icon: Package, label: 'Kelola' },
]

export default function Layout() {
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') !== 'light'
    }
    return true
  })

  useEffect(() => {
    document.documentElement.classList.add('theme-transition-lock')

    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }

    window.getComputedStyle(document.documentElement).opacity
    document.documentElement.classList.remove('theme-transition-lock')
  }, [isDark])

  const pathMap = { '/': 'Dashboard', '/monitor': 'Monitor', '/scan': 'Scan', '/manage': 'Kelola Unit' }
  const currentPathName = pathMap[location.pathname] || 'Dashboard'

  return (
    <div className="flex h-full bg-[var(--color-bg)]">
      {/* Mobile overlay */}
      {open && (
        <div
          className="sidebar-overlay fixed inset-0 z-30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar — desktop only */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col
          w-[var(--sidebar-width)] border-r border-[var(--color-border)]
          bg-[var(--color-surface)] transition-transform duration-200
          max-lg:hidden
        `}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </aside>

      {/* Mobile sidebar slide-over */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col lg:hidden
          w-[var(--sidebar-width)] border-r border-[var(--color-border)]
          bg-[var(--color-surface)] transition-transform duration-200
          ${open ? 'translate-x-0 sidebar-slide-enter' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </aside>

      <div className="flex min-h-full min-w-0 flex-1 flex-col lg:ml-[var(--sidebar-width)]">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-[var(--navbar-height)] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Breadcrumb (Desktop) */}
            <div className="max-lg:hidden flex items-center gap-2 text-[13px]">
              <span className="text-[var(--color-muted)]">Home</span>
              <span className="text-[var(--color-subtle)]">/</span>
              <span className="font-medium text-[var(--color-text)]">{currentPathName}</span>
            </div>
            {/* Brand (Mobile) */}
            <span className="lg:hidden text-[15px] font-bold text-[var(--color-text)]">
              TrackScooter
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsDark(!isDark)}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* Page content — bottom padding for mobile nav */}
        <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+64px)] lg:pb-0">
          <Outlet />
        </main>

        {/* Bottom Navigation — mobile only */}
        <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 backdrop-blur-md lg:hidden pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around h-16">
            {NAV.map(({ to, icon: Icon, label }) => {
              const isActive = location.pathname === to
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex flex-col items-center justify-center gap-0.5 min-w-0 flex-1 h-full rounded-lg transition-colors
                    ${isActive
                      ? 'text-[var(--color-accent)]'
                      : 'text-[var(--color-muted)] hover:text-[var(--color-text)]'
                    }`}
                >
                  <Icon size={20} />
                  <span className="text-[10px] font-semibold leading-tight">{label}</span>
                </NavLink>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
