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

export async function downloadDatabaseBackup() {
  try {
    const response = await fetch('/api/backup/download')
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trackscooter_backup_${new Date().toISOString().slice(0, 10)}.db`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    throw new Error('Gagal mengunduh backup database: ' + err.message)
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
