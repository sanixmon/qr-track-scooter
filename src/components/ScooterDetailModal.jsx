import { useState, useEffect } from 'react'
import {
  X, Settings2, Lightbulb, Battery, AlertTriangle, Disc3, CircleDot,
  MapPin, Wrench, CheckCircle2, Clock, FileSpreadsheet, Pencil, Loader2, ShieldAlert
} from 'lucide-react'
import { saveDeviceCondition, completeMaintenanceRecord, exportScooterHistoryToExcel } from '../storage'
import { showToastNotification, showErrorAlert, showConfirmDialog } from '../utils/swal'
import LiveTimer from './LiveTimer'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

// ── Device condition config ─────────────────────────────────
const DEVICE_FIELDS = [
  { key: 'setelan',  label: 'Spakbor',     icon: Settings2,     options: [['ada', 'Ada'], ['tidak', 'Tidak']] },
  { key: 'lampu',    label: 'Lampu',       icon: Lightbulb,     options: [['nyala', 'Nyala'], ['redup', 'Redup']] },
  { key: 'baterai',  label: 'Baterai',     icon: Battery,       options: [['normal', 'Normal'], ['drop', 'Drop']] },
  { key: 'monitor',  label: 'Jenis Error', icon: AlertTriangle, options: [['normal', 'Normal'], ['e2', 'E2'], ['e4', 'E4'], ['e16', 'E16'], ['e6', 'E6']] },
  { key: 'rem',      label: 'Rem',         icon: Disc3,         options: [['normal', 'Normal'], ['rusak', 'Rusak']] },
  { key: 'ban',      label: 'Ban',         icon: CircleDot,     options: [['botak', 'Botak'], ['tipis', 'Tipis'], ['aman', 'Aman']] },
]

const STATUS_CONFIG = {
  available:   { dot: 'bg-[var(--color-green)]',    text: 'text-[var(--color-green)]',    label: 'Tersedia' },
  'in-use':    { dot: 'bg-[var(--color-accent)]',   text: 'text-[var(--color-accent)]',   label: 'Online' },
  rusak:       { dot: 'bg-[var(--color-red)]',      text: 'text-[var(--color-red)]',      label: 'Offline / Rusak' },
  maintenance: { dot: 'bg-[var(--color-warning)]',  text: 'text-[var(--color-warning)]',  label: 'Maintenance' },
}

function isBadField(key, value) {
  if (!value) return true
  const bad = { setelan: 'tidak', lampu: 'redup', baterai: 'drop', monitor: 'e2', rem: 'rusak', ban: 'botak' }
  return value === bad[key] || (key === 'monitor' && value !== 'normal')
}

// Warning-tier fields (yellow) — e.g. tire tread is thin but still usable
function isWarnField(key, value) {
  if (!value) return false
  return key === 'ban' && value === 'tipis'
}

function fmtDate(ts) {
  try { return format(new Date(ts), 'dd MMM yyyy, HH:mm', { locale: localeId }) }
  catch { return '-' }
}

