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
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'in-use', 'rusak', 'maintenance')),
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

/**
 * Migrate legacy scooters tables that only knew 3 statuses
 * ('available', 'in-use', 'maintenance') to also allow 'rusak'.
 * SQLite cannot ALTER a CHECK constraint, so the table is rebuilt.
 */
export function migrateAddRusakStatus(dbInstance) {
  try {
    const table = dbInstance.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'scooters'"
    ).get()

    if (!table || !table.sql) return
    if (table.sql.includes("'rusak'")) return // already migrated

    dbInstance.exec(`
      BEGIN;
      CREATE TABLE scooters_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('sd', 'sj')),
        status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'in-use', 'rusak', 'maintenance')),
        maintenance_note TEXT,
        last_updated TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO scooters_new (id, type, status, maintenance_note, last_updated)
        SELECT id, type, status, maintenance_note, last_updated FROM scooters;
      DROP TABLE scooters;
      ALTER TABLE scooters_new RENAME TO scooters;
      COMMIT;
    `)
  } catch (err) {
    console.error('Migration error (add rusak status):', err)
  }
}

migrateAddRusakStatus(db)

db.exec(`
  -- Per-unit device condition checklist (status router)
  CREATE TABLE IF NOT EXISTS device_conditions (
    scooter_id TEXT PRIMARY KEY REFERENCES scooters(id) ON DELETE CASCADE,
    setelan TEXT CHECK(setelan IN ('ada', 'tidak')),
    lampu TEXT CHECK(lampu IN ('nyala', 'tidak')),
    baterai TEXT CHECK(baterai IN ('normal', 'drop')),
    monitor TEXT CHECK(monitor IN ('normal', 'e2', 'e4', 'e16', 'e6', 'lain')),
    rem TEXT CHECK(rem IN ('normal', 'rusak')),
    ban TEXT CHECK(ban IN ('botak', 'tipis', 'aman')),
    monitor_detail TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Maintenance tracking: location (outlet/luar) + issue + status
  CREATE TABLE IF NOT EXISTS maintenance_records (
    id TEXT PRIMARY KEY,
    scooter_id TEXT NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    location TEXT NOT NULL CHECK(location IN ('outlet', 'luar')),
    issue TEXT,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'repair' CHECK(status IN ('repair', 'done')),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_maintenance_scooter ON maintenance_records(scooter_id);
`)

/**
 * Migrate legacy device_conditions tables where ban only allowed
 * ('normal', 'rusak') to the new tire tread options ('botak', 'tipis', 'aman').
 * Old values are mapped: rusak → botak, normal → aman.
 */
export function migrateBanOptions(dbInstance) {
  try {
    const table = dbInstance.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'device_conditions'"
    ).get()

    if (!table || !table.sql) return
    if (table.sql.includes("'botak'")) return // already migrated

    dbInstance.exec(`
      BEGIN;
      CREATE TABLE device_conditions_new (
        scooter_id TEXT PRIMARY KEY REFERENCES scooters(id) ON DELETE CASCADE,
        setelan TEXT CHECK(setelan IN ('ada', 'tidak')),
        lampu TEXT CHECK(lampu IN ('nyala', 'redup')),
        baterai TEXT CHECK(baterai IN ('normal', 'drop')),
        monitor TEXT CHECK(monitor IN ('normal', 'e2', 'e4', 'e16', 'e6')),
        rem TEXT CHECK(rem IN ('normal', 'rusak')),
        ban TEXT CHECK(ban IN ('botak', 'tipis', 'aman')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO device_conditions_new (scooter_id, setelan, lampu, baterai, monitor, rem, ban, updated_at)
        SELECT
          scooter_id, setelan, lampu, baterai, monitor, rem,
          CASE ban WHEN 'rusak' THEN 'botak' WHEN 'normal' THEN 'aman' ELSE ban END,
          updated_at
        FROM device_conditions;
      DROP TABLE device_conditions;
      ALTER TABLE device_conditions_new RENAME TO device_conditions;
      COMMIT;
    `)
  } catch (err) {
    console.error('Migration error (ban options):', err)
  }
}

migrateBanOptions(db)

/**
 * Migrate device_conditions so lampu accepts ('nyala', 'tidak') instead of
 * ('nyala', 'redup') and monitor accepts a free-form "lain" option backed by a
 * new monitor_detail text column.
 */
export function migrateDeviceOptions(dbInstance) {
  try {
    const table = dbInstance.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'device_conditions'"
    ).get()

    if (!table || !table.sql) return
    if (table.sql.includes("'lain'") && table.sql.toLowerCase().includes('monitor_detail')) return // already migrated

    dbInstance.exec(`
      BEGIN;
      CREATE TABLE device_conditions_new (
        scooter_id TEXT PRIMARY KEY REFERENCES scooters(id) ON DELETE CASCADE,
        setelan TEXT CHECK(setelan IN ('ada', 'tidak')),
        lampu TEXT CHECK(lampu IN ('nyala', 'tidak')),
        baterai TEXT CHECK(baterai IN ('normal', 'drop')),
        monitor TEXT CHECK(monitor IN ('normal', 'e2', 'e4', 'e16', 'e6', 'lain')),
        rem TEXT CHECK(rem IN ('normal', 'rusak')),
        ban TEXT CHECK(ban IN ('botak', 'tipis', 'aman')),
        monitor_detail TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO device_conditions_new (scooter_id, setelan, lampu, baterai, monitor, rem, ban, monitor_detail, updated_at)
        SELECT scooter_id, setelan,
        CASE lampu WHEN 'redup' THEN 'tidak' ELSE lampu END,
        baterai, monitor, rem, ban, NULL, updated_at
        FROM device_conditions;
      DROP TABLE device_conditions;
      ALTER TABLE device_conditions_new RENAME TO device_conditions;
      COMMIT;
    `)
  } catch (err) {
    console.error('Migration error (device options):', err)
  }
}

migrateDeviceOptions(db)

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
