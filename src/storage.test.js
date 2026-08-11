import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getScooters,
  addScooter,
  updateScooter,
  getActivityLog,
  toggleScooterStatus,
  buildDailyReportRows
} from './storage'

// ── In-memory store mimicking the SQLite backend ────────────
const store = { scooters: [], activityLog: [], deviceConditions: {}, maintenanceRecords: [] }

let seq = 0

function apiHandler(method, path, body) {
  switch (true) {
    case method === 'GET' && path === '/api/scooters':
      return {
        ok: true,
        body: [...store.scooters]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(s => ({
            ...s,
            device_condition: store.deviceConditions[s.id] || null,
            active_maintenance: store.maintenanceRecords.find(r => r.scooter_id === s.id && r.status === 'repair') || null
          }))
      }

    case method === 'POST' && path === '/api/scooters': {
      const { id, type } = body
      const prefix = `${type.toUpperCase()}-`
      let finalId = id ? id.trim().toUpperCase() : ''

      if (finalId) {
        if (!finalId.startsWith(prefix)) {
          const numericPart = finalId.replace(/\D/g, '')
          finalId = numericPart ? `${prefix}${parseInt(numericPart, 10)}` : `${prefix}${finalId}`
        } else {
          const parts = finalId.split('-')
          if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
            finalId = `${parts[0]}-${parseInt(parts[1], 10)}`
          }
        }
        if (store.scooters.find(s => s.id === finalId)) {
          return { ok: false, status: 409, body: { error: `ID "${finalId}" sudah terdaftar di sistem.` } }
        }
      } else {
        const sameType = store.scooters.filter(s => s.type === type)
        const nums = sameType.map(s => { const n = s.id.replace(prefix, ''); return parseInt(n, 10) }).filter(n => !isNaN(n))
        const next = nums.length ? Math.max(...nums) + 1 : 1
        finalId = `${prefix}${next}`
      }

      const scooter = {
        id: finalId, type, status: 'available',
        maintenance_note: null,
        last_updated: new Date().toISOString()
      }
      store.scooters.push(scooter)
      return { ok: true, status: 201, body: scooter }
    }

    case method === 'DELETE' && path.startsWith('/api/scooters/'): {
      const id = path.replace('/api/scooters/', '')
      store.scooters = store.scooters.filter(s => s.id !== id)
      return { ok: true, body: { success: true } }
    }

    case method === 'PATCH' && path.startsWith('/api/scooters/'): {
      const id = path.replace('/api/scooters/', '')
      const idx = store.scooters.findIndex(s => s.id === id)
      if (idx === -1) return { ok: false, status: 404, body: { error: `Scooter "${id}" tidak ditemukan.` } }
      if ('status' in body) store.scooters[idx].status = body.status
      if ('maintenanceNote' in body) store.scooters[idx].maintenance_note = body.maintenanceNote ?? null
      if (body.status === 'maintenance' && body.location) {
        store.maintenanceRecords.push({
          id: `mnt-${Date.now()}-${seq++}`,
          scooter_id: id,
          location: body.location,
          issue: body.issue || body.maintenanceNote || 'Perbaikan rutin',
          note: body.note || null,
          status: 'repair',
          started_at: new Date().toISOString()
        })
      } else if (store.scooters[idx].status !== 'maintenance') {
        store.maintenanceRecords
          .filter(r => r.scooter_id === id && r.status === 'repair')
          .forEach(r => { r.status = 'done'; r.resolved_at = new Date().toISOString() })
      }
      store.scooters[idx].last_updated = new Date().toISOString()
      return { ok: true, body: store.scooters[idx] }
    }

    case method === 'PUT' && path.endsWith('/device-condition'): {
      const id = path.replace('/api/scooters/', '').replace('/device-condition', '')
      const scooter = store.scooters.find(s => s.id === id)
      if (!scooter) {
        return { ok: false, status: 404, body: { error: `Scooter "${id}" tidak ditemukan.` } }
      }
      const dc = { ...body, updated_at: new Date().toISOString() }
      if ('monitorDetail' in dc) {
        dc.monitor_detail = dc.monitorDetail
        delete dc.monitorDetail
      }
      store.deviceConditions[id] = dc
      // Auto status: Jenis Error → rusak, normal → tersedia (mirror server)
      const isError = dc.monitor !== null && dc.monitor !== undefined && dc.monitor !== 'normal'
      if (isError) {
        if (scooter.status === 'available') {
          scooter.status = 'rusak'
          scooter.maintenance_note = dc.monitor === 'lain'
            ? (dc.monitor_detail || 'Lain-lain')
            : `Error ${dc.monitor.toUpperCase()}`
        }
      } else if (scooter.status === 'rusak') {
        scooter.status = 'available'
        scooter.maintenance_note = null
      }
      return { ok: true, body: { success: true, scooter, device_condition: dc } }
    }

    case method === 'GET' && path === '/api/maintenance-records':
      return { ok: true, body: [...store.maintenanceRecords].sort((a, b) => new Date(b.started_at) - new Date(a.started_at)) }

    case method === 'POST' && path.startsWith('/api/maintenance-records/') && path.endsWith('/complete'): {
      const id = path.replace('/api/maintenance-records/', '').replace('/complete', '')
      const rec = store.maintenanceRecords.find(r => r.id === id)
      if (!rec) return { ok: false, status: 404, body: { error: 'Catatan maintenance tidak ditemukan.' } }
      rec.status = 'done'
      rec.resolved_at = new Date().toISOString()
      const scooter = store.scooters.find(s => s.id === rec.scooter_id)
      if (scooter && scooter.status === 'maintenance') {
        scooter.status = 'available'
        scooter.maintenance_note = null
      }
      return { ok: true, body: { success: true, record: rec } }
    }

    case method === 'GET' && path === '/api/activity-log':
      return { ok: true, body: [...store.activityLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500) }

    case method === 'POST' && path.startsWith('/api/scooters/') && path.endsWith('/toggle'): {
      const id = path.replace('/api/scooters/', '').replace('/toggle', '')
      const forceMaintenance = body?.forceMaintenance === true
      const bike = store.scooters.find(s => s.id === id)
      if (!bike) return { ok: true, body: { success: false, message: `Scooter "${id}" tidak ditemukan.` } }

      if ((bike.status === 'maintenance' || bike.status === 'rusak') && !forceMaintenance) {
        const isRusak = bike.status === 'rusak'
        const noteText = bike.maintenance_note ? `\n${isRusak ? 'Catatan Kerusakan' : 'Catatan Perbaikan'}: "${bike.maintenance_note}"` : ''
        return { ok: true, body: { success: false, requiresConfirmation: true, message: `Apakah Anda yakin akan menyewakan unit ${bike.id} yang sedang dalam status ${isRusak ? 'rusak' : 'maintenance'}?${noteText}` } }
      }

      const wasAvailable = ['available', 'maintenance', 'rusak'].includes(bike.status)
      bike.status = wasAvailable ? 'in-use' : 'available'
      bike.last_updated = new Date().toISOString()
      if (bike.status === 'in-use') bike.maintenance_note = null

      const ts = Date.now() + seq
      const logEntry = {
        id: `log-${Date.now()}-${seq++}`,
        scooter_id: id,
        scooter_type: bike.type,
        action: wasAvailable ? 'checkout' : 'return',
        timestamp: new Date(ts).toISOString()
      }
      store.activityLog.push(logEntry)

      const typeLabel = bike.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'
      return {
        ok: true,
        body: {
          success: true,
          scooter: bike,
          action: wasAvailable ? 'checkout' : 'return',
          message: wasAvailable
            ? `Scooter ${id} (${typeLabel}) sekarang sedang digunakan.`
            : `Scooter ${id} (${typeLabel}) telah dikembalikan.`
        }
      }
    }

    default:
      return { ok: false, status: 404, body: { error: 'Not found' } }
  }
}

