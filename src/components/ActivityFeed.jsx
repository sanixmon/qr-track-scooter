import { ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

/** Scrollable live activity feed — right sidebar panel */
export default function ActivityFeed({ log }) {
  const items = log.slice(0, 50)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
          Aktivitas Terbaru
        </h2>
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-[var(--color-muted)]">
          Belum ada aktivitas.
        </p>
      ) : (
        <ul className="overflow-y-auto" style={{ maxHeight: '480px' }}>
          {items.map((entry, i) => (
            <FeedItem key={entry.id} entry={entry} isLast={i === items.length - 1} />
          ))}
        </ul>
      )}
    </div>
  )
}

function FeedItem({ entry, isLast }) {
  const isCheckout = entry.action === 'checkout'
  const ago = (() => {
    try { return formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true, locale: localeId }) }
    catch { return '-' }
  })()

  const typeLabel = entry.scooterType === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'

  return (
    <li className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-3)]
      ${!isLast ? 'border-b border-[var(--color-border)]' : ''}`}
    >
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md
        ${isCheckout ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]' : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]'}`}
      >
        {isCheckout ? <ArrowUpRight size={13} /> : <ArrowDownLeft size={13} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[12px] font-bold text-[var(--color-accent)] leading-none">
          {entry.scooterId}
        </p>
        <p className="mt-1 text-[10px] text-[var(--color-muted)] font-medium leading-none">
          {typeLabel} · {ago}
        </p>
      </div>
      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide
        ${isCheckout ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]' : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]'}`}
      >
        {isCheckout ? 'Keluar' : 'Masuk'}
      </span>
    </li>
  )
}
