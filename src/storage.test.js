import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getScooters,
  addScooter,
  updateScooter,
  getActivityLog,
  toggleScooterStatus
} from './storage'

// ── In-memory store mimicking the SQLite backend ────────────
const store = { scooters: [], activityLog: [] }

let seq = 0

function apiHandler(method, path, body) {
  switch (true) {
    case method === 'GET' && path === '/api/scooters':
      return { ok: true, body: [...store.scooters].sort((a, b) => a.id.localeCompare(b.id)) }

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
      store.scooters[idx].last_updated = new Date().toISOString()
      return { ok: true, body: store.scooters[idx] }
    }

    case method === 'GET' && path === '/api/activity-log':
      return { ok: true, body: [...store.activityLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500) }

    case method === 'POST' && path.startsWith('/api/scooters/') && path.endsWith('/toggle'): {
      const id = path.replace('/api/scooters/', '').replace('/toggle', '')
      const forceMaintenance = body?.forceMaintenance === true
      const bike = store.scooters.find(s => s.id === id)
      if (!bike) return { ok: true, body: { success: false, message: `Scooter "${id}" tidak ditemukan.` } }

      if (bike.status === 'maintenance' && !forceMaintenance) {
        const noteText = bike.maintenance_note ? `\nCatatan Perbaikan: "${bike.maintenance_note}"` : ''
        return { ok: true, body: { success: false, requiresConfirmation: true, message: `Apakah Anda yakin akan menyewakan unit ${bike.id} yang sedang dalam maintenance?${noteText}` } }
      }

      const wasAvailable = bike.status === 'available' || bike.status === 'maintenance'
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
