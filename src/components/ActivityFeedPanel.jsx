import { ArrowUpRight, ArrowDownLeft, CalendarDays } from 'lucide-react'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { TYPE_LABELS } from '../constants'

/** Activity log feed — used in both the two-column layout and full-width clean view */
export default function ActivityFeedPanel({ logForDate, isLiveView, fullWidth = false }) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
      <div className="border-b border-[var(--color-border)] p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-subtle)] flex items-center gap-2">
          {isLiveView ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          ) : (
            <CalendarDays size={12} className="text-[var(--color-accent)]" />
          )}
          {isLiveView ? 'Aktivitas Terkini' : 'Riwayat Aktivitas'}
        </h2>
        <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
          {logForDate.length} transaksi keluar/masuk
        </p>
      </div>

      <div className={`divide-y divide-[var(--color-border)] overflow-y-auto flex-1 ${fullWidth ? 'max-h-[calc(100vh-340px)]' : 'max-h-[600px]'}`}>
        {logForDate.length === 0 ? (
          <p className="p-8 text-center text-[12px] text-[var(--color-muted)]">
            {isLiveView ? 'Belum ada aktivitas hari ini.' : 'Tidak ada aktivitas pada tanggal ini.'}
          </p>
        ) : (
          logForDate.map((entry) => {
            const isCheckout = entry.action === 'checkout'
            const timeStr = (() => {
              try { return format(parseISO(entry.timestamp), 'HH:mm:ss', { locale: localeId }) }
              catch { return '-' }
            })()
            const timeAgo = isLiveView ? (() => {
              try { return formatDistanceToNow(parseISO(entry.timestamp), { addSuffix: true, locale: localeId }) }
              catch { return '' }
            })() : null

            return (
              <div key={entry.id} className={`p-3.5 flex items-start gap-3 hover:bg-[var(--color-surface-3)] transition-colors ${fullWidth ? 'px-5' : ''}`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isCheckout ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]' : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]'
                }`}>
                  {isCheckout ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-bold text-[var(--color-accent)]">{entry.scooterId}</span>
                    <span className="text-[11px] text-[var(--color-muted)] font-mono">{timeStr}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    Unit {TYPE_LABELS[entry.scooterType] || entry.scooterType} {isCheckout ? 'disewa (checkout)' : 'dikembalikan (return)'}
                  </p>
                  {timeAgo && <p className="text-[10px] text-[var(--color-subtle)] mt-0.5">{timeAgo}</p>}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
