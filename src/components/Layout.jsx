import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import { Menu, ChevronRight, Sun, Moon } from 'lucide-react'
import { useLocation } from 'react-router-dom'

export default function Layout() {
  const [open, setOpen] = useState(false)
  const location = useLocation()
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

    // Force reflow and remove lock to allow normal hover transitions again
    window.getComputedStyle(document.documentElement).opacity
    document.documentElement.classList.remove('theme-transition-lock')
  }, [isDark])

  // Generate breadcrumb based on current path
  const pathMap = {
    '/': 'Dashboard',
    '/monitor': 'Monitor',
    '/scan': 'Scan',
    '/manage': 'Kelola Unit',
  }
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

      {/* Sidebar — fixed on desktop, slide-over on mobile */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex flex-col
          w-[var(--sidebar-width)] border-r border-[var(--color-border)]
          bg-[var(--color-surface)] transition-transform duration-200
          lg:translate-x-0
          ${open ? 'translate-x-0 sidebar-slide-enter' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setOpen(false)} />
      </aside>

      {/* Main content — offset on desktop */}
      <div className="flex min-h-full flex-1 flex-col lg:ml-[var(--sidebar-width)]">

        {/* Sticky Top Navbar */}
        <header className="sticky top-0 z-20 flex h-[var(--navbar-height)] items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 px-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setOpen(true)}
              className="flex items-center justify-center rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] transition-colors lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            
            {/* Breadcrumb (Desktop) */}
            <div className="hidden lg:flex items-center gap-2 text-[13px]">
              <span className="text-[var(--color-muted)]">Home</span>
              <ChevronRight size={14} className="text-[var(--color-subtle)]" />
              <span className="font-medium text-[var(--color-text)]">{currentPathName}</span>
            </div>
            
            {/* Mobile Brand (Fallback) */}
            <span className="lg:hidden text-[14px] font-semibold text-[var(--color-text)]">
              TrackSepeda
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Theme Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)]"
              aria-label="Toggle Theme"
              title={isDark ? "Ganti ke Light Mode" : "Ganti ke Dark Mode"}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
