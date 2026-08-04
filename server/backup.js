import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function dirname(p) {
  return path.dirname(p)
}

export async function createDatabaseBackup() {
  const backupsDir = path.join(__dirname, 'backups')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `trackscooter_backup_${timestamp}.db`
  const destPath = path.join(backupsDir, filename)

  if (process.env.NODE_ENV === 'test') {
    // In-memory test db
    const bikes = db.prepare('SELECT * FROM scooters').all()
    const activityLog = db.prepare('SELECT * FROM activity_log').all()
    fs.writeFileSync(destPath + '.json', JSON.stringify({ bikes, activityLog, timestamp }))
    return { filename: filename + '.json', path: destPath + '.json', timestamp }
  }

  await db.backup(destPath)
  return { filename, path: destPath, timestamp }
}

if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  createDatabaseBackup()
    .then((res) => {
      console.log(`[Backup Success] File saved to: ${res.path}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error('[Backup Error]', err)
      process.exit(1)
    })
}
