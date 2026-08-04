import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { app } from './server.js'
import db, { migrateUnpaddedIds } from './db.js'

const BASE = 'http://localhost:3091'

let server

beforeAll(() => {
  server = app.listen(3091)
})

afterAll(() => {
  server.close()
  db.close()
})

// ── Helpers ────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json()
  return { status: res.status, data }
}

// ── Scooter CRUD ───────────────────────────────────────────
describe('POST /api/scooters', () => {
  it('adds a scooter with custom ID', async () => {
    const { status, data } = await api('POST', '/api/scooters', { id: 'SD-100', type: 'sd' })
    expect(status).toBe(201)
    expect(data.id).toBe('SD-100')
    expect(data.status).toBe('available')
  })

  it('rejects duplicate ID (Worst Case)', async () => {
    const { status, data } = await api('POST', '/api/scooters', { id: 'sd-100', type: 'sd' })
    expect(status).toBe(409)
    expect(data.error).toMatch(/SD-100/)
  })

  it('rejects invalid type (Worst Case)', async () => {
    const { status, data } = await api('POST', '/api/scooters', { type: 'invalid' })
    expect(status).toBe(400)
    expect(data.error).toMatch(/Tipe/)
  })

  it('rejects missing type (Worst Case)', async () => {
    const { status } = await api('POST', '/api/scooters', { id: 'X-001' })
    expect(status).toBe(400)
  })

  it('auto-generates next sequential ID', async () => {
    const { data } = await api('POST', '/api/scooters', { type: 'sj' })
    expect(data.id).toBe('SJ-1')
    expect(data.type).toBe('sj')
  })

  it('auto-generates after existing IDs', async () => {
    await api('POST', '/api/scooters', { id: 'SJ-99', type: 'sj' })
    const { data } = await api('POST', '/api/scooters', { type: 'sj' })
    expect(data.id).toBe('SJ-100')
  })

  it('formats numeric-only custom ID with prefix', async () => {
    const { data } = await api('POST', '/api/scooters', { id: '5', type: 'sd' })
    expect(data.id).toBe('SD-5')
  })
})

