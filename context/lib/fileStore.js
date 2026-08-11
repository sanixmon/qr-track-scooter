// ── FileContextStore: JSONL-backed persistent store ───────
// Source of truth lives at .ai/knowledge/knowledge.jsonl. Writes are atomic
// (temp file + rename). A file store is instantiated empty if missing.

import fs from 'node:fs'
import path from 'node:path'
import { MemoryContextStore } from './store.js'

export class FileContextStore extends MemoryContextStore {
  constructor({ file, now } = {}) {
    super({ now })
    if (!file) throw new Error('FileContextStore requires { file }')
    this.file = file
    this._loaded = false
    this._load()
  }

  _load() {
    if (this._loaded) return
    this._loaded = true
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
  }

  _persist() {
    const dir = path.dirname(this.file)
    fs.mkdirSync(dir, { recursive: true })
    const lines = [...this._entries.values()].map(e => JSON.stringify(e))
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, lines.join('\n') + (lines.length ? '\n' : ''), 'utf8')
    fs.renameSync(tmp, this.file)
  }

  add(input) {
    const added = super.add(input)
    this._persist()
    return added
  }

  update(id, patch) {
    const updated = super.update(id, patch)
    if (updated) this._persist()
    return updated
  }

  supersede(id, opts) {
    const updated = super.supersede(id, opts)
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
    }
    return cleared
  }
}