export default function ScooterDetailModal({ scooter, activityLog, maintenanceRecords, onClose, onRefresh }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [condition, setCondition] = useState(() => ({
    setelan: scooter.deviceCondition?.setelan ?? 'ada',
    lampu: scooter.deviceCondition?.lampu ?? 'nyala',
    baterai: scooter.deviceCondition?.baterai ?? 'normal',
    monitor: scooter.deviceCondition?.monitor ?? 'normal',
    rem: scooter.deviceCondition?.rem ?? 'normal',
    ban: scooter.deviceCondition?.ban ?? 'aman',
  }))

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const statusConf = STATUS_CONFIG[scooter.status] || STATUS_CONFIG.available

  const scooterLog = activityLog
    .filter(e => e.scooterId === scooter.id)
    .slice(0, 15)

  const scooterMaintenance = maintenanceRecords
    .filter(m => m.scooterId === scooter.id)
    .slice(0, 15)

  const handleSaveCondition = async () => {
    setSaving(true)
    try {
      await saveDeviceCondition(scooter.id, condition)
      await onRefresh()
      setEditing(false)
      showToastNotification({ icon: 'success', title: 'Kondisi perangkat disimpan' })
    } catch (err) {
      showErrorAlert('Gagal Simpan', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCompleteMaintenance = async (record) => {
    const res = await showConfirmDialog({
      title: 'Selesaikan Maintenance?',
      text: `Tandai perbaikan unit ${scooter.id} selesai? Unit akan kembali tersedia.`,
      confirmText: 'Ya, Selesai',
      cancelText: 'Batal',
      icon: 'success'
    })
    if (!res.isConfirmed) return
    try {
      await completeMaintenanceRecord(record.id)
      await onRefresh()
      showToastNotification({ icon: 'success', title: 'Maintenance selesai' })
    } catch (err) {
      showErrorAlert('Gagal', err.message)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportScooterHistoryToExcel(scooter, scooterLog, scooterMaintenance)
      showToastNotification({ icon: 'success', title: 'Excel diunduh' })
    } catch (err) {
      showErrorAlert('Gagal Export', err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="animate-pop-in-simple w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-[var(--color-border-2)] bg-[var(--color-surface)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
          <div className="flex items-center gap-3">
            <div>
              <p className="font-mono text-[16px] font-bold text-[var(--color-text)]">{scooter.id}</p>
              <p className="text-[11px] text-[var(--color-muted)]">
                {scooter.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusConf.text} bg-[var(--color-surface-3)]`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dot} ${scooter.status === 'in-use' ? 'dot-pulse' : ''}`} />
              {statusConf.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-red)] hover:text-[var(--color-red)]"
            aria-label="Tutup"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          {/* ── Status info ── */}
          <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/60 px-4 py-3">
            <LiveTimer status={scooter.status} lastUpdated={scooter.lastUpdated} />
            {scooter.activeMaintenance && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-[var(--color-warning-subtle)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-warning)]">
                <Wrench size={11} /> Dalam Perbaikan
              </span>
            )}
          </div>

          {/* ── Device Condition ── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Kondisi Perangkat
              </h3>
              <button
                onClick={() => setEditing(!editing)}
                className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
              >
                <Pencil size={11} />
                {editing ? 'Batal' : 'Edit'}
              </button>
            </div>

            {editing ? (
              <div className="space-y-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 p-3.5">
                {DEVICE_FIELDS.map(f => (
                  <div key={f.key} className="flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--color-muted)]">
                      <f.icon size={13} className="text-[var(--color-subtle)]" />
                      {f.label}
                    </label>
                    <select
                      value={condition[f.key] || ''}
                      onChange={e => setCondition({ ...condition, [f.key]: e.target.value })}
                      className="w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] cursor-pointer transition-all"
                    >
                      {f.options.map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  onClick={handleSaveCondition}
                  disabled={saving}
                  className="mt-1 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  {saving ? 'Menyimpan...' : 'Simpan Kondisi'}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {DEVICE_FIELDS.map(f => {
                  // Read directly from saved data — no default fallback,
                  // so units never checked show as "Belum dicek"
                  const value = scooter.deviceCondition?.[f.key]
                  const checked = scooter.deviceCondition != null
                  const bad = value ? isBadField(f.key, value) : false
                  const warn = value ? isWarnField(f.key, value) : false
                  const tone = !checked ? 'none' : bad ? 'bad' : warn ? 'warn' : 'good'
                  const toneIcon = {
                    none: 'bg-[var(--color-surface-3)] text-[var(--color-subtle)]',
                    bad:  'bg-[var(--color-red-subtle)] text-[var(--color-red)]',
                    warn: 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]',
                    good: 'bg-[var(--color-green-subtle)] text-[var(--color-green)]',
                  }[tone]
                  const toneText = {
                    none: 'text-[var(--color-subtle)]',
                    bad:  'text-[var(--color-red)]',
                    warn: 'text-[var(--color-warning)]',
                    good: 'text-[var(--color-text)]',
                  }[tone]
                  return (
                    <div key={f.key} className="flex items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2.5">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneIcon}`}>
                        <f.icon size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-[var(--color-muted)]">{f.label}</p>
                        <p className={`text-[12px] font-bold ${toneText}`}>
                          {f.options.find(([v]) => v === value)?.[1] || 'Belum dicek'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Active Maintenance ── */}
          {scooter.activeMaintenance && (
            <div className="rounded-xl border border-[var(--color-warning-ring)] bg-[var(--color-warning-subtle)] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert size={15} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
                  <div>
                    <p className="text-[12px] font-bold text-[var(--color-warning)]">Perbaikan Berjalan</p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      {scooter.activeMaintenance.location === 'outlet' ? 'Di Outlet' : 'Keluar / Di Luar'}
                      {scooter.activeMaintenance.issue ? ` · ${scooter.activeMaintenance.issue}` : ''}
                    </p>
                    {scooter.activeMaintenance.note && (
                      <p className="mt-1 text-[11px] italic text-[var(--color-muted)]">{scooter.activeMaintenance.note}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleCompleteMaintenance(scooter.activeMaintenance)}
                  className="shrink-0 cursor-pointer rounded-lg bg-[var(--color-warning)] px-2.5 py-1.5 text-[11px] font-bold text-white transition-opacity hover:opacity-90"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}

          {/* ── History + Export ── */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                Riwayat Unit ({scooterLog.length})
              </h3>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex cursor-pointer items-center gap-1 text-[11px] font-semibold text-[var(--color-green)] transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {exporting ? <Loader2 size={11} className="animate-spin" /> : <FileSpreadsheet size={11} />}
                {exporting ? 'Membuat...' : 'Export Excel'}
              </button>
            </div>

            {scooterLog.length === 0 && scooterMaintenance.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center text-[12px] text-[var(--color-muted)]">
                Belum ada riwayat untuk unit ini.
              </p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {scooterLog.map(e => {
                  const isCheckout = e.action === 'checkout'
                  return (
                    <div key={e.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isCheckout ? 'bg-[var(--color-red-subtle)] text-[var(--color-red)]' : 'bg-[var(--color-green-subtle)] text-[var(--color-green)]'}`}>
                        <Clock size={13} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold text-[var(--color-text)]">
                          {isCheckout ? 'Keluar (Sewa)' : 'Masuk (Kembali)'}
                        </p>
                        <p className="text-[10px] text-[var(--color-muted)]">{fmtDate(e.timestamp)}</p>
                      </div>
                    </div>
                  )
                })}
                {scooterMaintenance.map(m => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${m.status === 'done' ? 'bg-[var(--color-green-subtle)] text-[var(--color-green)]' : 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'}`}>
                      <Wrench size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-[var(--color-text)]">
                        Maintenance · {m.issue || 'Perbaikan'}
                        <span className={`ml-1.5 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${m.status === 'done' ? 'bg-[var(--color-green-subtle)] text-[var(--color-green)]' : 'bg-[var(--color-warning-subtle)] text-[var(--color-warning)]'}`}>
                          {m.status === 'done' ? 'Selesai' : 'Repair'}
                        </span>
                      </p>
                      <p className="text-[10px] text-[var(--color-muted)]">
                        {m.location === 'outlet' ? 'Di Outlet' : 'Keluar / Di Luar'} · {fmtDate(m.startedAt)}
                        {m.status === 'done' && m.resolvedAt ? ` → Selesai ${fmtDate(m.resolvedAt)}` : ''}
                      </p>
                    </div>
                    {m.status === 'repair' && (
                      <MapPin size={13} className="shrink-0 text-[var(--color-warning)]" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
