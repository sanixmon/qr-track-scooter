import fs from 'node:fs'
import { describe, it, expect, afterEach } from 'vitest'
import { MemoryContextStore } from '../lib/store.js'
import { FileContextStore } from '../lib/fileStore.js'
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

  it('fills keywords and timestamps automatically', () => {
    const now = fixedClock()
    const store = new MemoryContextStore({ now })
    const a = store.add(base())
    expect(a.keywords).toContain('port')
    expect(a.keywords).toContain('3005')
    expect(a.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(a.status).toBe('active')
  })

  it('rejects invalid type / empty content', () => {
    const store = new MemoryContextStore()
    expect(() => store.add({ ...base(), type: 'nonsense' })).toThrow(/invalid entry.type/)
    expect(() => store.add({ ...base(), content: '  ' })).toThrow(/non-empty/)
  })

  it('update bumps last_verified', () => {
    const now = fixedClock('2026-01-01T00:00:00.000Z', 60_000)
    const store = new MemoryContextStore({ now })
    const a = store.add(base())
    store.update(a.id, {})
    expect(store.get(a.id).last_verified).toBe('2026-01-01T00:01:00.000Z')
  })

  it('supersede marks status and keeps provenance', () => {
    const store = new MemoryContextStore()
    const old = store.add({ type: 'decision', content: 'Kita pakai PostgreSQL untuk database' })
    const nu = store.add({ type: 'decision', content: 'Kita pakai SQLite untuk database' })
    store.supersede(old.id, { supersededBy: nu.id, reason: 'pindah' })
    const o = store.get(old.id)
    expect(o.status).toBe('superseded')
    expect(o.superseded_by).toBe(nu.id)
    expect(o.meta.superseded_reason).toBe('pindah')
    expect(store.get(nu.id).status).toBe('active')
  })

  it('list filters by type/status/topic and sorts by id', () => {
    const store = new MemoryContextStore()
    store.add(base())
    store.add({ ...base(), type: 'decision', content: 'Kita pakai SQLite untuk database' })
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

  it('snapshot returns entries + stats', () => {
    const store = new MemoryContextStore()
    store.add(base())
    store.add({ ...base(), type: 'decision', content: 'Kita pakai SQLite untuk database' })
    const snap = store.snapshot()
    expect(snap.entries).toHaveLength(2)
    expect(snap.stats.total).toBe(2)
    expect(snap.stats.by_type.fact).toBe(1)
    expect(snap.stats.by_type.decision).toBe(1)
  })

  it('clear empties the store', () => {
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

  it('clear removes the file', () => {
    const dir = tempDir()
    dirs.push(dir)
    const file = `${dir}/knowledge.jsonl`
    const store = new FileContextStore({ file })
    store.add(base())
    store.clear()
    expect(readFileOr(dir, 'knowledge.jsonl')).toBe('')
  })
})
