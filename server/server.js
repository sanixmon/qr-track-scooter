import express from 'express'
import cors from 'cors'
import db from './db.js'

const app = express()
const PORT = process.env.PORT || 3005

app.use(cors())
app.use(express.json())

app.get('/api/scooters', (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM scooters ORDER BY id ASC'
  ).all()
  res.json(rows)
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

  res.status(201).json(newScooter)
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

  const updated = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  res.json(updated)
})

app.post('/api/scooters/:id/toggle', (req, res) => {
  const { id } = req.params
  const forceMaintenance = req.body.forceMaintenance === true

  const bike = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  if (!bike) {
    return res.json({ success: false, message: `Scooter "${id}" tidak ditemukan.` })
  }

  if (bike.status === 'maintenance' && !forceMaintenance) {
    const noteText = bike.maintenance_note ? `\nCatatan Perbaikan: "${bike.maintenance_note}"` : ''
    return res.json({
      success: false,
      requiresConfirmation: true,
      message: `Apakah Anda yakin akan menyewakan unit ${bike.id} yang sedang dalam maintenance?${noteText}`
    })
  }

  const wasAvailable = bike.status === 'available' || bike.status === 'maintenance'
  const nextStatus = wasAvailable ? 'in-use' : 'available'

  const now = new Date().toISOString()
  db.prepare(`
    UPDATE scooters SET status = ?, last_updated = ?, maintenance_note = CASE WHEN ? = 'in-use' THEN NULL ELSE maintenance_note END
    WHERE id = ?
  `).run(nextStatus, now, nextStatus, id)

  const logId = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  db.prepare(`
    INSERT INTO activity_log (id, scooter_id, scooter_type, action, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `).run(logId, id, bike.type, wasAvailable ? 'checkout' : 'return', new Date().toISOString())

  const updated = db.prepare('SELECT * FROM scooters WHERE id = ?').get(id)
  const typeLabel = bike.type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'

  res.json({
    success: true,
    scooter: updated,
    action: wasAvailable ? 'checkout' : 'return',
    message: wasAvailable
      ? `Scooter ${id} (${typeLabel}) sekarang sedang digunakan.`
      : `Scooter ${id} (${typeLabel}) telah dikembalikan.`
  })
})

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
