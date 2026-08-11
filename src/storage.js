const API = import.meta.env.VITE_API_URL || ''

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  }).catch(err => {
    throw new Error(`Tidak dapat terhubung ke server API: ${err.message}`)
  })

  if (options.raw) return res

  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Permintaan gagal (${res.status})`)
  return data
}

function mapScooterFromApi(s) {
  return {
    id: s.id,
    type: s.type,
    status: s.status,
    maintenanceNote: s.maintenance_note ?? null,
    lastUpdated: s.last_updated,
    deviceCondition: s.device_condition ?? null,
    activeMaintenance: s.active_maintenance ?? null,
    monitorDetail: s.device_condition?.monitor_detail ?? null
  }
}

function mapScooterToApi(fields) {
  const out = {}
  if ('status' in fields) out.status = fields.status
  if ('maintenanceNote' in fields) out.maintenanceNote = fields.maintenanceNote ?? null
  if ('location' in fields) out.location = fields.location
  if ('issue' in fields) out.issue = fields.issue
  if ('note' in fields) out.note = fields.note
  return out
}

function mapLogFromApi(l) {
  return {
    id: l.id,
    scooterId: l.scooter_id,
    scooterType: l.scooter_type,
    action: l.action,
    timestamp: l.timestamp
  }
}

function mapMaintenanceFromApi(m) {
  return {
    id: m.id,
    scooterId: m.scooter_id,
    scooterType: m.scooter_type,
    location: m.location,
    issue: m.issue,
    note: m.note,
    status: m.status,
    startedAt: m.started_at,
    resolvedAt: m.resolved_at
  }
}

export async function getScooters() {
  const data = await api('/api/scooters')
  return data.map(mapScooterFromApi)
}

export async function addScooter({ id, type }) {
  const data = await api('/api/scooters', {
    method: 'POST',
    body: JSON.stringify({ id, type })
  })
  return mapScooterFromApi(data)
}

export async function deleteScooter(id) {
  await api(`/api/scooters/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function updateScooter(id, fields) {
  const data = await api(`/api/scooters/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(mapScooterToApi(fields))
  })
  return mapScooterFromApi(data)
}

export async function getActivityLog() {
  const data = await api('/api/activity-log')
  return data.map(mapLogFromApi)
}

export async function saveDeviceCondition(scooterId, condition) {
  const body = { ...condition }
  if ('monitorDetail' in body) {
    body.monitorDetail = body.monitorDetail ?? null
  }
  const data = await api(`/api/scooters/${encodeURIComponent(scooterId)}/device-condition`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
  return data.device_condition
}

export async function getMaintenanceRecords() {
  const data = await api('/api/maintenance-records')
  return data.map(mapMaintenanceFromApi)
}

export async function completeMaintenanceRecord(recordId) {
  const data = await api(`/api/maintenance-records/${encodeURIComponent(recordId)}/complete`, {
    method: 'POST'
  })
  return data
}

export async function toggleScooterStatus(bikeId, forceMaintenance = false) {
  const data = await api(`/api/scooters/${encodeURIComponent(bikeId)}/toggle`, {
    method: 'POST',
    body: JSON.stringify({ forceMaintenance })
  })

  if (!data.success) return data

  return {
    ...data,
    scooter: data.scooter ? mapScooterFromApi(data.scooter) : undefined
  }
}

export async function downloadScooterQR(scooter) {
  const QRCode = (await import('qrcode')).default
  const dataUrl = await QRCode.toDataURL(scooter.id, {
    width: 400,
    margin: 2,
    color: { dark: '#0d1017', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = `QR-${scooter.id}-${scooter.type.toUpperCase()}.png`
  a.click()
}

export async function downloadAllScooterQRs(scooters) {
  if (!scooters || scooters.length === 0) {
    throw new Error('Belum ada scooter untuk diunduh QR-nya.')
  }

  const [JSZip, QRCode] = await Promise.all([
    import('jszip'),
    import('qrcode'),
  ])
  const zip = new JSZip.default()

  const options = {
    width: 400,
    margin: 2,
    color: { dark: '#0d1017', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  }

  for (const scooter of scooters) {
    const dataUrl = await QRCode.default.toDataURL(scooter.id, options)
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    zip.file(`QR-${scooter.id}-${scooter.type.toUpperCase()}.png`, base64, { base64: true })
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `QR-SEMUA-SCOOTER-${new Date().toISOString().slice(0, 10)}.zip`
  a.click()

  setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 1000)
}

export async function downloadDatabaseBackup() {
  try {
    const backupInfo = await api('/api/backup', { method: 'POST' })
    if (!backupInfo.success) {
      throw new Error(backupInfo.error || 'Gagal membuat file backup.')
    }

    const res = await fetch(`${API}/api/backup/download`)
    if (!res.ok) {
      throw new Error(`Gagal mengunduh backup (HTTP ${res.status})`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.style.display = 'none'
    a.href = url
    a.download = backupInfo.filename || `trackscooter_backup_${new Date().toISOString().slice(0, 10)}.db`
    document.body.appendChild(a)
    a.click()

    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a)
      }
      window.URL.revokeObjectURL(url)
    }, 1000)
  } catch (err) {
    throw new Error('Gagal mengunduh backup database: ' + err.message, { cause: err })
  }
}

export async function exportData() {
  try {
    const data = await api('/api/export')
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `trackscooter-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert('Gagal mengekspor data: ' + err.message)
  }
}

