import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QrCode, Search, ArrowUpRight, ArrowDownLeft, Calendar, ShieldAlert } from 'lucide-react'
import { useScooterData } from '../hooks/useScooterData'
import DashboardStats from '../components/DashboardStats'
import ScooterGrid from '../components/ScooterGrid'
import TypeSummary from '../components/TypeSummary'
import ActivityFeed from '../components/ActivityFeed'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

export default function DashboardPage() {
  const { scooters, activityLog, loading, error, refresh } = useScooterData()

  // Dashboard grid filters
  const [gridStatus, setGridStatus] = useState('all')
  const [gridType, setGridType] = useState('all')

  // Activity log filters
  const [search, setSearch] = useState('')
  const [filterAction, setFilterAction] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  // Filter grid scooters
  const filteredScooters = scooters.filter((s) => {
    const matchesStatus = gridStatus === 'all' || s.status === gridStatus
    const matchesType = gridType === 'all' || s.type === gridType
    return matchesStatus && matchesType
  })

  // Filter activity log
  const filteredLog = activityLog.filter((entry) => {
    const matchesSearch = entry.scooterId.toLowerCase().includes(search.toLowerCase())
    const matchesAction = filterAction === 'all' || entry.action === filterAction
    return matchesSearch && matchesAction
  })

  // Pagination
  const totalPages = Math.ceil(filteredLog.length / itemsPerPage)
  const paginatedLog = filteredLog.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--color-text)]">Dashboard</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
            Pantau status sepeda secara real-time
          </p>
        </div>
        <Link to="/scan">
          <button className="flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)] cursor-pointer">
            <QrCode size={15} />
            Scan
          </button>
        </Link>
      </div>

      {error && scooters.length === 0 ? (
        <div className="flex h-[50vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-red-ring)] bg-[var(--color-surface)] p-12 text-center">
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
        <div className="flex h-[50vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-accent)] border-t-transparent mb-4" />
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Memuat Data Lokal...</h3>
          <p className="mt-1 text-[12px] text-[var(--color-muted)]">Sedang membaca data unit dan aktivitas terbaru.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--color-red-ring)] bg-[var(--color-red-subtle)] p-4 text-[12px] text-[var(--color-red)]">
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
          <DashboardStats scooters={scooters} activityLog={activityLog} />

          {/* Main Grid: Left content, Right sidebars */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Scooter Section with Grid Filters */}
              <div className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                    Status Sepeda ({filteredScooters.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    {/* Status Filter */}
                    <select
                      value={gridStatus}
                      onChange={(e) => setGridStatus(e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                    >
                      <option value="all">Semua Status</option>
                      <option value="available">Tersedia</option>
                      <option value="in-use">Disewakan</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                    {/* Type Filter */}
                    <select
                      value={gridType}
                      onChange={(e) => setGridType(e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                    >
                      <option value="all">Semua Jenis</option>
                      <option value="sd">Standar (SD)</option>
                      <option value="sj">Jumbo (SJ)</option>
                    </select>
                  </div>
                </div>
                {filteredScooters.length === 0 ? (
                  <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center text-[12px] text-[var(--color-muted)]">
                    Tidak ada sepeda yang cocok dengan filter status/jenis.
                  </p>
                ) : (
                  <ScooterGrid scooters={filteredScooters} />
                )}
              </div>

              {/* Detailed Activity History Table */}
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
                {/* Header / Filter bar */}
                <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                      Riwayat Aktivitas Lengkap
                    </h2>
                    <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      Total {filteredLog.length} riwayat ditemukan
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Search */}
                    <div className="relative">
                      <Search size={12} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--color-subtle)]" />
                      <input
                        type="text"
                        placeholder="Cari ID..."
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value)
                          setCurrentPage(1)
                        }}
                        className="w-32 sm:w-40 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-7 pr-2.5 py-1.5 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                      />
                    </div>

                    {/* Filter Action */}
                    <select
                      value={filterAction}
                      onChange={(e) => {
                        setFilterAction(e.target.value)
                        setCurrentPage(1)
                      }}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
                    >
                      <option value="all">Semua</option>
                      <option value="checkout">Keluar</option>
                      <option value="return">Masuk</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  {paginatedLog.length === 0 ? (
                    <p className="p-8 text-center text-[12px] text-[var(--color-muted)]">
                      Tidak ada data riwayat yang cocok.
                    </p>
                  ) : (
                    <table className="w-full text-left text-[12px]">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                          <th className="px-4 py-2.5">ID Sepeda</th>
                          <th className="px-4 py-2.5">Jenis</th>
                          <th className="px-4 py-2.5">Status Baru</th>
                          <th className="px-4 py-2.5">Waktu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {paginatedLog.map((entry) => {
                          const isCheckout = entry.action === 'checkout'
                          const timeStr = (() => {
                            try {
                              return format(new Date(entry.timestamp), 'dd MMM yyyy, HH:mm:ss', { locale: localeId })
                            } catch {
                              return '-'
                            }
                          })()

                          return (
                            <tr key={entry.id} className="hover:bg-[var(--color-surface-3)] transition-colors">
                              <td className="px-4 py-2.5 font-mono font-bold text-[var(--color-accent)]">
                                {entry.scooterId}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="rounded bg-[var(--color-surface-3)] px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--color-muted)]">
                                  {entry.scooterType === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    isCheckout
                                      ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]'
                                      : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]'
                                  }`}
                                >
                                  {isCheckout ? <ArrowUpRight size={10} /> : <ArrowDownLeft size={10} />}
                                  {isCheckout ? 'Dipakai' : 'Tersedia'}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-[var(--color-muted)] font-medium">
                                <div className="flex items-center gap-1">
                                  <Calendar size={11} className="text-[var(--color-subtle)]" />
                                  {timeStr}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-[11px]">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="rounded border border-[var(--color-border)] px-3 py-1 text-[var(--color-text)] hover:bg-[var(--color-surface-3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Sebelumnya
                    </button>
                    <span className="text-[var(--color-muted)] font-medium">
                      Halaman {currentPage} dari {totalPages}
                    </span>
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="rounded border border-[var(--color-border)] px-3 py-1 text-[var(--color-text)] hover:bg-[var(--color-surface-3)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Berikutnya
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (Sidebar panels) */}
            <div className="space-y-6">
              {/* Type Summary Breakdown */}
              <TypeSummary scooters={scooters} />

              {/* Activity Feed compact feed */}
              <ActivityFeed log={activityLog} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
