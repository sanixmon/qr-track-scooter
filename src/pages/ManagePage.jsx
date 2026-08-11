import { useState } from 'react'
import { ShieldAlert, Database, FolderArchive, FileSpreadsheet } from 'lucide-react'
import { useScooterData } from '../hooks/useScooterData'
import { addScooter, deleteScooter, updateScooter, downloadScooterQR, downloadAllScooterQRs, downloadDatabaseBackup, exportScooterConditionsToExcel } from '../storage'
import { showConfirmDialog, showPromptDialog, showMaintenanceDialog, showErrorAlert, showToastNotification } from '../utils/swal'
import { STATUS_ORDER } from '../constants'
import { AddScooterForm, ScooterTable } from '../components/ManageComponents'

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

  // Calculate today's checkout frequency per scooter (local date, WIB-safe)
  const localDateKey = (d) => {
    const dt = d instanceof Date ? d : new Date(d)
    if (isNaN(dt.getTime())) return null
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }

  const getTodayCheckoutCount = (scooterId) => {
    const todayStr = localDateKey(new Date())
    return (activityLog || []).filter(e =>
      e.scooterId === scooterId &&
      e.action === 'checkout' &&
      e.timestamp &&
      localDateKey(new Date(e.timestamp)) === todayStr
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
        return (STATUS_ORDER[a.status] || 99) - (STATUS_ORDER[b.status] || 99)
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
            <AddScooterForm
              type={type}
              onTypeChange={setType}
              idInput={idInput}
              onIdInput={(val) => { setIdInput(val); setError('') }}
              onSubmit={handleAdd}
              error={error}
              submitting={submitting}
              loading={loading}
            />
            <ScooterTable
              scooters={filtered}
              loading={loading}
              search={search}
              onSearch={setSearch}
              filterStatus={filterStatus}
              onFilterStatus={setFilterStatus}
              filterType={filterType}
              onFilterType={setFilterType}
              sortBy={sortBy}
              onSortBy={setSortBy}
              getTodayCount={getTodayCheckoutCount}
              downloadingId={downloadingId}
              onDownloadQR={handleDownloadQR}
              onDelete={handleDelete}
              onStatusChange={handleStatusChange}
            />
          </div>
        </>
      )}
    </div>
  )
}
