import { useState } from 'react'
import { Plus, Download, Trash2, Search, Bike, AlertCircle, ShieldAlert, Database, FolderArchive, FileSpreadsheet } from 'lucide-react'
import { useScooterData } from '../hooks/useScooterData'
import { addScooter, deleteScooter, updateScooter, downloadScooterQR, downloadAllScooterQRs, downloadDatabaseBackup, exportScooterConditionsToExcel } from '../storage'
import { showConfirmDialog, showPromptDialog, showMaintenanceDialog, showErrorAlert, showToastNotification } from '../utils/swal'

export default function ManagePage() {
  const { scooters, activityLog, loading, error: dbError, refresh } = useScooterData()
  const [idInput, setIdInput] = useState('')
  const [type, setType] = useState('sd')
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [sortBy, setSortBy] = useState('id-asc')
  const [error, setError] = useState('')
  const [downloadingId, setDownloadingId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [zippingAll, setZippingAll] = useState(false)
  const [exportingXls, setExportingXls] = useState(false)

  const handleExportXls = async () => {
    try {
      setExportingXls(true)
      await exportScooterConditionsToExcel(scooters)
      showToastNotification({ icon: 'success', title: 'File XLS berhasil diunduh' })
    } catch (err) {
      showErrorAlert('Gagal Export', err.message)
    } finally {
      setExportingXls(false)
    }
  }

  const handleBackup = async () => {
    try {
      setBackingUp(true)
      await downloadDatabaseBackup()
      showToastNotification({ icon: 'success', title: 'Backup DB Berhasil' })
    } catch (err) {
      showErrorAlert('Gagal Backup', err.message)
    } finally {
      setBackingUp(false)
    }
  }

  // Calculate today's checkout frequency per scooter
  const getTodayCheckoutCount = (scooterId) => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return (activityLog || []).filter(e =>
      e.scooterId === scooterId &&
      e.action === 'checkout' &&
      e.timestamp &&
      new Date(e.timestamp).toISOString().slice(0, 10) === todayStr
    ).length
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      await addScooter({ id: idInput, type })
      setIdInput('')
      setType('sd')
      await refresh()
    } catch (err) {
      setError(err.message || 'Gagal menambahkan scooter.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    const res = await showConfirmDialog({
      title: 'Hapus Unit Scooter?',
      text: `Apakah Anda yakin ingin menghapus scooter ${id}? Tindakan ini tidak dapat dibatalkan.`,
      confirmText: 'Ya, Hapus Unit',
      cancelText: 'Batal',
      icon: 'warning'
    })

    if (res.isConfirmed) {
      try {
        await deleteScooter(id)
        await refresh()
      } catch (err) {
        showErrorAlert('Gagal Hapus', err.message)
      }
    }
  }

  const handleStatusChange = async (id, newStatus) => {
    try {
      let fields = { status: newStatus }

      if (newStatus === 'maintenance') {
        const current = scooters.find(s => s.id === id)
        const res = await showMaintenanceDialog({
          title: 'Mulai Maintenance',
          text: `Catat lokasi dan kendala untuk unit ${id} agar tim perbaikan dapat bertindak.`,
          defaultValue: current?.maintenanceNote || ''
        })

        if (!res.isConfirmed) return // User cancelled prompt
        fields.location = res.value.location
        fields.issue = res.value.issue
        fields.note = res.value.note || ''
        fields.maintenanceNote = res.value.issue
      } else if (newStatus === 'rusak') {
        const res = await showPromptDialog({
          title: 'Catatan Kerusakan',
          text: `Masukkan catatan kerusakan untuk unit ${id} (opsional):`,
          placeholder: 'Contoh: Tidak menyala, baterai drop',
          defaultValue: ''
        })
        if (!res.isConfirmed) return
        fields.maintenanceNote = (res.value || '').trim()
      } else {
        fields.maintenanceNote = ''
      }

      await updateScooter(id, fields)
      await refresh()
    } catch (err) {
      showErrorAlert('Gagal Ubah Status', err.message)
    }
  }

  const handleDownloadQR = async (scooter) => {
    try {
      setDownloadingId(scooter.id)
      await downloadScooterQR(scooter)
    } catch (err) {
      showErrorAlert('Gagal Unduh QR Code', err.message)
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadAllQR = async () => {
    try {
      setZippingAll(true)
      await downloadAllScooterQRs(scooters)
      showToastNotification({ icon: 'success', title: 'Semua QR Code diunduh' })
    } catch (err) {
      showErrorAlert('Gagal Unduh QR Code', err.message)
    } finally {
      setZippingAll(false)
    }
  }

  // Filter and sort scooters
  const filtered = scooters
    .filter((s) => {
      const matchesSearch = s.id.toLowerCase().includes(search.toLowerCase())
      const matchesType = filterType === 'all' || s.type === filterType
      const matchesStatus = filterStatus === 'all' || s.status === filterStatus
      return matchesSearch && matchesType && matchesStatus
    })
    .sort((a, b) => {
      if (sortBy === 'id-asc') {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0
        const prefixA = a.id.replace(/\d/g, '')
        const prefixB = b.id.replace(/\d/g, '')
        if (prefixA !== prefixB) return prefixA.localeCompare(prefixB)
        return numA - numB
      }
      if (sortBy === 'id-desc') {
        const numA = parseInt(a.id.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(b.id.replace(/\D/g, ''), 10) || 0
        const prefixA = a.id.replace(/\d/g, '')
        const prefixB = b.id.replace(/\d/g, '')
        if (prefixA !== prefixB) return prefixB.localeCompare(prefixA)
        return numB - numA
      }
      if (sortBy === 'today-checkout') {
        return getTodayCheckoutCount(b.id) - getTodayCheckoutCount(a.id)
      }
      if (sortBy === 'status') {
        const order = { available: 1, 'in-use': 2, rusak: 3, maintenance: 4 }
        return (order[a.status] || 99) - (order[b.status] || 99)
      }
      if (sortBy === 'type') {
        return a.type.localeCompare(b.type)
      }
      return 0
    })

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-[var(--color-text)]">Kelola Scooter</h1>
          <p className="mt-0.5 text-[13px] text-[var(--color-muted)]">
            Tambah unit scooter baru, ubah status unit, dan unduh QR code untuk operasional
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportXls}
            disabled={exportingXls || scooters.length === 0}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[12px] font-semibold text-[var(--color-text)] shadow-sm transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exportingXls ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                Mengexport...
              </>
            ) : (
              <>
                <FileSpreadsheet size={15} className="text-[var(--color-accent)]" />
                Export Kondisi Unit
              </>
            )}
          </button>
          <button
            onClick={handleDownloadAllQR}
            disabled={zippingAll || scooters.length === 0}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[12px] font-semibold text-[var(--color-text)] shadow-sm transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {zippingAll ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                Membuat ZIP...
              </>
            ) : (
              <>
                <FolderArchive size={15} className="text-[var(--color-accent)]" />
                Unduh Semua QR
              </>
            )}
          </button>
          <button
            onClick={handleBackup}
            disabled={backingUp}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-[12px] font-semibold text-[var(--color-text)] shadow-sm transition-all hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {backingUp ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
                Mengunduh Backup...
              </>
            ) : (
              <>
                <Database size={15} className="text-[var(--color-accent)]" />
                Backup Basis Data
              </>
            )}
          </button>
        </div>
      </div>

      {dbError && scooters.length === 0 ? (
        <div className="flex h-[50vh] flex-col items-center justify-center rounded-2xl border border-[var(--color-red-ring)] bg-[var(--color-surface)] p-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-red-subtle)] text-[var(--color-red)]">
            <ShieldAlert size={24} />
          </div>
          <h3 className="text-[14px] font-semibold text-[var(--color-text)]">Koneksi Basis Data Gagal</h3>
          <p className="mt-1.5 max-w-sm text-[12px] text-[var(--color-muted)] leading-relaxed">{dbError}</p>
          <button
            onClick={refresh}
            className="mt-6 cursor-pointer rounded-lg bg-[var(--color-accent)] px-5 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Coba Hubungkan Kembali
          </button>
        </div>
      ) : (
        <>
          {dbError && (
            <div className="flex items-start gap-3 rounded-xl border border-[var(--color-red-ring)] bg-[var(--color-red-subtle)] p-4 text-[12px] text-[var(--color-red)]">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold">Data Lokal Bermasalah</p>
                <p className="mt-0.5 opacity-90">{dbError}</p>
              </div>
              <button
                onClick={refresh}
                className="cursor-pointer rounded border border-[var(--color-red-ring)] bg-transparent px-2.5 py-1 text-[11px] font-semibold text-[var(--color-red)] transition-colors hover:bg-[var(--color-red-subtle)]"
              >
                Coba Lagi
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_1fr]">
        {/* Left column: Add Form */}
        <div className="h-fit rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm p-5">
          <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
            Tambah Unit Baru
          </h2>

          <form onSubmit={handleAdd} className="space-y-4">
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
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '')
                    setIdInput(val)
                    setError('')
                  }}
                  placeholder="099 (Auto jika kosong)"
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-12 pr-3 py-2 font-mono text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all placeholder:text-[var(--color-subtle)]"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[var(--color-muted)]">Jenis Scooter</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
              >
                <option value="sd">Standar (SD)</option>
                <option value="sj">Jumbo (SJ)</option>
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

        {/* Right column: Scooter List & Actions */}
        <div className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm overflow-hidden">
          {/* List Toolbar */}
          <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
              Daftar Unit ({filtered.length})
            </h2>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--color-subtle)]" />
                <input
                  type="text"
                  placeholder="Cari ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] pl-8 pr-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all"
                />
              </div>

              {/* Status Filter */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
              >
                <option value="all">Semua Status</option>
                <option value="available">Tersedia</option>
                <option value="in-use">Online</option>
                <option value="rusak">Offline / Rusak</option>
                <option value="maintenance">Maintenance</option>
              </select>

              {/* Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-3 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-all cursor-pointer"
              >
                <option value="all">Semua Jenis</option>
                <option value="sd">Standar (SD)</option>
                <option value="sj">Jumbo (SJ)</option>
              </select>

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
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
            {loading && filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent mb-2" />
                <p className="text-[13px] text-[var(--color-muted)]">Memuat data scooter...</p>
              </div>
            ) : filtered.length === 0 ? (
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
                  {filtered.map((scooter) => (
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
                          {scooter.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'}
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
                              onChange={(e) => handleStatusChange(scooter.id, e.target.value)}
                              className={`rounded border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2 py-1 text-[12px] font-medium outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] cursor-pointer transition-all ${
                                scooter.status === 'available'
                                  ? 'text-[var(--color-green)] border-[var(--color-green-ring)]'
                                  : scooter.status === 'rusak'
                                    ? 'text-[var(--color-red)] border-[var(--color-red-ring)]'
                                    : 'text-[var(--color-warning)] border-[var(--color-warning-ring)]'
                              }`}
                            >
                              <option value="available">Tersedia</option>
                              <option value="rusak">Offline / Rusak</option>
                              <option value="maintenance">Maintenance</option>
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
                            getTodayCheckoutCount(scooter.id) > 0
                              ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                              : 'bg-[var(--color-surface-3)] text-[var(--color-muted)]'
                          }`}
                        >
                          {getTodayCheckoutCount(scooter.id)}x keluar
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownloadQR(scooter)}
                            disabled={downloadingId === scooter.id}
                            title="Unduh QR Code"
                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(scooter.id)}
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
      </div>
    </>
  )}
</div>
  )
}
