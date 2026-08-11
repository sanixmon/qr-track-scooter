import { Plus, Search, Download, Trash2, Bike, AlertCircle } from 'lucide-react'
import { STATUS_LABELS, TYPE_LABELS } from '../constants'

/**
 * Left column form: add a new scooter unit.
 * Extracted from ManagePage to keep page files manageable.
 */
export function AddScooterForm({ type, onTypeChange, idInput, onIdInput, onSubmit, error, submitting, loading }) {
  return (
    <div className="h-fit rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm p-5">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
        Tambah Unit Baru
      </h2>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-[var(--color-red-subtle)] p-3 text-[12px] text-[var(--color-red)]">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--color-muted)]">ID Scooter (Opsional)</label>
          <div className="relative flex items-center">
            <span className="absolute left-3 font-mono text-[13px] font-bold text-[var(--color-accent)] pointer-events-none select-none">
              {type.toUpperCase()}-
            </span>
            <input
              type="text"
              value={idInput}
              onChange={(e) => onIdInput(e.target.value.replace(/\D/g, ''))}
              placeholder="099 (Auto jika kosong)"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-12 pr-3 py-2 font-mono text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all placeholder:text-[var(--color-subtle)]"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-[var(--color-muted)]">Jenis Scooter</label>
          <select
            value={type}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
          >
            <option value="sd">{TYPE_LABELS.sd}</option>
            <option value="sj">{TYPE_LABELS.sj}</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={submitting || loading}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] py-2 text-[13px] font-semibold text-white shadow-sm transition-all hover:bg-[var(--color-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Memproses...
            </>
          ) : (
            <>
              <Plus size={15} />
              Tambah Scooter
            </>
          )}
        </button>
      </form>
    </div>
  )
}

/**
 * Right column: search/filter toolbar + scooter table with per-row actions.
 */
export function ScooterTable({
  scooters,
  loading,
  search,
  onSearch,
  filterStatus,
  onFilterStatus,
  filterType,
  onFilterType,
  sortBy,
  onSortBy,
  getTodayCount,
  downloadingId,
  onDownloadQR,
  onDelete,
  onStatusChange,
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
      {/* List Toolbar */}
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
          Daftar Unit ({scooters.length})
        </h2>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-subtle)]" />
            <input
              type="text"
              placeholder="Cari ID..."
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full sm:w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-8 pr-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => onFilterStatus(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
          >
            <option value="all">Semua Status</option>
            <option value="available">{STATUS_LABELS.available}</option>
            <option value="in-use">{STATUS_LABELS['in-use']}</option>
            <option value="rusak">{STATUS_LABELS.rusak}</option>
            <option value="maintenance">{STATUS_LABELS.maintenance}</option>
          </select>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => onFilterType(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
          >
            <option value="all">Semua Jenis</option>
            <option value="sd">{TYPE_LABELS.sd}</option>
            <option value="sj">{TYPE_LABELS.sj}</option>
          </select>

          {/* Sort By Dropdown */}
          <select
            value={sortBy}
            onChange={(e) => onSortBy(e.target.value)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
          >
            <option value="id-asc">Urutkan: ID (A-Z)</option>
            <option value="id-desc">Urutkan: ID (Z-A)</option>
            <option value="today-checkout">Urutkan: Keluar Hari Ini (Terbanyak)</option>
            <option value="status">Urutkan: Status</option>
            <option value="type">Urutkan: Jenis</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading && scooters.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent mb-2" />
            <p className="text-[13px] text-[var(--color-muted)]">Memuat data scooter...</p>
          </div>
        ) : scooters.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Bike size={28} className="mb-2 text-[var(--color-border-2)]" />
            <p className="text-[13px] text-[var(--color-muted)]">Tidak ada scooter ditemukan.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/50 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                <th className="px-4 py-3">ID Scooter</th>
                <th className="px-4 py-3">Jenis</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Keluar Hari Ini</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {scooters.map((scooter) => (
                <tr key={scooter.id} className="hover:bg-[var(--color-surface-3)] transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-[var(--color-accent)]">
                    {scooter.id}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        scooter.type === 'sd'
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'bg-[var(--color-surface-3)] text-[var(--color-muted)]'
                      }`}
                    >
                      {TYPE_LABELS[scooter.type] || scooter.type.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {scooter.status === 'in-use' ? (
                      <div className="inline-flex items-center gap-1 rounded border border-[var(--color-accent-ring)] bg-[var(--color-surface-3)] px-2 py-1 text-[12px] font-medium text-[var(--color-accent)]">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] dot-pulse" />
                        Online
                      </div>
                    ) : (
                      <div className="flex flex-col items-start">
                        <select
                          value={scooter.status}
                          onChange={(e) => onStatusChange(scooter.id, e.target.value)}
                          className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1 text-[12px] font-medium outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] cursor-pointer transition-all ${
                            scooter.status === 'available'
                              ? 'text-[var(--color-green)] border-[var(--color-green-ring)]'
                              : scooter.status === 'rusak'
                                ? 'text-[var(--color-red)] border-[var(--color-red-ring)]'
                                : 'text-[var(--color-warning)] border-[var(--color-warning-ring)]'
                          }`}
                        >
                          <option value="available">{STATUS_LABELS.available}</option>
                          <option value="rusak">{STATUS_LABELS.rusak}</option>
                          <option value="maintenance">{STATUS_LABELS.maintenance}</option>
                        </select>
                        {(scooter.status === 'maintenance' || scooter.status === 'rusak') && scooter.maintenanceNote && (
                          <p className="mt-1 max-w-[200px] break-words text-[11px] italic text-[var(--color-muted)] leading-tight">
                            Catatan: {scooter.maintenanceNote}
                          </p>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                        getTodayCount(scooter.id) > 0
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'bg-[var(--color-surface-3)] text-[var(--color-muted)]'
                      }`}
                    >
                      {getTodayCount(scooter.id)}x keluar
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onDownloadQR(scooter)}
                        disabled={downloadingId === scooter.id}
                        title="Unduh QR Code"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => onDelete(scooter.id)}
                        title="Hapus Unit"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-red)] hover:text-[var(--color-red)] transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
