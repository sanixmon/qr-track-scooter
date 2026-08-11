import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import db from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function dirname(p) {
  return path.dirname(p)
}

const MAX_BACKUPS = Number(process.env.BACKUP_RETENTION || 10)

/** Remove oldest backup files, keeping at most MAX_BACKUPS recent ones. */
function enforceRetention(backupsDir) {
  try {
    const files = fs.readdirSync(backupsDir)
      .filter(f => /^trackscooter_backup_/.test(f))
      .map(f => ({ f, mtime: fs.statSync(path.join(backupsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)

    for (const { f } of files.slice(MAX_BACKUPS)) {
      fs.unlinkSync(path.join(backupsDir, f))
    }
  } catch (err) {
    console.error('Backup retention error:', err)
  }
}

export async function createDatabaseBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `trackscooter_backup_${timestamp}.db`

  if (process.env.NODE_ENV === 'test') {
    // In-memory test db → write to a temp dir so tests never touch real
    // production backups or trigger retention against them.
    const backupsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ts-backup-'))
    const bikes = db.prepare('SELECT * FROM scooters').all()
    const activityLog = db.prepare('SELECT * FROM activity_log').all()
    const destPath = path.join(backupsDir, filename)
    fs.writeFileSync(destPath + '.json', JSON.stringify({ bikes, activityLog, timestamp }))
    return { filename: filename + '.json', path: destPath + '.json', timestamp }
  }

  const backupsDir = path.join(__dirname, 'backups')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }
  const destPath = path.join(backupsDir, filename)

  await db.backup(destPath)
  enforceRetention(backupsDir)
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
