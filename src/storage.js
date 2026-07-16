// ── LocalStorage keys ─────────────────────────────────────
const BIKES_KEY   = 'trackbike:bikes'
const LOG_KEY     = 'trackbike:activity_log'

// ── Helpers ───────────────────────────────────────────────
function loadBikes() {
  try { return JSON.parse(localStorage.getItem(BIKES_KEY) || '[]') } catch { return [] }
}

function saveBikes(bikes) {
  localStorage.setItem(BIKES_KEY, JSON.stringify(bikes))
  // Dispatch custom event so other tabs / components can react
  window.dispatchEvent(new CustomEvent('trackbike:bikes-changed'))
}

function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}

function saveLog(log) {
  localStorage.setItem(LOG_KEY, JSON.stringify(log))
  window.dispatchEvent(new CustomEvent('trackbike:log-changed'))
}

// ── Bikes ──────────────────────────────────────────────────
export async function getScooters() {
  return loadBikes().sort((a, b) => a.id.localeCompare(b.id))
}

export async function addScooter({ id, type }) {
  const bikes = loadBikes()
  const prefix = `${type.toUpperCase()}-`
  let finalId = id ? id.trim().toUpperCase() : ''

  if (finalId) {
    if (!finalId.startsWith(prefix)) {
      const numericPart = finalId.replace(/\D/g, '')
      if (numericPart) {
        finalId = `${prefix}${numericPart.padStart(3, '0')}`
      } else {
        finalId = `${prefix}${finalId}`
      }
    }
    if (bikes.find(b => b.id === finalId)) {
      throw new Error(`ID "${finalId}" sudah terdaftar di sistem.`)
    }
  } else {
    const sameType = bikes.filter(b => b.type === type)
    const nums = sameType
      .map(b => { const n = b.id.replace(prefix, ''); return parseInt(n, 10) })
      .filter(n => !isNaN(n))
    const next = nums.length ? Math.max(...nums) + 1 : 1
    finalId = `${prefix}${String(next).padStart(3, '0')}`
  }

  const newBike = {
    id: finalId,
    type,
    status: 'available',
    maintenanceNote: null,
    lastUpdated: new Date().toISOString()
  }

  bikes.push(newBike)
  saveBikes(bikes)
  return newBike
}

export async function deleteScooter(id) {
  const bikes = loadBikes().filter(b => b.id !== id)
  saveBikes(bikes)
}

export async function updateScooter(id, fields) {
  const bikes = loadBikes()
  const idx = bikes.findIndex(b => b.id === id)
  if (idx === -1) throw new Error(`Sepeda "${id}" tidak ditemukan.`)

  if ('status' in fields)          bikes[idx].status          = fields.status
  if ('maintenanceNote' in fields) bikes[idx].maintenanceNote = fields.maintenanceNote ?? null
  bikes[idx].lastUpdated = new Date().toISOString()

  saveBikes(bikes)
}

// ── Activity log ───────────────────────────────────────────
export async function getActivityLog() {
  return loadLog().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500)
}

// ── Toggle status ──────────────────────────────────────────
export async function toggleScooterStatus(bikeId, forceMaintenance = false) {
  const bikes = loadBikes()
  const bike  = bikes.find(b => b.id === bikeId)

  if (!bike) return { success: false, message: `Sepeda "${bikeId}" tidak ditemukan.` }

  if (bike.status === 'maintenance' && !forceMaintenance) {
    const noteText = bike.maintenanceNote ? `\nCatatan Perbaikan: "${bike.maintenanceNote}"` : ''
    return {
      success: false,
      requiresConfirmation: true,
      message: `Apakah Anda yakin akan menyewakan unit ${bike.id} yang sedang dalam maintenance?${noteText}`
    }
  }

  const wasAvailable = bike.status === 'available' || bike.status === 'maintenance'
  const nextStatus   = wasAvailable ? 'in-use' : 'available'

  bike.status      = nextStatus
  bike.lastUpdated = new Date().toISOString()
  if (nextStatus === 'in-use') bike.maintenanceNote = null

  saveBikes(bikes)

  // Append to activity log
  const log = loadLog()
  log.push({
    id:          `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    scooterId:   bikeId,
    scooterType: bike.type,
    action:      wasAvailable ? 'checkout' : 'return',
    timestamp:   new Date().toISOString()
  })
  saveLog(log)

  const typeLabel = bike.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'

  return {
    success: true,
    scooter: { ...bike },
    action:  wasAvailable ? 'checkout' : 'return',
    message: wasAvailable
      ? `Sepeda ${bike.id} (${typeLabel}) sekarang sedang digunakan.`
      : `Sepeda ${bike.id} (${typeLabel}) telah dikembalikan.`
  }
}

// ── QR download ────────────────────────────────────────────
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

// ── JSON export ────────────────────────────────────────────
export async function exportData() {
  try {
    const bikes       = await getScooters()
    const activityLog = await getActivityLog()
    const data        = { bikes, activityLog, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `tracksepeda-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    alert('Gagal mengekspor data: ' + err.message)
  }
}
