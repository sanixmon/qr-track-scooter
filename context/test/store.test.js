import fs from 'node:fs'
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryContextStore } from '../store/store.js'
import { FileContextStore } from '../store/fileStore.js'
import { fixedClock, tempDir, rmDir, readFileOr } from './helpers.js'

const dirs = []
afterEach(() => {
  while (dirs.length) rmDir(dirs.pop())
})

function base() {
  return {
    type: 'fact',
    content: 'API berjalan di port 3005',
    confidence: 0.6,
    importance: 2,
  }
}

describe('MemoryContextStore', () => {
  it('adds entries and auto-assigns sequential ids per type', () => {
    const store = new MemoryContextStore()
    const a = store.add(base())
    const b = store.add({ ...base(), type: 'decision', content: 'Kita pakai SQLite untuk database' })
    const c = store.add(base())
    expect(a.id).toBe('fact-001')
    expect(b.id).toBe('decision-001')
    expect(c.id).toBe('fact-002')
    expect(store.get('fact-001').content).toBe('API berjalan di port 3005')
  })

  it('supports explicit counters (manifest-backed ids)', () => {
    const store = new MemoryContextStore({ counters: { decision: 41 } })
    const d = store.add({ type: 'decision', content: 'x y' })
    expect(d.id).toBe('decision-042')
  })

  it('fills keywords, timestamps, and sensitive=false by default', () => {
    const now = fixedClock()
    const store = new MemoryContextStore({ now })
    const a = store.add(base())
    expect(a.keywords).toContain('port')
    expect(a.keywords).toContain('3005')
    expect(a.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(a.status).toBe('active')
    expect(a.sensitive).toBe(false)
  })

  it('stores the sensitive flag', () => {
    const store = new MemoryContextStore()
    const s = store.add({ type: 'fact', content: 'API key produksi: abc123', sensitive: true })
    expect(s.sensitive).toBe(true)
    expect(store.list({ sensitive: true })).toHaveLength(1)
    expect(store.list({ sensitive: false })).toHaveLength(0)
  })

  it('rejects invalid type / empty content', () => {
    const store = new MemoryContextStore()
    expect(() => store.add({ ...base(), type: 'nonsense' })).toThrow(/invalid entry.type/)
    expect(() => store.add({ ...base(), content: '  ' })).toThrow(/non-empty/)
  })

  it('update bumps last_verified and refreshes keywords on content change', () => {
    const now = fixedClock('2026-01-01T00:00:00.000Z', 60_000)
    const store = new MemoryContextStore({ now })
    const a = store.add(base())
    store.update(a.id, {})
    expect(store.get(a.id).last_verified).toBe('2026-01-01T00:01:00.000Z')
    const changed = store.update(a.id, { content: 'API pindah ke port 4000' })
    expect(changed.keywords).toContain('4000')
  })

  it('supersede(oldId, newItem) keeps lineage: new.supersedes + old.superseded_by', () => {
    const store = new MemoryContextStore()
    const old = store.add({ type: 'decision', content: 'Kita pakai PostgreSQL untuk database', topic: 'database' })
    const nu = store.supersede(old.id, { type: 'decision', content: 'Kita pakai SQLite untuk database', topic: 'database' })
    expect(nu.id).toBe('decision-002')
    expect(nu.supersedes).toBe('decision-001')
    const o = store.get(old.id)
    expect(o.status).toBe('superseded')
    expect(o.superseded_by).toBe('decision-002')
    expect(store.get(nu.id).status).toBe('active')
    expect(store.get('decision-001')).not.toBeNull() // old tidak dihapus
  })

  it('supersede returns null for unknown oldId', () => {
    const store = new MemoryContextStore()
    expect(store.supersede('nope', { type: 'decision', content: 'x' })).toBeNull()
  })

  it('list filters by type/status/topic/sensitive and sorts by id', () => {
    const store = new MemoryContextStore()
    store.add(base())
    store.add({ ...base(), type: 'decision', content: 'Kita pakai SQLite untuk database', topic: 'database' })
    store.add({ ...base(), type: 'fact', content: 'Ban botak perlu diganti', status: 'temporary' })
    expect(store.list({ type: 'fact', status: 'active' })).toHaveLength(1)
    expect(store.list({ type: 'decision' })).toHaveLength(1)
    expect(store.list({ status: 'temporary' })).toHaveLength(1)
  })

  it('delete removes an entry', () => {
    const store = new MemoryContextStore()
    const a = store.add(base())
    expect(store.delete(a.id)).toBe(true)
    expect(store.get(a.id)).toBeNull()
  })

  it('snapshot filters by session and returns stats', () => {
    const store = new MemoryContextStore()
    store.add({ ...base(), source_session: 'session-001' })
    store.add({ ...base(), source_session: 'session-002' })
    const all = store.snapshot()
    expect(all.entries).toHaveLength(2)
    expect(all.stats.total).toBe(2)
    const s1 = store.snapshot('session-001')
    expect(s1.entries).toHaveLength(1)
    expect(s1.entries[0].source_session).toBe('session-001')
  })

  it('clear empties the store and resets counters', () => {
    const store = new MemoryContextStore()
    store.add(base())
    store.clear()
    expect(store.snapshot().entries).toHaveLength(0)
  })

  it('search and getRelevant delegate to shared scoring', () => {
    const store = new MemoryContextStore()
    store.add({ type: 'decision', content: 'Kita pakai PostgreSQL untuk database', topic: 'database', importance: 4 })
    store.add({ type: 'fact', content: 'Lampu scooter SD-01 redup', topic: 'maintenance', importance: 2 })
    const hits = store.search('postgresql')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].entry.content).toContain('PostgreSQL')
    const relevant = store.getRelevant('postgresql', { k: 1 })
    expect(relevant[0].entry.topic).toBe('database')
  })
})