// ── Daily Report (per-day rental/churn table) ─────────────
function dateKeyOf(d) {
  const dt = d instanceof Date ? d : new Date(d)
  if (isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function summarizeCondition(dc) {
  if (!dc) return '-'
  const bad = []
  if (dc.baterai === 'drop') bad.push('Baterai drop')
  if (dc.lampu === 'tidak') bad.push('Lampu tidak nyala')
  if (dc.monitor && dc.monitor === 'lain' && dc.monitor_detail) bad.push(dc.monitor_detail)
  else if (dc.monitor && dc.monitor !== 'normal') bad.push(`Error ${String(dc.monitor).toUpperCase()}`)
  if (dc.rem === 'rusak') bad.push('Rem rusak')
  if (dc.ban === 'botak') bad.push('Ban botak')
  if (dc.ban === 'tipis') bad.push('Ban tipis')
  if (dc.setelan === 'tidak') bad.push('Spakbor tidak ada')
  return bad.length ? bad.join(', ') : 'Baik'
}

function timeHM(ts) {
  try {
    return new Date(ts).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts || '-'
  }
}

/** Build one-row-per-rental-session rows for a given date (pure, testable). */
export function buildDailyReportRows(date, activityLog, scooters = [], now = new Date()) {
  const reportKey = dateKeyOf(date)
  if (!reportKey) return []

  const typeByUnit = new Map()
  const conditionByUnit = new Map()
  for (const s of scooters) {
    typeByUnit.set(s.id, s.type ?? null)
    conditionByUnit.set(s.id, s.deviceCondition ?? null)
  }

  const perUnit = {}
  if (Array.isArray(activityLog)) {
    for (const e of activityLog) {
      if (!e || !e.action) continue
      if (!perUnit[e.scooterId]) perUnit[e.scooterId] = []
      perUnit[e.scooterId].push(e)
    }
  }

  const sessions = []
  for (const [scooterId, logs] of Object.entries(perUnit)) {
    const sorted = logs
      .map(l => ({ ...l, dt: new Date(l.timestamp) }))
      .filter(l => !isNaN(l.dt.getTime()))
      .sort((a, b) => a.dt - b.dt)

    let open = null
    for (const l of sorted) {
      if (l.action === 'checkout') {
        if (open && dateKeyOf(open.checkoutTs) === reportKey) {
          // previous session never closed on report day
          open.keluar = null
          sessions.push(open)
        }
        open = { scooterId, checkoutTs: l.dt, masukTs: null }
      } else if (l.action === 'return' && open) {
        open.masukTs = l.dt
        if (dateKeyOf(open.checkoutTs) === reportKey) {
          sessions.push(open)
        }
        open = null
      }
    }
    if (open && dateKeyOf(open.checkoutTs) === reportKey) {
      open.masukTs = null
      sessions.push(open)
    }
  }

  sessions.sort((a, b) => a.checkoutTs - b.checkoutTs)

  return sessions.map((s, i) => {
    const totalMs = s.masukTs ? s.masukTs - s.checkoutTs : Math.max(0, now - s.checkoutTs)
    const rawHours = totalMs / 3600000
    return {
      no: i + 1,
      unit: s.scooterId,
      type: typeByUnit.get(s.scooterId) ?? null,
      kondisi: summarizeCondition(conditionByUnit.get(s.scooterId)),
      keluarTs: s.checkoutTs,
      masukTs: s.masukTs,
      masihKeluar: !s.masukTs,
      jumlahJam: Math.max(0, Math.round(rawHours * 100) / 100)
    }
  })
}

export async function exportDailyReportToExcel(date, activityLog, scooters = [], now = new Date()) {
  const rows = buildDailyReportRows(date, activityLog, scooters, now)
  const reportKey = dateKeyOf(date) || new Date().toISOString().slice(0, 10)
  const { utils, writeFile } = await import('xlsx')

  const sheetRows = rows.length
    ? rows.map(r => ({
        'Unit': r.unit,
        'Out (Keluar)': timeHM(r.keluarTs),
        'In (Masuk)': r.masukTs ? timeHM(r.masukTs) : 'Belum kembali',
        'Jumlah Jam': Number(r.jumlahJam.toFixed(2)),
        'Kondisi Unit': r.kondisi,
      }))
    : [{ 'Unit': 'Tidak ada aktivitas', 'Out (Keluar)': '-', 'In (Masuk)': '-', 'Jumlah Jam': 0, 'Kondisi Unit': '-' }]

  const wb = utils.book_new()
  const ws = utils.json_to_sheet(sheetRows)
  utils.book_append_sheet(wb, ws, 'Laporan Harian')
  writeFile(wb, `Laporan-Harian-${reportKey}.xlsx`)
}

// ── Excel Export (per unit history) ────────────────────────
function excelDate(ts) {
  try {
    return new Date(ts).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  } catch {
    return ts || '-'
  }
}

export async function exportScooterHistoryToExcel(scooter, logEntries, maintenanceRecords = []) {
  const { utils, writeFile } = await import('xlsx')

  const historyRows = logEntries.map(e => ({
    'Tanggal': excelDate(e.timestamp),
    'Aksi': e.action === 'checkout' ? 'Keluar (Sewa)' : 'Masuk (Kembali)',
    'Jenis': e.scooterType === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)',
  }))

  const maintenanceRows = maintenanceRecords.map(m => ({
    'Mulai': excelDate(m.startedAt),
    'Lokasi': m.location === 'outlet' ? 'Di Outlet' : 'Keluar / Luar',
    'Kendala': m.issue || '-',
    'Catatan': m.note || '-',
    'Status': m.status === 'done' ? 'Selesai' : 'Dalam Perbaikan',
    'Selesai': m.resolvedAt ? excelDate(m.resolvedAt) : '-'
  }))

  const wb = utils.book_new()
  const wsHistory = utils.json_to_sheet(
    historyRows.length ? historyRows : [{ 'Tanggal': '-', 'Aksi': 'Belum ada aktivitas', 'Jenis': '-' }]
  )
  utils.book_append_sheet(wb, wsHistory, 'Riwayat Unit')

  const wsMaint = utils.json_to_sheet(
    maintenanceRows.length ? maintenanceRows : [{ 'Mulai': '-', 'Lokasi': '-', 'Kendala': '-', 'Catatan': '-', 'Status': '-', 'Selesai': '-' }]
  )
  utils.book_append_sheet(wb, wsMaint, 'Riwayat Maintenance')

  const filename = `Riwayat-${scooter.id}-${new Date().toISOString().slice(0, 10)}.xlsx`
  writeFile(wb, filename)
}

// ── Excel Export (all units condition snapshot) ─────────────
const DEVICE_LABELS = {
  setelan: { ada: 'Ada', tidak: 'Tidak ada' },
  lampu: { nyala: 'Nyala', tidak: 'Tidak nyala' },
  baterai: { normal: 'Normal', drop: 'Drop' },
  monitor: {
    normal: 'Normal', e2: 'E2', e4: 'E4', e16: 'E16', e6: 'E6', lain: 'Lain-lain'
  },
  rem: { normal: 'Normal', rusak: 'Rusak' },
  ban: { aman: 'Aman', tipis: 'Tipis', botak: 'Botak' },
}

const TYPE_LABELS = { sd: 'Standar (SD)', sj: 'Jumbo (SJ)' }

const STATUS_LABELS = {
  available: 'Tersedia',
  'in-use': 'Online',
  rusak: 'Offline / Rusak',
  maintenance: 'Maintenance',
}

export async function exportScooterConditionsToExcel(scooters) {
  if (!scooters || scooters.length === 0) {
    throw new Error('Belum ada scooter untuk diekspor.')
  }
  const { utils, writeFile } = await import('xlsx')

  const sheetRows = scooters
    .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))
    .map(s => {
      const dc = s.deviceCondition || {}
      const monitorLabel = dc.monitor === 'lain'
        ? (dc.monitor_detail || 'Lain-lain')
        : (DEVICE_LABELS.monitor[dc.monitor] || dc.monitor || '-')
      const updatedAt = dc.updated_at ? excelDate(dc.updated_at) : '-'
      return {
        'ID Unit': s.id,
        'Jenis': TYPE_LABELS[s.type] || s.type,
        'Status': STATUS_LABELS[s.status] || s.status,
        'Kondisi Unit': summarizeCondition(dc) || '-',
        'Spakbor': DEVICE_LABELS.setelan[dc.setelan] || dc.setelan || 'Belum dicek',
        'Lampu': DEVICE_LABELS.lampu[dc.lampu] || dc.lampu || 'Belum dicek',
        'Baterai': DEVICE_LABELS.baterai[dc.baterai] || dc.baterai || 'Belum dicek',
        'Jenis Error': dc.monitor ? monitorLabel : 'Belum dicek',
        'Rem': DEVICE_LABELS.rem[dc.rem] || dc.rem || 'Belum dicek',
        'Ban': DEVICE_LABELS.ban[dc.ban] || dc.ban || 'Belum dicek',
        'Dicek': updatedAt,
      }
    })

  const wb = utils.book_new()
  const ws = utils.json_to_sheet(sheetRows)
  ws['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 18 }, { wch: 28 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
    { wch: 10 }, { wch: 10 }, { wch: 18 },
  ]
  utils.book_append_sheet(wb, ws, 'Kondisi Unit')

  const filename = `Kondisi-Scooter-${new Date().toISOString().slice(0, 10)}.xlsx`
  writeFile(wb, filename)
}