// ── Mock fetch ──────────────────────────────────────────────
function mockFetch(url, options = {}) {
  const path = url.replace(/^http:\/\/[^/]+/, '')
  const method = options.method || 'GET'
  const body = options.body ? JSON.parse(options.body) : undefined
  const result = apiHandler(method, path, body)

  return Promise.resolve({
    ok: result.ok,
    status: result.status ?? (result.ok ? 200 : 500),
    json: () => Promise.resolve(result.body)
  })
}

beforeEach(() => {
  store.scooters = []
  store.activityLog = []
  vi.stubGlobal('fetch', vi.fn(mockFetch))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Storage API Client', () => {
  it('1. Adds a scooter correctly', async () => {
    const s = await addScooter({ id: 'SD-100', type: 'sd' })
    expect(s.id).toBe('SD-100')
    expect(s.status).toBe('available')

    const bikes = await getScooters()
    expect(bikes.length).toBe(1)
    expect(bikes[0].id).toBe('SD-100')
  })

  it('2. Prevents duplicate IDs (Worst Case)', async () => {
    await addScooter({ id: 'SD-100', type: 'sd' })
    await expect(addScooter({ id: 'sd-100', type: 'sd' }))
      .rejects.toThrow('ID "SD-100" sudah terdaftar di sistem.')
  })

  it('3. Auto-generates correct ID sequence', async () => {
    await addScooter({ id: 'SD-5', type: 'sd' })
    await addScooter({ id: 'SD-99', type: 'sd' })

    const s = await addScooter({ type: 'sd' })
    expect(s.id).toBe('SD-100')
  })

  it('4. Returns empty arrays when no data exists', async () => {
    const bikes = await getScooters()
    const logs = await getActivityLog()

    expect(bikes).toEqual([])
    expect(logs).toEqual([])
  })

  it('5. Rejects toggle for non-existent scooter (Worst Case)', async () => {
    const result = await toggleScooterStatus('GHOST-1')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/tidak ditemukan/i)
  })

  it('6. Blocks checkout if scooter is in maintenance (Worst Case / Safety)', async () => {
    await addScooter({ id: 'SD-1', type: 'sd' })
    await updateScooter('SD-1', { status: 'maintenance', maintenanceNote: 'Ban Bocor' })

    const result = await toggleScooterStatus('SD-1')
    expect(result.success).toBe(false)
    expect(result.requiresConfirmation).toBe(true)
    expect(result.message).toContain('Ban Bocor')
  })

  it('7. Allows override checkout if forceMaintenance is true', async () => {
    await addScooter({ id: 'SD-1', type: 'sd' })
    await updateScooter('SD-1', { status: 'maintenance' })

    const result = await toggleScooterStatus('SD-1', true)
    expect(result.success).toBe(true)
    expect(result.action).toBe('checkout')

    const bikes = await getScooters()
    expect(bikes[0].status).toBe('in-use')
  })

  it('8. Logs activity correctly upon status toggle', async () => {
    await addScooter({ id: 'SJ-1', type: 'sj' })

    await toggleScooterStatus('SJ-1')
    let log = await getActivityLog()
    expect(log.length).toBe(1)
    expect(log[0].action).toBe('checkout')
    expect(log[0].scooterId).toBe('SJ-1')

    await toggleScooterStatus('SJ-1')
    log = await getActivityLog()
    expect(log.length).toBe(2)
    expect(log[0].action).toBe('return')
  })

  it('9. Handles API returning 500 (Worst Case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Internal server error' })
    })))

    await expect(getScooters()).rejects.toThrow()
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn(mockFetch))
  })

  it('10. Handles network failure (Worst Case)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network failure'))))

    await expect(getScooters()).rejects.toThrow('Network failure')
    vi.unstubAllGlobals()
    vi.stubGlobal('fetch', vi.fn(mockFetch))
  })

  it('11. Export returns data via API', async () => {
    vi.stubGlobal('alert', vi.fn())
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
    const { exportData } = await import('./storage')
    await expect(exportData()).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('12. Update with empty field set does not fail', async () => {
    await addScooter({ id: 'SD-99', type: 'sd' })
    await expect(updateScooter('SD-99', {})).resolves.toBeDefined()
  })

  it('13. Toggle clears maintenance note on checkout', async () => {
    await addScooter({ id: 'SD-100', type: 'sd' })
    await updateScooter('SD-100', { status: 'maintenance', maintenanceNote: 'Test Note' })
    await toggleScooterStatus('SD-100', true) // force checkout
    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-100'))
    expect(scooter.maintenanceNote).toBeNull()
  })

  it('14. Blocks checkout for rusak (offline) unit (Worst Case)', async () => {
    await addScooter({ id: 'SD-200', type: 'sd' })
    await updateScooter('SD-200', { status: 'rusak', maintenanceNote: 'Tidak menyala' })
    const result = await toggleScooterStatus('SD-200')
    expect(result.success).toBe(false)
    expect(result.requiresConfirmation).toBe(true)
    expect(result.message).toMatch(/rusak/)
    expect(result.message).toContain('Tidak menyala')
  })

  it('15. Allows rusak unit checkout with force flag', async () => {
    await addScooter({ id: 'SD-201', type: 'sd' })
    await updateScooter('SD-201', { status: 'rusak' })
    const result = await toggleScooterStatus('SD-201', true)
    expect(result.success).toBe(true)
    expect(result.action).toBe('checkout')
  })
})