describe('FileContextStore', () => {
  it('persists JSONL and reloads on a new instance', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    const store = new FileContextStore({ file })
    store.add({ type: 'decision', content: 'Kita pakai SQLite untuk database', topic: 'database' })
    store.add({ type: 'fact', content: 'API berjalan di port 3005', topic: 'api' })

    const reloaded = new FileContextStore({ file })
    expect(reloaded.snapshot().entries).toHaveLength(2)
    expect(reloaded.get('decision-001').content).toBe('Kita pakai SQLite untuk database')

    const raw = readFileOr(dir, 'knowledge.jsonl')
    expect(raw.split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('persists id_counters in manifest.json and continues numbering across restarts', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    const manifestFile = `${dir}/manifest.json`
    const store = new FileContextStore({ file, manifestFile })
    store.add({ type: 'decision', content: 'a b' })
    store.add({ type: 'decision', content: 'c d' })
    store.add({ type: 'fact', content: 'e f' })

    const manifest = JSON.parse(readFileOr(dir, 'manifest.json'))
    expect(manifest.id_counters.decision).toBe(2)
    expect(manifest.id_counters.fact).toBe(1)

    const reloaded = new FileContextStore({ file, manifestFile })
    const next = reloaded.add({ type: 'decision', content: 'g h' })
    expect(next.id).toBe('decision-003') // tidak pernah reuse id
  })

  it('never reuses ids that already exist on disk (migration safety)', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    fs.writeFileSync(file, '{"id":"fact-007","content":"legacy","type":"fact"}\n', 'utf8')
    const store = new FileContextStore({ file })
    const next = store.add({ type: 'fact', content: 'baru' })
    expect(next.id).toBe('fact-008')
  })

  it('writes atomically (no leftover .tmp)', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    const store = new FileContextStore({ file })
    store.add(base())
    store.update('fact-001', {})
    expect(readFileOr(dir, 'knowledge.jsonl.tmp')).toBe('')
  })

  it('skips corrupt lines instead of failing', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    fs.writeFileSync(file, '{"id":"fact-001","content":"ok","type":"fact"}\nnot-json\n', 'utf8')
    const store = new FileContextStore({ file })
    expect(store.get('fact-001').content).toBe('ok')
  })

  it('clear removes the file and resets counters in manifest', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    const manifestFile = `${dir}/manifest.json`
    const store = new FileContextStore({ file, manifestFile })
    store.add(base())
    store.clear()
    expect(readFileOr(dir, 'knowledge.jsonl')).toBe('')
    const manifest = JSON.parse(readFileOr(dir, 'manifest.json'))
    expect(manifest.id_counters).toEqual({})
    // Setelah clear, id mulai dari awal lagi
    const next = new FileContextStore({ file, manifestFile })
    expect(next.add(base()).id).toBe('fact-001')
  })
})
