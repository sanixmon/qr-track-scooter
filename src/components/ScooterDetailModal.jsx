import { useState, useEffect } from 'react'
import {
  X, Settings2, Lightbulb, Battery, AlertTriangle, Disc3, CircleDot,
  MapPin, Wrench, Clock, FileSpreadsheet, Loader2, ShieldAlert, CheckCircle2, ChevronDown
} from 'lucide-react'
import { saveDeviceCondition, completeMaintenanceRecord, exportScooterHistoryToExcel } from '../storage'
import { showToastNotification, showErrorAlert, showConfirmDialog } from '../utils/swal'
import LiveTimer from './LiveTimer'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { DEVICE_FIELDS, STATUS_LABELS } from '../constants'
import { fieldTone } from '../utils/deviceCondition'

// Add per-field icons to the shared field definitions (icons are UI-only)
const DEVICE_FIELDS_WITH_ICONS = DEVICE_FIELDS.map(f => ({
  ...f,
  icon: {
    setelan: Settings2, lampu: Lightbulb, baterai: Battery, monitor: AlertTriangle,
    rem: Disc3, ban: CircleDot,
  }[f.key] || Settings2,
}))

const DEFAULT_CONDITION = {
  setelan: 'ada',
  lampu: 'nyala',
  baterai: 'normal',
  monitor: 'normal',
  rem: 'normal',
  ban: 'aman',
  monitorDetail: '',
}

const STATUS_CONFIG = {
  available:   { dot: 'bg-[var(--color-green)]',    text: 'text-[var(--color-green)]' },
  'in-use':    { dot: 'bg-[var(--color-accent)]',   text: 'text-[var(--color-accent)]' },
  rusak:       { dot: 'bg-[var(--color-red)]',      text: 'text-[var(--color-red)]' },
  maintenance: { dot: 'bg-[var(--color-warning)]',  text: 'text-[var(--color-warning)]' },
}

function fmtDate(ts) {
  try { return format(new Date(ts), 'dd MMM yyyy, HH:mm', { locale: localeId }) }
  catch { return '-' }
}

export default function ScooterDetailModal({ scooter, activityLog, maintenanceRecords, onClose, onRefresh }) {
  const [condition, setCondition] = useState(() => {
    const c = scooter.deviceCondition
    return {
      setelan: c?.setelan ?? DEFAULT_CONDITION.setelan,
      lampu: c?.lampu ?? DEFAULT_CONDITION.lampu,
      baterai: c?.baterai ?? DEFAULT_CONDITION.baterai,
      monitor: c?.monitor ?? DEFAULT_CONDITION.monitor,
      rem: c?.rem ?? DEFAULT_CONDITION.rem,
      ban: c?.ban ?? DEFAULT_CONDITION.ban,
      monitorDetail: c?.monitor_detail ?? '',
    }
  })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  // Snapshot of the last persisted condition — drives the dirty check.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(condition))

  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Dirty tracking — any change enables the Save button.
  const isDirty = JSON.stringify(condition) !== savedSnapshot

  const setField = (key, value) => {
    setCondition(prev => ({ ...prev, [key]: value }))
  }

  // Explicit save — no debounce, no waiting on a checkmark.
  const handleSave = async () => {
    if (saving || !isDirty) return
    setSaving(true)
    try {
      await saveDeviceCondition(scooter.id, condition)
      setSavedSnapshot(JSON.stringify(condition))
      await onRefresh()
      showToastNotification({ icon: 'success', title: 'Kondisi perangkat disimpan' })
    } catch (err) {
      showErrorAlert('Gagal Simpan', err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleMarkAllNormal = () => {
    setCondition({ ...DEFAULT_CONDITION })
  }

  const statusConf = STATUS_CONFIG[scooter.status] || STATUS_CONFIG.available

  const scooterLog = activityLog
    .filter(e => e.scooterId === scooter.id)
    .slice(0, 15)

  const scooterMaintenance = maintenanceRecords
    .filter(m => m.scooterId === scooter.id)
    .slice(0, 15)

  // Effective value: unsaved edits win; otherwise show persisted data —
  // so units never checked keep showing "Belum dicek".
  const effValue = (key) => isDirty ? condition[key] : (scooter.deviceCondition?.[key] ?? '')

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
            </div>              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${statusConf.text} bg-[var(--color-surface-3)]`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusConf.dot} ${scooter.status === 'in-use' ? 'dot-pulse' : ''}`} />
              {STATUS_LABELS[scooter.status] || scooter.status}
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

          {/* ── Device Condition (dropdown per field + Save eksplisit) ── */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-subtle)]">
                  Kondisi Perangkat
                </h3>
                {isDirty && !saving && (
                  <span className="rounded-full bg-[var(--color-warning-subtle)] px-2 py-0.5 text-[9px] font-bold text-[var(--color-warning)]">
                    Belum disimpan
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleMarkAllNormal}
                  disabled={saving}
                  className="flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-3)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--color-green)] transition-colors hover:border-[var(--color-green)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle2 size={11} />
                  Semua Normal
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex cursor-pointer items-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[10px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
            <p className="mb-2.5 text-[10px] text-[var(--color-subtle)]">
              Pilih nilai pada tiap kolom, lalu tekan Simpan
            </p>

            <div className="grid grid-cols-2 gap-2">
              {DEVICE_FIELDS_WITH_ICONS.map(f => {
                const value = effValue(f.key)
                const checked = isDirty || scooter.deviceCondition != null
                const tone = fieldTone(f.key, value, checked)
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
                  <label
                    key={f.key}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-2.5 text-left transition-all hover:border-[var(--color-accent)] hover:shadow-sm ${isDirty ? 'ring-1 ring-[var(--color-accent)]/40' : ''}`}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneIcon}`}>
                      <f.icon size={13} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-[var(--color-muted)]">{f.label}</p>
                      <div className="relative">
                        <select
                          value={value}
                          onChange={e => setField(f.key, e.target.value)}
                          className={`w-full cursor-pointer appearance-none bg-transparent pr-4 text-[12px] font-bold outline-none ${toneText}`}
                        >
                          {value === '' && <option value="">Belum dicek</option>}
                          {f.options.map(([v, label]) => (
                            <option key={v} value={v}>{label}</option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[var(--color-subtle)]" />
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>

            {/* Inline detail input when "Lain Lain" is selected */}
            {effValue('monitor') === 'lain' && (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--color-warning-ring)] bg-[var(--color-warning-subtle)] px-3 py-2">
                <AlertTriangle size={13} className="shrink-0 text-[var(--color-warning)]" />
                <input
                  type="text"
                  value={condition.monitorDetail}
                  onChange={e => setField('monitorDetail', e.target.value)}
                  placeholder="Ketik jenis error lainnya..."
                  maxLength={150}
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-[12px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-subtle)] focus:border-[var(--color-accent)] transition-all"
                />
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