describe('Device condition', () => {
  it('saves device condition via PUT endpoint', async () => {
    const { saveDeviceCondition, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-300', type: 'sd' })

    const dc = await saveDeviceCondition('SD-300', {
      setelan: 'ada', lampu: 'tidak', baterai: 'drop', monitor: 'e4', rem: 'normal', ban: 'botak'
    })
    expect(dc.baterai).toBe('drop')
    expect(dc.monitor).toBe('e4')
    expect(dc.ban).toBe('botak')

    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-300'))
    expect(scooter.deviceCondition).toEqual(expect.objectContaining({ baterai: 'drop', monitor: 'e4', ban: 'botak' }))
  })

  it('auto-marks scooter as rusak when Jenis Error is set', async () => {
    const { saveDeviceCondition, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-301', type: 'sd' })

    await saveDeviceCondition('SD-301', {
      setelan: 'ada', lampu: 'nyala', baterai: 'normal', monitor: 'e2', rem: 'normal', ban: 'aman'
    })
    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-301'))
    expect(scooter.status).toBe('rusak')
    expect(scooter.maintenanceNote).toBe('Error E2')
  })

  it('supports "Lain Lain" option with manual detail text', async () => {
    const { saveDeviceCondition, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-303', type: 'sd' })

    await saveDeviceCondition('SD-303', {
      setelan: 'ada', lampu: 'tidak', baterai: 'normal', monitor: 'lain',
      monitorDetail: 'Spakbor retak', rem: 'normal', ban: 'aman'
    })
    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-303'))
    expect(scooter.deviceCondition.monitor).toBe('lain')
    expect(scooter.monitorDetail).toBe('Spakbor retak')
    expect(scooter.status).toBe('rusak')
    expect(scooter.maintenanceNote).toBe('Spakbor retak')
  })

  it('auto-restores rusak scooter when Jenis Error is cleared', async () => {
    const { saveDeviceCondition, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-302', type: 'sd' })
    await saveDeviceCondition('SD-302', {
      setelan: 'ada', lampu: 'nyala', baterai: 'normal', monitor: 'e6', rem: 'normal', ban: 'aman'
    })
    await saveDeviceCondition('SD-302', {
      setelan: 'ada', lampu: 'nyala', baterai: 'normal', monitor: 'normal', rem: 'normal', ban: 'aman'
    })
    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-302'))
    expect(scooter.status).toBe('available')
    expect(scooter.maintenanceNote).toBeNull()
  })
})

describe('Maintenance records', () => {
  it('lists maintenance records and creates one when unit goes to maintenance', async () => {
    const { getMaintenanceRecords, updateScooter } = await import('./storage')
    await addScooter({ id: 'SD-400', type: 'sd' })

    await updateScooter('SD-400', { status: 'maintenance', location: 'luar', issue: 'Baterai drop', note: 'ganti BMS' })
    const records = await getMaintenanceRecords()

    const rec = records.find(r => r.scooterId === 'SD-400')
    expect(rec).toBeDefined()
    expect(rec.location).toBe('luar')
    expect(rec.issue).toBe('Baterai drop')
    expect(rec.note).toBe('ganti BMS')
    expect(rec.status).toBe('repair')
  })

  it('completes maintenance and restores scooter to available', async () => {
    const { getMaintenanceRecords, completeMaintenanceRecord, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-402', type: 'sd' })
    await updateScooter('SD-402', { status: 'maintenance', location: 'luar', issue: 'Ban kempes' })

    const records = await getMaintenanceRecords()
    const rec = records.find(r => r.scooterId === 'SD-402')
    expect(rec).toBeDefined()

    const res = await completeMaintenanceRecord(rec.id)
    expect(res.success).toBe(true)

    const after = await getMaintenanceRecords()
    expect(after.find(r => r.id === rec.id).status).toBe('done')

    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-402'))
    expect(scooter.status).toBe('available')
  })

  it('surfaces active maintenance on scooter objects', async () => {
    const { updateScooter, getScooters } = await import('./storage')
    await addScooter({ id: 'SD-401', type: 'sd' })
    await updateScooter('SD-401', { status: 'maintenance', location: 'outlet', issue: 'Rem blong' })

    const [scooter] = await getScooters().then(bikes => bikes.filter(b => b.id === 'SD-401'))
    expect(scooter.activeMaintenance).toEqual(expect.objectContaining({ location: 'outlet', issue: 'Rem blong' }))
  })
})

describe('exportScooterHistoryToExcel', () => {
  it('builds an xlsx workbook and triggers download', async () => {
    const writeFileMock = vi.fn()
    vi.doMock('xlsx', () => ({
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: () => ({}),
        book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws },
      },
      writeFile: writeFileMock
    }))

    const { exportScooterHistoryToExcel } = await import('./storage')
    await exportScooterHistoryToExcel(
      { id: 'SD-1', type: 'sd' },
      [{ id: 'l1', scooterId: 'SD-1', action: 'checkout', timestamp: new Date().toISOString() }],
      [{ id: 'm1', scooterId: 'SD-1', location: 'outlet', issue: 'Rem', status: 'done', startedAt: new Date().toISOString() }]
    )

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    expect(writeFileMock.mock.calls[0][0].SheetNames).toEqual(['Riwayat Unit', 'Riwayat Maintenance'])
    vi.doUnmock('xlsx')
    vi.resetModules()
  })
})

describe('downloadAllScooterQRs', () => {
  it('rejects when scooters list is empty (Worst Case)', async () => {
    const { downloadAllScooterQRs } = await import('./storage')
    await expect(downloadAllScooterQRs([])).rejects.toThrow('Belum ada scooter')
    await expect(downloadAllScooterQRs(null)).rejects.toThrow('Belum ada scooter')
  })

  it('generates a ZIP with one PNG per scooter', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    vi.stubGlobal('window', { URL: { createObjectURL, revokeObjectURL: vi.fn() } })
    vi.stubGlobal('document', { createElement: vi.fn(() => ({ href: '', download: '', click: vi.fn() })) })
    vi.stubGlobal('setTimeout', vi.fn(cb => cb()))

    const { downloadAllScooterQRs } = await import('./storage')
    await downloadAllScooterQRs([{ id: 'SD-1', type: 'sd' }, { id: 'BT-2', type: 'bt' }])

    const zipBlob = createObjectURL.mock.calls[0][0]
    expect(zipBlob.type).toBe('application/zip')

    const JSZip = (await import('jszip')).default
    const savedZip = await JSZip.loadAsync(zipBlob)
    const files = Object.keys(savedZip.files)
    expect(files).toEqual(['QR-SD-1-SD.png', 'QR-BT-2-BT.png'])

    const png = await savedZip.file('QR-SD-1-SD.png').async('uint8array')
    expect(png[0]).toBe(0x89)
    expect(png[1]).toBe(0x50)
    expect(png[2]).toBe(0x4e)
    expect(png[3]).toBe(0x47)
    vi.unstubAllGlobals()
  })
})

describe('buildDailyReportRows', () => {
  const scooters = [
    { id: 'SD-1', type: 'sd', deviceCondition: { baterai: 'drop', monitor: 'e4', lampu: 'nyala', rem: 'normal', ban: 'aman', setelan: 'ada' } },
    { id: 'SD-2', type: 'sd', deviceCondition: null }
  ]

  it('pairs checkout→return as one row (session)', () => {
    const rows = buildDailyReportRows('2025-01-10', [
      { scooterId: 'SD-1', action: 'checkout', timestamp: '2025-01-10T08:00:00.000Z' },
      { scooterId: 'SD-1', action: 'return',   timestamp: '2025-01-10T12:00:00.000Z' }
    ], scooters)

    expect(rows).toHaveLength(1)
    expect(rows[0].unit).toBe('SD-1')
    expect(rows[0].no).toBe(1)
    expect(rows[0].masukTs).not.toBeNull()
    expect(rows[0].jumlahJam).toBeCloseTo(4, 1)
    expect(rows[0].kondisi).toContain('Baterai drop')
    expect(rows[0].kondisi).toContain('Error E4')
  })

  it('one row per session even with multiple rentals same day (Worst Case)', () => {
    const rows = buildDailyReportRows('2025-01-10', [
      { scooterId: 'SD-1', action: 'checkout', timestamp: '2025-01-10T07:00:00.000Z' },
      { scooterId: 'SD-1', action: 'return',   timestamp: '2025-01-10T09:00:00.000Z' },
      { scooterId: 'SD-1', action: 'checkout', timestamp: '2025-01-10T13:00:00.000Z' },
      { scooterId: 'SD-1', action: 'return',   timestamp: '2025-01-10T15:00:00.000Z' }
    ], scooters)

    expect(rows).toHaveLength(2)
    expect(rows[0].no).toBe(1)
    expect(rows[1].no).toBe(2)
    expect(rows[0].jumlahJam).toBeCloseTo(2, 1)
    expect(rows[1].jumlahJam).toBeCloseTo(2, 1)
  })

  it('still-out unit appears with masukTs null and computes hours up to now', () => {
    const now = new Date('2025-01-10T14:00:00.000Z')
    const rows = buildDailyReportRows('2025-01-10', [
      { scooterId: 'SD-2', action: 'checkout', timestamp: '2025-01-10T10:00:00.000Z' }
    ], scooters, now)

    expect(rows).toHaveLength(1)
    expect(rows[0].masihKeluar).toBe(true)
    expect(rows[0].masukTs).toBeNull()
    expect(rows[0].jumlahJam).toBeCloseTo(4, 1)
    expect(rows[0].kondisi).toBe('-')
  })

  it('ignores sessions whose checkout is on a different date', () => {
    const rows = buildDailyReportRows('2025-01-10', [
      { scooterId: 'SD-1', action: 'checkout', timestamp: '2025-01-09T22:00:00.000Z' },
      { scooterId: 'SD-1', action: 'return',   timestamp: '2025-01-10T08:00:00.000Z' }
    ], scooters)

    expect(rows).toHaveLength(0)
  })

  it('handles malformed/empty input (Worst Case)', () => {
    expect(buildDailyReportRows('2025-01-10', [], [], new Date())).toEqual([])
    expect(buildDailyReportRows(null, [{ scooterId: 'X' }])).toEqual([])
    expect(buildDailyReportRows('2025-01-10', [{ scooterId: 'SD-1', action: 'checkout', timestamp: 'not-a-date' }], scooters)).toEqual([])
    expect(buildDailyReportRows('2025-01-10', null)).toEqual([])
  })
})

describe('exportDailyReportToExcel', () => {
  it('builds a workbook with Laporan Harian sheet and triggers download', async () => {
    const writeFileMock = vi.fn()
    vi.doMock('xlsx', () => ({
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: obj => ({ rows: obj }),
        book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws },
      },
      writeFile: writeFileMock
    }))

    const { exportDailyReportToExcel } = await import('./storage')
    await exportDailyReportToExcel(
      '2025-01-10',
      [{ scooterId: 'SD-1', action: 'checkout', timestamp: '2025-01-10T08:00:00.000Z' }],
      [{ id: 'SD-1', type: 'sd', deviceCondition: null }],
      new Date('2025-01-10T11:00:00.000Z')
    )

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const [wb, filename] = writeFileMock.mock.calls[0]
    expect(wb.SheetNames).toEqual(['Laporan Harian'])
    expect(filename).toBe('Laporan-Harian-2025-01-10.xlsx')
    const row = wb.Sheets['Laporan Harian'].rows[0]
    expect(row['No']).toBeUndefined()
    expect(row['Unit']).toBe('SD-1')
    expect(row['Jumlah Jam']).toBeCloseTo(3, 1)
    vi.doUnmock('xlsx')
    vi.resetModules()
  })

  it('falls back to placeholder row when no data (Worst Case)', async () => {
    const writeFileMock = vi.fn()
    vi.doMock('xlsx', () => ({
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: obj => ({ rows: obj }),
        book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws },
      },
      writeFile: writeFileMock
    }))

    const { exportDailyReportToExcel } = await import('./storage')
    await exportDailyReportToExcel('2025-01-10', [], [])

    const { rows } = writeFileMock.mock.calls[0][0].Sheets['Laporan Harian']
    expect(rows).toHaveLength(1)
    expect(rows[0]['Unit']).toBe('Tidak ada aktivitas')
    vi.doUnmock('xlsx')
    vi.resetModules()
  })
})

