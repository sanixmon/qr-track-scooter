import express from 'express'
import cors from 'cors'
import db from './db.js'

const app = express()
const PORT = process.env.PORT || 3005

app.use(cors())
app.use(express.json())

// Real-time data must never be cached by browsers or HTTP clients
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// ── Helpers ────────────────────────────────────────────────
function serializeScooter(row, dc = null, activeMaint = null) {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    maintenance_note: row.maintenance_note,
    last_updated: row.last_updated,
    device_condition: dc ? {
      setelan: dc.setelan,
      lampu: dc.lampu,
      baterai: dc.baterai,
      monitor: dc.monitor,
      rem: dc.rem,
      ban: dc.ban,
      updated_at: dc.updated_at
    } : null,
    active_maintenance: activeMaint ? {
      id: activeMaint.id,
      location: activeMaint.location,
      issue: activeMaint.issue,
      note: activeMaint.note,
      status: activeMaint.status,
      started_at: activeMaint.started_at
    } : null
  }
}

function getScooterRow(id) {
  const row = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  if (!row) return null
  const dc = db.prepare('SELECT * FROM device_conditions WHERE scooter_id = ?').get(id)
  const activeMaint = db.prepare(
    "SELECT * FROM maintenance_records WHERE scooter_id = ? AND status = 'repair' ORDER BY started_at DESC LIMIT 1"
  ).get(id)
  return serializeScooter(row, dc, activeMaint)
}

const DEVICE_FIELDS = ['setelan', 'lampu', 'baterai', 'monitor', 'rem', 'ban']
const DEVICE_VALUES = {
  setelan: ['ada', 'tidak'],
  lampu: ['nyala', 'redup'],
  baterai: ['normal', 'drop'],
  monitor: ['normal', 'e2', 'e4', 'e16', 'e6'],
  rem: ['normal', 'rusak'],
  ban: ['botak', 'tipis', 'aman']
}

// ── Scooters ───────────────────────────────────────────────
app.get('/api/scooters', (req, res) => {
  const rows = db.prepare('SELECT * FROM scooters ORDER BY id ASC').all()
  const conditions = db.prepare('SELECT * FROM device_conditions').all()
  const activeMaints = db.prepare(
    "SELECT * FROM maintenance_records WHERE status = 'repair' ORDER BY started_at DESC"
  ).all()

  const dcMap = new Map(conditions.map(c => [c.scooter_id, c]))
  const maintMap = new Map()
  for (const m of activeMaints) {
    if (!maintMap.has(m.scooter_id)) maintMap.set(m.scooter_id, m)
  }

  res.json(rows.map(row => serializeScooter(row, dcMap.get(row.id), maintMap.get(row.id))))
})

app.post('/api/scooters', (req, res) => {
  const { id, type } = req.body

  if (!type || !['sd', 'sj'].includes(type)) {
    return res.status(400).json({ error: 'Tipe scooter harus sd atau sj.' })
  }

  const prefix = `${type.toUpperCase()}-`
  let finalId = id ? id.trim().toUpperCase() : ''

  if (finalId) {
    if (!finalId.startsWith(prefix)) {
      const numericPart = finalId.replace(/\D/g, '')
      if (numericPart) {
        finalId = `${prefix}${parseInt(numericPart, 10)}`
      } else {
        finalId = `${prefix}${finalId}`
      }
    } else {
      const parts = finalId.split('-')
      if (parts.length === 2 && !isNaN(parseInt(parts[1], 10))) {
        finalId = `${parts[0]}-${parseInt(parts[1], 10)}`
      }
    }

    const existing = db.prepare('SELECT id FROM scooters WHERE id = ?').get(finalId)
    if (existing) {
      return res.status(409).json({ error: `ID "${finalId}" sudah terdaftar di sistem.` })
    }
  } else {
    const sameType = db.prepare(
      "SELECT id FROM scooters WHERE type = ?"
    ).all(type)

    const nums = sameType
      .map(r => { const n = r.id.replace(prefix, ''); return parseInt(n, 10) })
      .filter(n => !isNaN(n))
    const next = nums.length ? Math.max(...nums) + 1 : 1
    finalId = `${prefix}${next}`
  }

  const newScooter = {
    id: finalId,
    type,
    status: 'available',
    maintenance_note: null,
    last_updated: new Date().toISOString()
  }

  db.prepare(`
    INSERT INTO scooters (id, type, status, maintenance_note, last_updated)
    VALUES (@id, @type, @status, @maintenance_note, @last_updated)
  `).run(newScooter)

  res.status(201).json(getScooterRow(finalId))
})

app.delete('/api/scooters/:id', (req, res) => {
  const { id } = req.params
  db.prepare('DELETE FROM scooters WHERE id = ?').run(id)
  res.json({ success: true })
})

