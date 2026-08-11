import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Create a temp directory, auto-cleaned after the test. */
export function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'))
  return dir
}

export function rmDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

/** Fixed clock for deterministic timestamps. */
export function fixedClock(start = '2026-01-01T00:00:00.000Z', stepMs = 0) {
  let t = new Date(start).getTime()
  return () => {
    const cur = t
    t += stepMs
    return cur
  }
}

/** Read a text file (returns '' when missing). */
export function readFileOr(dir, name, fallback = '') {
  try {
    return fs.readFileSync(path.join(dir, name), 'utf8')
  } catch {
    return fallback
  }
}
