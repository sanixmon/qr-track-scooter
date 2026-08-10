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
    lastUpdated: s.last_updated
  }
}

function mapScooterToApi(fields) {
  const out = {}
  if ('status' in fields) out.status = fields.status
  if ('maintenanceNote' in fields) out.maintenanceNote = fields.maintenanceNote ?? null
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