app.patch('/api/scooters/:id', (req, res) => {
  const { id } = req.params
  const fields = req.body

  const existing = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  if (!existing) {
    return res.status(404).json({ error: `Scooter "${id}" tidak ditemukan.` })
  }

  const updates = []
  const params = {}

  if ('status' in fields) {
    updates.push('status = @status')
    params.status = fields.status
  }
  if ('maintenanceNote' in fields) {
    const note = fields.maintenanceNote
    params.maintenance_note = (note === null || note === undefined || note === '') ? null : note
    updates.push('maintenance_note = @maintenance_note')
  }

  if (updates.length > 0) {
    params.last_updated = new Date().toISOString()
    updates.push('last_updated = @last_updated')
    params.id = id
    db.prepare(`UPDATE scooters SET ${updates.join(', ')} WHERE id = @id`).run(params)
  }

  // Maintenance record lifecycle
  if ('status' in fields) {
    const newStatus = fields.status
    if (newStatus === 'maintenance' && existing.status !== 'maintenance') {
      // Starting maintenance → create an open record
      const recId = `mnt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const location = fields.location === 'luar' ? 'luar' : (fields.location === 'outlet' ? 'outlet' : 'outlet')
      db.prepare(`
        INSERT INTO maintenance_records (id, scooter_id, location, issue, note, status, started_at)
        VALUES (?, ?, ?, ?, ?, 'repair', ?)
      `).run(
        recId,
        id,
        location,
        fields.issue || fields.maintenanceNote || 'Perbaikan rutin',
        fields.note || null,
        new Date().toISOString()
      )
    } else if (existing.status === 'maintenance' && newStatus !== 'maintenance') {
      // Leaving maintenance → close open records
      db.prepare(`
        UPDATE maintenance_records SET status = 'done', resolved_at = ?
        WHERE scooter_id = ? AND status = 'repair'
      `).run(new Date().toISOString(), id)
    }
  }

  res.json(getScooterRow(id))
})

// ── Device Condition ───────────────────────────────────────
app.put('/api/scooters/:id/device-condition', (req, res) => {
  const { id } = req.params
  const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  if (!scooter) {
    return res.status(404).json({ error: `Scooter "${id}" tidak ditemukan.` })
  }

  const values = {}
  for (const field of DEVICE_FIELDS) {
    const v = req.body?.[field]
    if (v === undefined || v === null || v === '') {
      values[field] = null
    } else if (DEVICE_VALUES[field].includes(v)) {
      values[field] = v
    } else {
      return res.status(400).json({ error: `Nilai tidak valid untuk ${field}.` })
    }
  }

  db.prepare(`
    INSERT INTO device_conditions (scooter_id, setelan, lampu, baterai, monitor, rem, ban, updated_at)
    VALUES (@id, @setelan, @lampu, @baterai, @monitor, @rem, @ban, @updated_at)
    ON CONFLICT(scooter_id) DO UPDATE SET
      setelan = @setelan, lampu = @lampu, baterai = @baterai, monitor = @monitor,
      rem = @rem, ban = @ban, updated_at = @updated_at
  `).run({
    id,
    ...values,
    updated_at: new Date().toISOString()
  })

  // Auto status: Jenis Error (monitor != normal) → rusak, back to normal → tersedia.
  // Never override in-use (rented out) or maintenance units.
  const isError = values.monitor !== null && values.monitor !== 'normal'
  if (isError) {
    if (scooter.status === 'available') {
      db.prepare(`
        UPDATE scooters SET status = 'rusak', maintenance_note = ?, last_updated = ?
        WHERE id = ?
      `).run(`Error ${values.monitor.toUpperCase()}`, new Date().toISOString(), id)
    }
  } else if (scooter.status === 'rusak') {
    db.prepare(`
      UPDATE scooters SET status = 'available', maintenance_note = NULL, last_updated = ?
      WHERE id = ?
    `).run(new Date().toISOString(), id)
  }

  const dc = db.prepare('SELECT * FROM device_conditions WHERE scooter_id = ?').get(id)
  const updatedScooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  res.json({
    success: true,
    scooter: updatedScooter,
    device_condition: {
      setelan: dc.setelan,
      lampu: dc.lampu,
      baterai: dc.baterai,
      monitor: dc.monitor,
      rem: dc.rem,
      ban: dc.ban,
      updated_at: dc.updated_at
    }
  })
})

// ── Maintenance Records ────────────────────────────────────
app.get('/api/maintenance-records', (req, res) => {
  const rows = db.prepare(`
    SELECT mr.*, s.type AS scooter_type
    FROM maintenance_records mr
    JOIN scooters s ON s.id = mr.scooter_id
    ORDER BY mr.started_at DESC
  `).all()
  res.json(rows)
})

app.post('/api/maintenance-records/:id/complete', (req, res) => {
  const { id } = req.params
  const rec = db.prepare('SELECT * FROM maintenance_records WHERE id = ?').get(id)
  if (!rec) {
    return res.status(404).json({ error: 'Catatan maintenance tidak ditemukan.' })
  }

  db.prepare(`
    UPDATE maintenance_records SET status = 'done', resolved_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id)

  // If no other open records, restore scooter to available
  const remaining = db.prepare(
    "SELECT COUNT(*) as count FROM maintenance_records WHERE scooter_id = ? AND status = 'repair'"
  ).get(rec.scooter_id)

  if (remaining.count === 0) {
    const scooter = db.prepare('SELECT * FROM scooters WHERE id = ?').get(rec.scooter_id)
    if (scooter && scooter.status === 'maintenance') {
      db.prepare(`
        UPDATE scooters SET status = 'available', maintenance_note = NULL, last_updated = ?
        WHERE id = ?
      `).run(new Date().toISOString(), rec.scooter_id)
    }
  }

  const updated = db.prepare('SELECT * FROM maintenance_records WHERE id = ?').get(id)
  res.json({ success: true, record: updated })
})

// ── Toggle ─────────────────────────────────────────────────
app.post('/api/scooters/:id/toggle', (req, res) => {
  const { id } = req.params
  const forceMaintenance = req.body.forceMaintenance === true

  const bike = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  if (!bike) {
    return res.json({ success: false, message: `Scooter "${id}" tidak ditemukan.` })
  }

  if ((bike.status === 'maintenance' || bike.status === 'rusak') && !forceMaintenance) {
    const isRusak = bike.status === 'rusak'
    const noteText = bike.maintenance_note
      ? `\n${isRusak ? 'Catatan Kerusakan' : 'Catatan Perbaikan'}: "${bike.maintenance_note}"`
      : ''
    return res.json({
      success: false,
      requiresConfirmation: true,
      message: `Apakah Anda yakin akan menyewakan unit ${bike.id} yang sedang dalam status ${isRusak ? 'rusak' : 'maintenance'}?${noteText}`
    })
  }

  const wasAvailable = bike.status === 'available' || bike.status === 'maintenance' || bike.status === 'rusak'
  const nextStatus = wasAvailable ? 'in-use' : 'available'

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE scooters SET status = ?, last_updated = ?, maintenance_note = CASE WHEN ? = 'in-use' THEN NULL ELSE maintenance_note END
    WHERE id = ?
  `).run(nextStatus, now, nextStatus, id)

  // Leaving maintenance/rusak (force checkout) closes open repair records
  if ((bike.status === 'maintenance' || bike.status === 'rusak') && nextStatus === 'in-use') {
    db.prepare(`
      UPDATE maintenance_records SET status = 'done', resolved_at = ?
      WHERE scooter_id = ? AND status = 'repair'
    `).run(now, id)
  }

  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  db.prepare(`
    INSERT INTO activity_log (id, scooter_id, scooter_type, action, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(logId, id, bike.type, wasAvailable ? 'checkout' : 'return', new Date().toISOString())

  const typeLabel = bike.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'

  res.json({
    success: true,
    scooter: getScooterRow(id),
    action: wasAvailable ? 'checkout' : 'return',
    message: wasAvailable
      ? `Scooter ${id} (${typeLabel}) sekarang sedang digunakan.`
      : `Scooter ${id} (${typeLabel}) telah dikembalikan.`
  })
})

// ── Activity Log ───────────────────────────────────────────
app.get('/api/activity-log', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 500'
  ).all()
  res.json(rows)
})

import { createDatabaseBackup } from './backup.js'

app.post('/api/backup', async (req, res, next) => {
  try {
    const result = await createDatabaseBackup()
    res.json({ success: true, ...result })
  } catch (err) {
    next(err)
  }
})

app.get('/api/backup/download', async (req, res, next) => {
  try {
    const result = await createDatabaseBackup()
    res.download(result.path, result.filename)
  } catch (err) {
    next(err)
  }
})

app.get('/api/export', (req, res) => {
  const bikes = db.prepare('SELECT * FROM scooters ORDER BY id ASC').all()
  const activityLog = db.prepare('SELECT * FROM activity_log ORDER BY timestamp DESC LIMIT 500').all()
  res.json({ bikes, activityLog, exportedAt: new Date().toISOString() })
})

app.use((err, req, res, _next) => { // eslint-disable-line no-unused-vars
  console.error('Server error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`TrackScooter API running on http://localhost:${PORT}`)
  })
}

export { app }
