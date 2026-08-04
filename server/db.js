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

function migrateUnpaddedIds(dbInstance) {
  try {
    const scooters = dbInstance.prepare("SELECT id FROM scooters WHERE id LIKE '%-0%'").all()
    if (!scooters || scooters.length === 0) return

    const updateScooter = dbInstance.prepare("UPDATE scooters SET id = ? WHERE id = ?")
    const updateLog = dbInstance.prepare("UPDATE activity_log SET scooter_id = ? WHERE scooter_id = ?")

    const transaction = dbInstance.transaction((rows) => {
      for (const row of rows) {
        const parts = row.id.split('-')
        if (parts.length === 2) {
          const prefix = parts[0]
          const num = parseInt(parts[1], 10)
          if (!isNaN(num)) {
            const newId = `${prefix}-${num}`
            updateScooter.run(newId, row.id)
            updateLog.run(newId, row.id)
          }
        }
      }
    })

    transaction(scooters)
  } catch (err) {
    console.error('Migration error:', err)
  }
}

migrateUnpaddedIds(db)

export default db
