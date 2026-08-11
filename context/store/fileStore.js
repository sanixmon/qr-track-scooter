// ── FileContextStore: JSONL-backed persistent store ───────
// Source of truth lives at .ai/knowledge/knowledge.jsonl. Writes are atomic
// (temp file + rename). ID counters live in .ai/manifest.json (`id_counters`).
// Single-writer assumption (TODO: locking if concurrent writers are added).

import fs from 'node:fs'
import path from 'node:path'
import { MemoryContextStore } from './store.js'
import { maxCountersFromIds } from './ids.js'

export class FileContextStore extends MemoryContextStore {
  constructor({ file, manifestFile = null, counters = {}, now } = {}) {
    if (!file) throw new Error('FileContextStore requires { file }')
    super({ now, counters })
    this.file = file
    this.manifestFile = manifestFile
    this._loaded = false
    this._load()
  }

  _load() {
    if (this._loaded) return
    this._loaded = true

    // Bootstrap counters from manifest.json (id_counters).
    if (this.manifestFile && fs.existsSync(this.manifestFile)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(this.manifestFile, 'utf8'))
        const saved = manifest.id_counters
        if (saved && typeof saved === 'object') {
          for (const [type, n] of Object.entries(saved)) {
            if (n > (this._counters[type] ?? 0)) this._counters[type] = n
          }
        }
      } catch {
        // corrupt manifest — counters will be rebuilt from entries below
      }
    }

    if (!fs.existsSync(this.file)) return
    const raw = fs.readFileSync(this.file, 'utf8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed)
        if (entry && entry.id) this._entries.set(entry.id, entry)
      } catch {
        // Skip corrupt lines instead of failing the whole store.
        console.warn(`[context] skipping malformed line in ${this.file}`)
      }
    }

    // Reconcile counters with existing entries (migration safety: never
    // reuse an id that already exists on disk).
    const maxes = maxCountersFromIds(this._entries.keys())
    for (const [type, n] of Object.entries(maxes)) {
      if (n > (this._counters[type] ?? 0)) this._counters[type] = n
    }
  }

  _persist() {
    const dir = path.dirname(this.file)
    fs.mkdirSync(dir, { recursive: true })
    const lines = [...this._entries.values()].map(e => JSON.stringify(e))
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  /** Write id_counters back into manifest.json (preserving other fields). */
  _persistCounters() {
    if (!this.manifestFile) return
    let manifest = {}
    if (fs.existsSync(this.manifestFile)) {
      try { manifest = JSON.parse(fs.readFileSync(this.manifestFile, 'utf8')) } catch { manifest = {} }
    }
    manifest.id_counters = { ...this._counters }
    fs.mkdirSync(path.dirname(this.manifestFile), { recursive: true })
    fs.writeFileSync(this.manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  }

  add(input) {
    const added = super.add(input)
    this._persist()
    this._persistCounters()
    return added
  }

  supersede(oldId, newItem) {
    const added = super.supersede(oldId, newItem)
    if (added) {
      this._persist()
      this._persistCounters()
    }
    return added
  }

  update(id, patch) {
    const updated = super.update(id, patch)
    if (updated) this._persist()
    return updated
  }

  delete(id) {
    const deleted = super.delete(id)
    if (deleted) this._persist()
    return deleted
  }

  clear() {
    const cleared = super.clear()
    if (cleared) {
      if (fs.existsSync(this.file)) fs.unlinkSync(this.file)
      this._persistCounters()
    }
    return cleared
  }
}
