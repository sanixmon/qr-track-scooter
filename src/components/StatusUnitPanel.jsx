import { ShieldAlert } from 'lucide-react'
import LiveTimer from './LiveTimer'
import { STATUS_LABELS } from '../constants'

/**
 * Filter panel (status + type) and scooter status grid.
 * Extracted from MonitorPage so it stays under control size-wise.
 */
export default function StatusUnitPanel({ scooters, statusFilter, onStatusFilter, typeFilter, onTypeFilter }) {
  const countsByStatus = (status) => scooters.filter(s => s.status === status).length

  return (
    <div className="space-y-4">
      {/* Quick Filter Buttons */}
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-subtle)]">Filter Status</p>
          <div className="flex flex-wrap gap-2">
            <FilterTab label="Semua Status" active={statusFilter === 'all'} onClick={() => onStatusFilter('all')} count={scooters.length} />
            <FilterTab label="Tersedia" active={statusFilter === 'available'} onClick={() => onStatusFilter('available')} colorClass="text-[var(--color-green)]" count={countsByStatus('available')} />
            <FilterTab label="Online" active={statusFilter === 'in-use'} onClick={() => onStatusFilter('in-use')} colorClass="text-[var(--color-accent)]" count={countsByStatus('in-use')} />
            <FilterTab label="Rusak" active={statusFilter === 'rusak'} onClick={() => onStatusFilter('rusak')} colorClass="text-[var(--color-red)]" count={countsByStatus('rusak')} />
            <FilterTab label="Maintenance" active={statusFilter === 'maintenance'} onClick={() => onStatusFilter('maintenance')} colorClass="text-[var(--color-warning)]" count={countsByStatus('maintenance')} />
          </div>
        </div>
        <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-subtle)]">Filter Jenis</p>
          <div className="flex gap-2">
            <FilterTab label="Semua Jenis" active={typeFilter === 'all'} onClick={() => onTypeFilter('all')} />
            <FilterTab label="Standar (SD)" active={typeFilter === 'sd'} onClick={() => onTypeFilter('sd')} count={scooters.filter(s => s.type === 'sd').length} />
            <FilterTab label="Jumbo (SJ)" active={typeFilter === 'sj'} onClick={() => onTypeFilter('sj')} count={scooters.filter(s => s.type === 'sj').length} />
          </div>
        </div>
      </div>

      {/* Scooter Grid */}
      {scooters.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-[var(--color-muted)]">
          Tidak ada unit scooter yang cocok dengan filter aktif.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {scooters.map((scooter) => (
            <UnitCard key={scooter.id} scooter={scooter} />
          ))}
        </div>
      )}
    </div>
  )
}

function UnitCard({ scooter }) {
  const conf = {
    available:   { bg: 'bg-[var(--color-green-subtle)]',   border: 'border-[var(--color-green-ring)]',   dot: 'bg-[var(--color-green)]',   text: 'text-[var(--color-green)]' },
    'in-use':    { bg: 'bg-[var(--color-accent-subtle)]',  border: 'border-[var(--color-accent-ring)]',  dot: 'bg-[var(--color-accent)] dot-pulse', text: 'text-[var(--color-accent)]' },
    rusak:       { bg: 'bg-[var(--color-red-subtle)]',     border: 'border-[var(--color-red-ring)]',     dot: 'bg-[var(--color-red)] dot-pulse',    text: 'text-[var(--color-red)]' },
    maintenance: { bg: 'bg-[var(--color-warning-subtle)]', border: 'border-[var(--color-warning-ring)]', dot: 'bg-[var(--color-warning)]', text: 'text-[var(--color-warning)]' },
  }[scooter.status] || {
    bg: 'bg-[var(--color-green-subtle)]', border: 'border-[var(--color-green-ring)]',
    dot: 'bg-[var(--color-green)]', text: 'text-[var(--color-green)]',
  }

  return (
    <div className={`relative flex flex-col gap-3 rounded-xl border p-4 bg-[var(--color-surface)] transition-all ${conf.border}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[15px] font-bold text-[var(--color-text)]">{scooter.id}</span>
        <span className="rounded bg-[var(--color-surface-3)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[var(--color-muted)]">
          {scooter.type.toUpperCase()}
        </span>
      </div>
      <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${conf.bg}`}>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${conf.dot}`} />
        <span className={`text-[12px] font-bold uppercase tracking-wider ${conf.text}`}>{STATUS_LABELS[scooter.status] || scooter.status}</span>
      </div>
      {(scooter.status === 'maintenance' || scooter.status === 'rusak') && scooter.maintenanceNote && (
        <div className={`flex gap-1.5 rounded-lg bg-[var(--color-surface-3)] p-2 text-[11px] text-[var(--color-muted)] italic leading-normal border border-[var(--color-border)] ${scooter.status === 'rusak' ? 'border-[var(--color-red-ring)]' : ''}`}>
          <ShieldAlert size={13} className={`shrink-0 ${scooter.status === 'rusak' ? 'text-[var(--color-red)]' : 'text-[var(--color-warning)]'}`} />
          <span>{scooter.maintenanceNote}</span>
        </div>
      )}
      <div className="mt-1">
        <LiveTimer status={scooter.status} lastUpdated={scooter.lastUpdated} />
      </div>
    </div>
  )
}

function FilterTab({ label, active, onClick, colorClass = '', count = null }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
        active
          ? 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)] text-[var(--color-accent)]'
          : 'bg-[var(--color-surface-3)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-subtle)]'
      }`}
    >
      <span className={active ? '' : colorClass}>{label}</span>
      {count !== null && (
        <span className={`rounded-full px-1.5 text-[9px] font-bold ${
          active ? 'bg-[var(--color-accent)] text-white' : 'bg-[var(--color-border-2)] text-[var(--color-muted)]'
        }`}>
          {count}
        </span>
      )}
    </button>
  )
}
