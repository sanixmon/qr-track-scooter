import { describe, it, expect } from 'vitest'
import { MemoryContextStore } from '../lib/store.js'
import { Compiler } from '../lib/compiler.js'
import { fixedClock } from './helpers.js'

function makeCompiler(now = fixedClock()) {
  const store = new MemoryContextStore({ now })
  const compiler = new Compiler({ store, now })
  return { store, compiler }
}

describe('Compiler — dedup & verify', () => {
  it('re-verifies identical claims instead of duplicating', async () => {
    const { store, compiler } = makeCompiler()
    const s1 = await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    expect(s1.new_decisions).toHaveLength(1)
    const s2 = await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    expect(s2.new_knowledge).toHaveLength(0)
    expect(s2.updated_knowledge).toHaveLength(1)
    expect(s2.updated_knowledge[0].action).toBe('verified')
    expect(store.list({ type: 'decision', status: 'active' })).toHaveLength(1)
  })
})

describe('Compiler — contradiction resolution', () => {
  it('supersedes PostgreSQL → SQLite decision on the same stable topic', async () => {
    const { store, compiler } = makeCompiler()
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    const s2 = await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Kita pakai SQLite untuk database' },
    ] })
    expect(s2.superseded_items).toHaveLength(1)
    expect(s2.superseded_items[0].content).toContain('PostgreSQL')
    expect(s2.new_decisions[0].content).toContain('SQLite')
    const active = store.list({ type: 'decision', status: 'active' })
    expect(active).toHaveLength(1)
    expect(active[0].content).toContain('SQLite')
    const old = store.get('decision-001')
    expect(old.status).toBe('superseded')
    expect(old.superseded_by).toBe('decision-002')
    expect(store.get('decision-002').supersedes).toBe('decision-001')
  })

  it('supersedes Express → Fastify stack change', async () => {
    const { store, compiler } = makeCompiler()
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Project menggunakan Express' },
    ] })
    const s2 = await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Project sekarang menggunakan Fastify' },
    ] })
    expect(s2.superseded_items).toHaveLength(1)
    expect(store.list({ type: 'decision', status: 'active' })[0].content).toContain('Fastify')
    expect(store.get('decision-001').status).toBe('superseded')
  })

  it('never lets a low-confidence claim supersede an active decision', async () => {
    const { store, compiler } = makeCompiler()
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    const s2 = await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Sepertinya MySQL lebih cocok untuk database' },
    ] })
    // speculation confidence 0.3 → stored as temporary, never supersedes
    expect(s2.superseded_items).toHaveLength(0)
    const speculation = store.list({ type: 'speculation' })
    expect(speculation).toHaveLength(1)
    expect(speculation[0].status).toBe('temporary')
    expect(speculation[0].confidence).toBeLessThan(0.5)
    expect(store.get('decision-001').status).toBe('active')
    expect(store.list({ type: 'decision', status: 'active' })[0].content).toContain('PostgreSQL')
  })

  it('does not supersede open-ended facts with unstable topics', async () => {
    const { store, compiler } = makeCompiler()
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Suhu ruangan penyimpanan nyaman' },
    ] })
    await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Suhu ruangan penyimpanan panas' },
    ] })
    expect(store.list({ status: 'superseded' })).toHaveLength(0)
    expect(store.list({ type: 'fact', status: 'active' }).length).toBeGreaterThanOrEqual(2)
  })
})

describe('Compiler — question & task resolution', () => {
  it('resolves an open question when a confident answer appears', async () => {
    const { store, compiler } = makeCompiler()
    const s1 = await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Apakah kita pakai PostgreSQL untuk database?' },
    ] })
    expect(s1.open_questions).toHaveLength(1)
    await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    expect(store.list({ type: 'question', status: 'active' })).toHaveLength(0)
    const q = store.list({ type: 'question' })[0]
    expect(q.status).toBe('done')
    expect(q.meta.resolved_by).toBeTruthy()
  })

  it('resolves a question answered by an earlier session', async () => {
    const { store, compiler } = makeCompiler()
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
    ] })
    const s2 = await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Apakah kita pakai PostgreSQL untuk database?' },
    ] })
    expect(s2.open_questions).toHaveLength(0)
    const q = store.list({ type: 'question' })[0]
    expect(q.status).toBe('done')
    expect(q.meta.resolved_by).toBe('decision-001')
  })

  it('marks a pending task done when completion is confirmed', async () => {
    const { store, compiler } = makeCompiler()
    const s1 = await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Tolong buat tombol export Excel' },
    ] })
    expect(s1.pending_tasks).toHaveLength(1)
    await compiler.compile({ sessionId: 'session-002', messages: [
      { role: 'user', content: 'Tombol export Excel sudah selesai' },
    ] })
    const task = store.get('task-001')
    expect(task.status).toBe('done')
    expect(store.list({ type: 'task', status: 'active' })).toHaveLength(0)
  })
})

describe('Compiler — snapshot', () => {
  it('deprecateObsolete deprecates only stale low-value entries', async () => {
    const { store, compiler } = makeCompiler(fixedClock('2026-01-01T00:00:00.000Z'))
    await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
      { role: 'user', content: 'Lampu scooter SD-01 redup' },
    ] })
    // Move the clock far into the future for the maintenance pass.
    const future = fixedClock('2026-07-01T00:00:00.000Z')
    const futureCompiler = new Compiler({ store, now: future })
    const count = futureCompiler.deprecateObsolete({ maxAgeDays: 90, minImportance: 2 })
    // lampu fact (importance 2, stale) deprecated; decision protected
    expect(count).toBe(1)
    const lampu = store.list({ type: 'fact' })[0]
    expect(lampu.status).toBe('deprecated')
    expect(store.list({ type: 'decision', status: 'active' })).toHaveLength(1)
  })

  it('returns a well-shaped snapshot with summary', async () => {
    const { compiler } = makeCompiler()
    const snap = await compiler.compile({ sessionId: 'session-001', messages: [
      { role: 'user', content: 'Kita pakai PostgreSQL untuk database' },
      { role: 'user', content: 'Tolong buat halaman monitor' },
    ] })
    expect(snap.session_id).toBe('session-001')
    expect(snap.summary).toContain('session-001')
    expect(snap.new_knowledge.length).toBeGreaterThanOrEqual(2)
    expect(snap.new_decisions[0].id).toBe('decision-001')
    expect(snap.pending_tasks).toHaveLength(1)
    for (const k of ['session_id', 'summary', 'new_knowledge', 'updated_knowledge', 'new_decisions', 'superseded_items', 'open_questions', 'pending_tasks']) {
      expect(snap).toHaveProperty(k)
    }
  })
})
