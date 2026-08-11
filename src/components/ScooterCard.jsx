import { ChevronRight } from 'lucide-react'
import LiveTimer from './LiveTimer'
import { STATUS_LABELS, TYPE_LABELS } from '../constants'
import { buildIssueList } from '../utils/deviceCondition'

export default function ScooterCard({ scooter, onClick }) {
  const status = scooter.status

  // Get status color configs
  const statusConfig = {
    available: {
      hoverBorder: 'hover:border-[var(--color-green-ring)]',
      stripBg: 'bg-[var(--color-green)]',
      dotBg: 'bg-[var(--color-green)]',
      textClass: 'text-[var(--color-green)]',
    },
    'in-use': {
      hoverBorder: 'hover:border-[var(--color-accent-ring)]',
      stripBg: 'bg-[var(--color-accent)]',
      dotBg: 'bg-[var(--color-accent)] dot-pulse',
      textClass: 'text-[var(--color-accent)]',
    },
    rusak: {
      hoverBorder: 'hover:border-[var(--color-red-ring)]',
      stripBg: 'bg-[var(--color-red)]',
      dotBg: 'bg-[var(--color-red)]',
      textClass: 'text-[var(--color-red)]',
    },
    maintenance: {
      hoverBorder: 'hover:border-[var(--color-warning-ring)]',
      stripBg: 'bg-[var(--color-warning)]',
      dotBg: 'bg-[var(--color-warning)]',
      textClass: 'text-[var(--color-warning)]',
    }
  }

  const config = statusConfig[status] || statusConfig.available
  const deviceCondition = scooter.deviceCondition

  return (
    <div
      onClick={() => onClick?.(scooter)}
      className={`
        relative flex flex-col gap-3 overflow-hidden
        rounded-xl border bg-[var(--color-surface)] p-4
        transition-shadow duration-200 hover:shadow-lg
        border-[var(--color-border)] ${config.hoverBorder}
        ${onClick ? 'cursor-pointer group' : ''}
      `}
    >
      {/* Status strip */}
      <div className={`absolute left-0 top-0 h-full w-[3px] rounded-l-xl ${config.stripBg}`} />

      {/* Header */}
      <div className="flex items-start justify-between pl-2">
        <div>
          <p className="text-[14px] font-bold font-mono text-[var(--color-accent)]">
            {scooter.id}
          </p>
          <p className="text-[11px] text-[var(--color-muted)] font-medium">
            {TYPE_LABELS[scooter.type] || scooter.type}
          </p>
        </div>
        {onClick ? (
          <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-subtle)] opacity-0 transition-opacity group-hover:opacity-100">
            Detail <ChevronRight size={11} />
          </span>
        ) : (
          <span className={`
            rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide
            ${scooter.type === 'sd'
              ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
              : 'bg-[var(--color-surface-3)] text-[var(--color-muted)]'
            }
          `}>
            {scooter.type.toUpperCase()}
          </span>
        )}
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 pl-2">
        <span className={`h-2 w-2 rounded-full shrink-0 ${config.dotBg}`} />
        <span className={`text-[12px] font-medium ${config.textClass}`}>
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      {/* Device condition alert (rusak component) */}
      {deviceCondition && (
        <div className="pl-2">
          <DeviceAlert condition={deviceCondition} />
        </div>
      )}

      {/* Maintenance note */}
      {(status === 'maintenance' || status === 'rusak') && scooter.maintenanceNote && (
        <div className="mx-2 rounded-lg bg-[var(--color-surface-3)] px-2.5 py-2 text-[11px] text-[var(--color-muted)] border border-[var(--color-border)] leading-normal italic break-all">
          <span className="font-semibold text-[var(--color-warning)] not-italic">Catatan: </span>
          {scooter.maintenanceNote}
        </div>
      )}

      {/* Time */}
      <div className="pl-2">
        <LiveTimer status={status} lastUpdated={scooter.lastUpdated} />
      </div>
    </div>
  )
}

/** Tiny row of bad/warn device components, e.g. "Baterai drop" */
function DeviceAlert({ condition }) {
  const issues = buildIssueList(condition)
  if (issues.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {issues.map(issue => (
        <span
          key={issue.text}
          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
            issue.tone === 'warn'
              ? 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'
              : 'bg-[var(--color-red-subtle)] text-[var(--color-red)]'
          }`}
        >
          {issue.text}
        </span>
      ))}
    </div>
  )
}
