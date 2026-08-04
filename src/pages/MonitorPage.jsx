import { useState, useMemo } from 'react'
import { ShieldAlert, ArrowUpRight, ArrowDownLeft, CalendarDays, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react'
import { useScooterData } from '../hooks/useScooterData'
import { formatDistanceToNow, format, isSameDay, startOfDay, parseISO, isToday } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import LiveTimer from '../components/LiveTimer'

// ── Helper: parse timestamp safely ────────────────────────
function parseDate(ts) {
  try { return parseISO(ts) } catch { return null }
}

export default function MonitorPage() {
  const { scooters, activityLog, loading, error, refresh } = useScooterData()
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter]     = useState('all')

  // ── Date history state ────────────────────────────────
  // selectedDate = Date object or null (null = "Hari Ini" live view)
  const today = startOfDay(new Date())
  const [selectedDate, setSelectedDate] = useState(null)

  // Collect all unique dates from activityLog for the date selector
  const availableDates = useMemo(() => {
    const seen = new Set()
    const dates = []
    for (const entry of activityLog) {
      const d = parseDate(entry.timestamp)
      if (!d) continue
      const key = format(d, 'yyyy-MM-dd')
      if (!seen.has(key)) {
        seen.add(key)
        dates.push(startOfDay(d))
      }
    }
    // Sort newest first
    return dates.sort((a, b) => b - a)
  }, [activityLog])

  // Derive the "active" date for filtering
  const activeDate = selectedDate ?? today

  // Whether viewing live (today's real-time data)
  const isLiveView = selectedDate === null || isSameDay(activeDate, today)

  // Activity log filtered to the selected date
  const logForDate = useMemo(() => {
    return activityLog.filter(entry => {
      const d = parseDate(entry.timestamp)
      return d && isSameDay(d, activeDate)
    })
  }, [activityLog, activeDate])

  // Stats for selected date
  const checkoutCount = logForDate.filter(e => e.action === 'checkout').length
  const returnCount   = logForDate.filter(e => e.action === 'return').length

  // Filter grid scooters (only shown in live view)
  const filteredScooters = scooters.filter((s) => {
    const matchesStatus = statusFilter === 'all' || s.status === statusFilter
    const matchesType   = typeFilter === 'all' || s.type === typeFilter
    return matchesStatus && matchesType
  })

  // Navigator between dates
  const currentDateIdx = availableDates.findIndex(d => isSameDay(d, activeDate))
  const canGoPrev = currentDateIdx < availableDates.length - 1

  const goToPrev = () => {
    if (currentDateIdx === -1) {
      // currently on today but not in availableDates (no log today), go to first available
      if (availableDates.length) setSelectedDate(availableDates[0])
    } else if (canGoPrev) {
      setSelectedDate(availableDates[currentDateIdx + 1])
    }
  }

  const goToNext = () => {
    if (currentDateIdx > 0) {
      setSelectedDate(availableDates[currentDateIdx - 1])
    } else {
      setSelectedDate(null) // back to today / live
    }
  }

  // ── Status color configs ──────────────────────────────
  const statusConfigs = {
    available: {
      bg: 'bg-[var(--color-green-subtle)]',
      border: 'border-[var(--color-green-ring)]',
      dot: 'bg-[var(--color-green)]',
      text: 'text-[var(--color-green)]',
      label: 'Tersedia'
    },
    'in-use': {
      bg: 'bg-[var(--color-red-subtle)]',
      border: 'border-[var(--color-red-ring)]',
      dot: 'bg-[var(--color-red)] dot-pulse',
      text: 'text-[var(--color-red)]',
      label: 'Disewakan'
    },
    maintenance: {
      bg: 'bg-[var(--color-warning-subtle)]',
      border: 'border-[var(--color-warning-ring)]',
      dot: 'bg-[var(--color-warning)]',
      text: 'text-[var(--color-warning)]',
      label: 'Maintenance'
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2">
          {isLiveView ? (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          ) : (
            <CalendarDays size={14} className="text-[var(--color-accent)]" />
          )}
          <h1 className="text-[20px] font-bold text-[var(--color-text)]">
            {isLiveView ? 'Live Monitor Lapangan' : 'Riwayat Harian'}
          </h1>
        </div>
        <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
          {isLiveView
            ? 'Pemantauan status dan log aktivitas secara real-time'
            : `Menampilkan riwayat aktivitas — ${format(activeDate, 'EEEE, dd MMMM yyyy', { locale: localeId })}`
          }
        </p>
      </div>

      {/* ── Date Navigator ── */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        {/* Prev day button */}
        <button
          onClick={goToPrev}
          disabled={!canGoPrev && currentDateIdx !== -1}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Date pills */}
        <div className="flex w-full sm:w-auto flex-1 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Today / Live pill */}
          <button
            onClick={() => setSelectedDate(null)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer border ${
              isLiveView
                ? 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'bg-[var(--color-surface-3)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-subtle)]'
            }`}
          >
            <span className={`relative flex h-1.5 w-1.5 ${isLiveView ? '' : 'opacity-0'}`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Hari Ini (Live)
          </button>

          {/* Past date pills (up to last 7 days) */}
          {availableDates.filter(d => !isToday(d)).slice(0, 7).map(d => {
            const key = format(d, 'yyyy-MM-dd')
            const isActive = selectedDate && isSameDay(d, selectedDate)
            return (
              <button
                key={key}
                onClick={() => setSelectedDate(d)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-[var(--color-accent-subtle)] border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'bg-[var(--color-surface-3)] border-[var(--color-border)] text-[var(--color-muted)] hover:border-[var(--color-subtle)]'
                }`}
              >
                {format(d, 'EEE dd/MM', { locale: localeId })}
              </button>
            )
          })}
        </div>

        {/* Native date picker */}
        <input
          type="date"
          value={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd')}
          max={format(today, 'yyyy-MM-dd')}
          onChange={e => {
            if (!e.target.value) { setSelectedDate(null); return }
            const d = startOfDay(parseISO(e.target.value))
            if (isSameDay(d, today)) setSelectedDate(null)
            else setSelectedDate(d)
          }}
          className="h-8 shrink-0 cursor-pointer rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] transition-colors"
        />

        {/* Next day button */}
        <button
          onClick={goToNext}
          disabled={isLiveView}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      {/* ── Daily Stats Bar ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
            <BarChart2 size={15} />
          </div>
          <div>
            <p className="text-[18px] font-bold leading-none text-[var(--color-text)]">{logForDate.length}</p>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Total Transaksi</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-red-subtle)] text-[var(--color-red)]">
            <ArrowUpRight size={15} />
          </div>
          <div>
            <p className="text-[18px] font-bold leading-none text-[var(--color-red)]">{checkoutCount}</p>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Keluar (Sewa)</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-green-subtle)] text-[var(--color-green)]">
            <ArrowDownLeft size={15} />
          </div>
          <div>
            <p className="text-[18px] font-bold leading-none text-[var(--color-green)]">{returnCount}</p>
            <p className="mt-1 text-[10px] text-[var(--color-muted)]">Masuk (Kembali)</p>
          </div>
        </div>
      </div>

      {error && scooters.length === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-red-ring)] bg-[var(--color-surface)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-red-subtle)] text-[var(--color-red)]">
            <ShieldAlert size={24} />
          </div>
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Koneksi Basis Data Gagal</h3>
          <p className="mt-1.5 max-w-sm text-[12px] text-[var(--color-muted)] leading-relaxed">{error}</p>
          <button
            onClick={refresh}
            className="mt-6 cursor-pointer rounded-lg bg-[var(--color-accent)] px-5 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Coba Hubungkan Kembali
          </button>
        </div>
      ) : loading && scooters.length === 0 ? (
        <div className="flex h-[40vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent mb-4" />
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Memuat Data Lokal...</h3>
          <p className="mt-1 text-[12px] text-[var(--color-muted)]">Menyiapkan data untuk petugas lapangan.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-[var(--color-red-ring)] bg-[var(--color-red-subtle)] p-4 text-[12px] text-[var(--color-red)]">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Sinkronisasi Realtime Terganggu</p>
                <p className="mt-0.5 opacity-90">{error}</p>
              </div>
              <button
                onClick={refresh}
                className="cursor-pointer rounded border border-[var(--color-red-ring)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--color-red)] transition-colors hover:bg-[var(--color-red-subtle)]"
              >
                Coba Lagi
              </button>
            </div>
          )}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">

          {/* ── Left Column: Status Grid (live only) or Historical Summary ── */}
          <div className="space-y-4">
            {isLiveView ? (
              <>
                {/* Quick Filter Buttons */}
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-subtle)]">Filter Status</p>
                    <div className="flex flex-wrap gap-2">
                      <FilterTab label="Semua Status" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} count={scooters.length} />
                      <FilterTab label="Tersedia" active={statusFilter === 'available'} onClick={() => setStatusFilter('available')} colorClass="text-[var(--color-green)]" count={scooters.filter(s => s.status === 'available').length} />
                      <FilterTab label="Disewakan" active={statusFilter === 'in-use'} onClick={() => setStatusFilter('in-use')} colorClass="text-[var(--color-red)]" count={scooters.filter(s => s.status === 'in-use').length} />
                      <FilterTab label="Maintenance" active={statusFilter === 'maintenance'} onClick={() => setStatusFilter('maintenance')} colorClass="text-[var(--color-warning)]" count={scooters.filter(s => s.status === 'maintenance').length} />
                    </div>
                  </div>
                  <div className="border-t border-[var(--color-border)] pt-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-subtle)]">Filter Jenis</p>
                    <div className="flex gap-2">
                      <FilterTab label="Semua Jenis" active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} />
                      <FilterTab label="Standar (SD)" active={typeFilter === 'sd'} onClick={() => setTypeFilter('sd')} count={scooters.filter(s => s.type === 'sd').length} />
                      <FilterTab label="Jumbo (SJ)" active={typeFilter === 'sj'} onClick={() => setTypeFilter('sj')} count={scooters.filter(s => s.type === 'sj').length} />
                    </div>
                  </div>
                </div>

                {/* Scooter Grid */}
                {filteredScooters.length === 0 ? (
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center text-[var(--color-muted)]">
                    Tidak ada unit scooter yang cocok dengan filter aktif.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {filteredScooters.map((scooter) => {
                      const conf = statusConfigs[scooter.status] || statusConfigs.available
                      return (
                        <div key={scooter.id} className={`relative flex flex-col gap-3 rounded-xl border p-4 bg-[var(--color-surface)] transition-all ${conf.border}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[15px] font-bold text-[var(--color-text)]">{scooter.id}</span>
                            <span className="rounded bg-[var(--color-surface-3)] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[var(--color-muted)]">{scooter.type.toUpperCase()}</span>
                          </div>
                          <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${conf.bg}`}>
                            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${conf.dot}`} />
                            <span className={`text-[12px] font-bold uppercase tracking-wider ${conf.text}`}>{conf.label}</span>
                          </div>
                          {scooter.status === 'maintenance' && scooter.maintenanceNote && (
                            <div className="flex gap-1.5 rounded-lg bg-[var(--color-surface-3)] p-2 text-[11px] text-[var(--color-muted)] italic leading-normal border border-[var(--color-border)]">
                              <ShieldAlert size={13} className="shrink-0 text-[var(--color-warning)]" />
                              <span>{scooter.maintenanceNote}</span>
                            </div>
                          )}
                          <div className="mt-1">
                            <LiveTimer status={scooter.status} lastUpdated={scooter.lastUpdated} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              /* ── Historical date: per-scooter activity summary ── */
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden">
                <div className="border-b border-[var(--color-border)] px-4 py-3">
                  <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                    Ringkasan per Unit — {format(activeDate, 'dd MMMM yyyy', { locale: localeId })}
                  </h2>
                  <p className="text-[11px] text-[var(--color-muted)] mt-0.5">{logForDate.length} transaksi tercatat hari ini</p>
                </div>
                {logForDate.length === 0 ? (
                  <p className="p-10 text-center text-[12px] text-[var(--color-muted)]">Tidak ada aktivitas pada tanggal ini.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                          <th className="px-4 py-2.5">Unit</th>
                          <th className="px-4 py-2.5">Jenis</th>
                          <th className="px-4 py-2.5">Keluar</th>
                          <th className="px-4 py-2.5">Masuk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {Object.entries(
                          logForDate.reduce((acc, entry) => {
                            if (!acc[entry.scooterId]) acc[entry.scooterId] = { type: entry.scooterType, checkout: 0, return: 0 }
                            if (entry.action === 'checkout') acc[entry.scooterId].checkout++
                            else acc[entry.scooterId].return++
                            return acc
                          }, {})
                        ).sort(([a], [b]) => a.localeCompare(b)).map(([id, data]) => (
                          <tr key={id} className="hover:bg-[var(--color-surface-3)] transition-colors">
                            <td className="px-4 py-2.5 font-mono font-bold text-[var(--color-accent)]">{id}</td>
                            <td className="px-4 py-2.5">
                              <span className="rounded bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--color-muted)]">
                                {data.type === 'sd' ? 'SD' : 'SJ'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1 font-bold text-[var(--color-red)]">
                                <ArrowUpRight size={11} />{data.checkout}x
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              <span className="inline-flex items-center gap-1 font-bold text-[var(--color-green)]">
                                <ArrowDownLeft size={11} />{data.return}x
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Column: Activity Log Feed (filtered by date) ── */}
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
                {isLiveView ? 'Aktivitas Terkini' : format(activeDate, 'dd MMM yyyy', { locale: localeId })}
              </h2>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5">
                {logForDate.length} transaksi keluar/masuk
              </p>
            </div>

            <div className="divide-y divide-[var(--color-border)] overflow-y-auto max-h-[600px] flex-1">
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
                    <div key={entry.id} className="p-3.5 flex items-start gap-3 hover:bg-[var(--color-surface-3)] transition-colors">
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
                          Unit {entry.scooterType === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'} {isCheckout ? 'disewa (checkout)' : 'dikembalikan (return)'}
                        </p>
                        {timeAgo && <p className="text-[10px] text-[var(--color-subtle)] mt-0.5">{timeAgo}</p>}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
        </>
      )}
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
