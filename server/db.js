import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const dbPath = process.env.NODE_ENV === 'test'
  ? ':memory:'
  : join(__dirname, 'trackscooter.db')

const db = new Database(dbPath)

if (process.env.NODE_ENV !== 'test') {
  db.pragma('journal_mode = WAL')
}
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS scooters (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('sd', 'sj')),
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'in-use', 'maintenance')),
    maintenance_note TEXT,
    last_updated TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    scooter_id TEXT NOT NULL,
    scooter_type TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('checkout', 'return')),
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

export function migrateUnpaddedIds(dbInstance) {
  try {
    const scooters = dbInstance.prepare("SELECT id FROM scooters WHERE id LIKE '%-0%'").all()
    const logs = dbInstance.prepare("SELECT DISTINCT scooter_id FROM activity_log WHERE scooter_id LIKE '%-0%'").all()
    if ((!scooters || scooters.length === 0) && (!logs || logs.length === 0)) return

    const updateScooter = dbInstance.prepare("UPDATE scooters SET id = ? WHERE id = ?")
    const updateLog = dbInstance.prepare("UPDATE activity_log SET scooter_id = ? WHERE scooter_id = ?")
    const checkExists = dbInstance.prepare("SELECT COUNT(*) as count FROM scooters WHERE id = ?")

    const transaction = dbInstance.transaction(() => {
      for (const row of scooters) {
        const parts = row.id.split('-')
        if (parts.length === 2) {
          const prefix = parts[0]
          const num = parseInt(parts[1], 10)
          if (!isNaN(num)) {
            const newId = `${prefix}-${num}`
            const exists = checkExists.get(newId)?.count > 0
            if (!exists) {
              updateScooter.run(newId, row.id)
            }
            updateLog.run(newId, row.id)
          }
        }
      }

      for (const log of logs) {
        const parts = log.scooter_id.split('-')
        if (parts.length === 2) {
          const prefix = parts[0]
          const num = parseInt(parts[1], 10)
          if (!isNaN(num)) {
            const newId = `${prefix}-${num}`
            updateLog.run(newId, log.scooter_id)
          }
        }
      }
    })

    transaction()
  } catch (err) {
    console.error('Migration error:', err)
  }
}

migrateUnpaddedIds(db)

export default db