describe('exportScooterConditionsToExcel', () => {
  it('builds a workbook with all unit conditions and triggers download', async () => {
    const writeFileMock = vi.fn()
    vi.doMock('xlsx', () => ({
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: obj => ({ rows: obj }),
        book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws },
      },
      writeFile: writeFileMock
    }))

    const { exportScooterConditionsToExcel } = await import('./storage')
    await exportScooterConditionsToExcel([
      { id: 'SD-2', type: 'sd', status: 'rusak', deviceCondition: { setelan: 'ada', lampu: 'tidak', baterai: 'drop', monitor: 'lain', monitor_detail: 'Spakbor retak', rem: 'normal', ban: 'botak', updated_at: '2025-01-10T09:00:00.000Z' } },
      { id: 'SD-1', type: 'sd', status: 'available', deviceCondition: { setelan: 'ada', lampu: 'nyala', baterai: 'normal', monitor: 'normal', rem: 'normal', ban: 'aman', updated_at: '2025-01-10T08:00:00.000Z' } },
    ])

    expect(writeFileMock).toHaveBeenCalledTimes(1)
    const [wb, filename] = writeFileMock.mock.calls[0]
    expect(wb.SheetNames).toEqual(['Kondisi Unit'])
    expect(filename).toMatch(/^Kondisi-Scooter-\d{4}-\d{2}-\d{2}\.xlsx$/)
    const rows = wb.Sheets['Kondisi Unit'].rows
    expect(rows).toHaveLength(2)
    expect(rows[0]['ID Unit']).toBe('SD-1') // numeric sort first
    expect(rows[1]['ID Unit']).toBe('SD-2')
    expect(rows[1]['Status']).toBe('Offline / Rusak')
    expect(rows[1]['Lampu']).toBe('Tidak nyala')
    expect(rows[1]['Jenis Error']).toBe('Spakbor retak')
    expect(rows[1]['Kondisi Unit']).toContain('Baterai drop')
    vi.doUnmock('xlsx')
    vi.resetModules()
  })

  it('throws when there are no scooters (Worst Case)', async () => {
    vi.doMock('xlsx', () => ({
      utils: {
        book_new: () => ({ SheetNames: [], Sheets: {} }),
        json_to_sheet: obj => ({ rows: obj }),
        book_append_sheet: (wb, ws, name) => { wb.SheetNames.push(name); wb.Sheets[name] = ws },
      },
      writeFile: vi.fn()
    }))
    const { exportScooterConditionsToExcel } = await import('./storage')
    await expect(exportScooterConditionsToExcel([])).rejects.toThrow(/Belum ada scooter/)
    vi.doUnmock('xlsx')
    vi.resetModules()
  })
})