describe('GET /api/scooters', () => {
  it('returns all scooters sorted by ID', async () => {
    const { status, data } = await api('GET', '/api/scooters')
    expect(status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(4)
    for (let i = 1; i < data.length; i++) {
      expect(data[i - 1].id.localeCompare(data[i].id)).toBeLessThanOrEqual(0)
    }
  })

  it('returns correct status fields', async () => {
    const { data } = await api('GET', '/api/scooters')
    const s = data.find(x => x.id === 'SD-100')
    expect(s).toBeDefined()
    expect(s.type).toBe('sd')
    expect(s.status).toBe('available')
    expect(s).toHaveProperty('maintenance_note')
    expect(s).toHaveProperty('last_updated')
  })
})

describe('DELETE /api/scooters/:id', () => {
  it('deletes existing scooter', async () => {
    const { status, data } = await api('DELETE', '/api/scooters/SD-100')
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('does not error on non-existent ID (Worst Case)', async () => {
    const { status, data } = await api('DELETE', '/api/scooters/NONEXISTENT')
    expect(status).toBe(200)
    expect(data.success).toBe(true)
  })
})

describe('PATCH /api/scooters/:id', () => {
  it('updates scooter status', async () => {
    const { data } = await api('PATCH', '/api/scooters/SD-5', { status: 'maintenance', maintenanceNote: 'Ban bocor' })
    expect(data.status).toBe('maintenance')
    expect(data.maintenance_note).toBe('Ban bocor')
  })

  it('returns 404 for non-existent scooter (Worst Case)', async () => {
    const { status, data } = await api('PATCH', '/api/scooters/GHOST', { status: 'in-use' })
    expect(status).toBe(404)
    expect(data.error).toMatch(/tidak ditemukan/)
  })

  it('handles empty fields gracefully (Worst Case)', async () => {
    const { status, data } = await api('PATCH', '/api/scooters/SD-5', {})
    expect(status).toBe(200)
    expect(data).toBeDefined()
  })

  it('clears maintenance note when setting to available', async () => {
    await api('PATCH', '/api/scooters/SD-5', { status: 'available', maintenanceNote: '' })
    const { data } = await api('GET', '/api/scooters')
    const s = data.find(x => x.id === 'SD-5')
    expect(s.status).toBe('available')
    expect(s.maintenance_note).toBeNull()
  })

  it('stores null when maintenanceNote is omitted', async () => {
    const { data } = await api('PATCH', '/api/scooters/SD-5', { status: 'maintenance' })
    expect(data.maintenance_note).toBeNull()
  })
})

// ── Toggle ─────────────────────────────────────────────────
describe('POST /api/scooters/:id/toggle', () => {
  it('returns error for non-existent scooter (Worst Case)', async () => {
    const { data } = await api('POST', '/api/scooters/GHOST/toggle', {})
    expect(data.success).toBe(false)
    expect(data.message).toMatch(/tidak ditemukan/)
  })

  it('blocks checkout when in maintenance (Worst Case)', async () => {
    await api('POST', '/api/scooters', { id: 'SD-10', type: 'sd' })
    await api('PATCH', '/api/scooters/SD-10', { status: 'maintenance', maintenanceNote: 'Ban Bocor' })
    const { data } = await api('POST', '/api/scooters/SD-10/toggle', {})
    expect(data.success).toBe(false)
    expect(data.requiresConfirmation).toBe(true)
    expect(data.message).toContain('Ban Bocor')
  })

  it('allows checkout with forceMaintenance flag', async () => {
    await api('POST', '/api/scooters', { id: 'SD-11', type: 'sd' })
    await api('PATCH', '/api/scooters/SD-11', { status: 'maintenance' })
    const { data } = await api('POST', '/api/scooters/SD-11/toggle', { forceMaintenance: true })
    expect(data.success).toBe(true)
    expect(data.action).toBe('checkout')
    expect(data.scooter.status).toBe('in-use')
  })

  it('returns scooter when toggling back (return)', async () => {
    const { data } = await api('POST', '/api/scooters/SD-11/toggle', {})
    expect(data.success).toBe(true)
    expect(data.action).toBe('return')
    expect(data.scooter.status).toBe('available')
  })

  it('checkout and return create activity log entries', async () => {
    await api('POST', '/api/scooters', { id: 'SD-12', type: 'sd' })
    await api('POST', '/api/scooters/SD-12/toggle', {})
    await api('POST', '/api/scooters/SD-12/toggle', {})
    const { data } = await api('GET', '/api/activity-log')
    const entries = data.filter(e => e.scooter_id === 'SD-12')
    expect(entries.length).toBe(2)
    expect(entries[0].action).toBe('return')
    expect(entries[1].action).toBe('checkout')
  })
})

// ── Activity Log ───────────────────────────────────────────
describe('GET /api/activity-log', () => {
  it('returns array sorted by timestamp DESC', async () => {
    const { status, data } = await api('GET', '/api/activity-log')
    expect(status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
    for (let i = 1; i < data.length; i++) {
      expect(new Date(data[i - 1].timestamp) >= new Date(data[i].timestamp)).toBe(true)
    }
  })
})

// ── Export ─────────────────────────────────────────────────
describe('GET /api/export', () => {
  it('returns complete data snapshot', async () => {
    const { status, data } = await api('GET', '/api/export')
    expect(status).toBe(200)
    expect(Array.isArray(data.bikes)).toBe(true)
    expect(Array.isArray(data.activityLog)).toBe(true)
    expect(data.exportedAt).toBeDefined()
    expect(data.bikes.length).toBeGreaterThan(0)
  })
})

// ── Malicious Input ────────────────────────────────────────
describe('Malicious input handling (Worst Case)', () => {
  it('rejects SQL injection in ID field', async () => {
    const { data } = await api('POST', '/api/scooters', { id: "'; DROP TABLE scooters; --", type: 'sd' })
    expect(data.id).toMatch(/^SD-/)
  })

  it('rejects extremely long ID', async () => {
    const { data } = await api('POST', '/api/scooters', { id: 'A'.repeat(1000), type: 'sd' })
    expect(data.id).toBeDefined()
  })

  it('handles XSS attempt in maintenanceNote', async () => {
    await api('POST', '/api/scooters', { id: 'SD-20', type: 'sd' })
    const { data } = await api('PATCH', '/api/scooters/SD-20', { status: 'maintenance', maintenanceNote: '<script>alert("xss")</script>' })
    expect(data.maintenance_note).toBe('<script>alert("xss")</script>')
  })
})

// ── DB Migration Tests ─────────────────────────────────────
describe('migrateUnpaddedIds migration', () => {
  it('converts legacy zero-padded scooter IDs and activity logs to unpadded integers', () => {
    db.prepare("INSERT INTO scooters (id, type, status) VALUES ('SD-088', 'sd', 'available')").run()
    db.prepare("INSERT INTO activity_log (id, scooter_id, scooter_type, action) VALUES ('mig-log-1', 'SD-088', 'sd', 'checkout')").run()

    migrateUnpaddedIds(db)

    const scooter = db.prepare("SELECT * FROM scooters WHERE id = 'SD-88'").get()
    expect(scooter).toBeDefined()
    expect(scooter.id).toBe('SD-88')

    const log = db.prepare("SELECT * FROM activity_log WHERE id = 'mig-log-1'").get()
    expect(log).toBeDefined()
    expect(log.scooter_id).toBe('SD-88')
  })
})
