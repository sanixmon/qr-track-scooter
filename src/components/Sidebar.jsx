import { NavLink } from 'react-router-dom'
import { LayoutDashboard, QrCode, Package, X, Bike, Download, Monitor } from 'lucide-react'
import { exportData } from '../storage'

const NAV = [
  { to: '/',       icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/monitor', icon: Monitor,         label: 'Monitor'    },
  { to: '/scan',   icon: QrCode,          label: 'Scan'       },
  { to: '/manage', icon: Package,         label: 'Kelola Unit' },
]

export default function Sidebar({ onClose }) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-accent)] text-white">
            <Bike size={15} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
            TrackScooter
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-md p-1.5 text-[var(--color-muted)]
            hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)] transition-colors lg:hidden"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
          Menu
        </p>
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                end
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors
                  ${isActive
                    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]'
                  }`
                }
              >
                <Icon size={15} />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <button
          onClick={() => { exportData(); onClose?.() }}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13px]
            font-medium text-[var(--color-muted)] transition-colors
            hover:bg-[var(--color-surface-3)] hover:text-[var(--color-text)]"
        >
          <Download size={14} />
          Export JSON
        </button>
      </div>
    </div>
  )
}
