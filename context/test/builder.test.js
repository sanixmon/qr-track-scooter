import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { MemoryContextStore } from '../lib/store.js'
import { ContextBuilder, estimateTokens } from '../lib/builder.js'
import { fixedClock, tempDir, rmDir } from './helpers.js'

function seedStore() {
  const now = fixedClock()
  const store = new MemoryContextStore({ now })
  store.add({ type: 'goal', content: 'Memangkas klik operator', importance: 4, confidence: 0.75 })
  store.add({ type: 'project', content: 'Project TrackScooter: fleet monitoring', importance: 4, confidence: 0.9 })
  store.add({ type: 'decision', content: 'Kita pakai PostgreSQL untuk database', topic: 'database', importance: 4, confidence: 0.9 })
  store.add({ type: 'decision', content: 'Kita pakai SQLite untuk database', topic: 'database', importance: 4, confidence: 0.9, status: 'superseded', superseded_by: 'decision-001' })
  store.add({ type: 'constraint', content: 'Harus jalan tanpa koneksi internet', importance: 4, confidence: 0.8 })
  store.add({ type: 'fact', content: 'API berjalan di port 3005', importance: 2, confidence: 0.6 })
  return store
}

describe('ContextBuilder', () => {
  it('assembles L0–L3 layers in priority order', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const result = builder.build('database choice', { maxTokens: 5000 })
    expect(result.included).toEqual(['l0', 'l1', 'l2', 'l3'])
    expect(result.text).toContain('L0 — Core Context')
    expect(result.text).toContain('L1 — Project / Domain')
    expect(result.text).toContain('L2 — Active Decisions & Constraints')
    expect(result.text).toContain('PostgreSQL')
    expect(result.text).toContain('Superseded trail')
  })

  it('does not include superseded decisions as active claims', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const result = builder.build('', { maxTokens: 5000 })
    const l2 = result.text.split('L2 — Active Decisions')[1] ?? ''
    expect(l2).toContain('PostgreSQL')
    expect(l2).not.toMatch(/^- SQLite/)
  })

  it('respects the token budget and reports omissions', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const tiny = builder.build('database', { maxTokens: 40 })
    expect(tiny.tokens).toBeLessThanOrEqual(60) // allows the request header + first section
    expect(tiny.omitted.length).toBeGreaterThan(0)

    const result = builder.build('database', { maxTokens: 10 })
    expect(result.tokens).toBeGreaterThanOrEqual(1)
  })

  it('falls back to raw conversation (L5) when L3 has no relevant knowledge', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const result = builder.build('warna cat pagar', {
      layers: ['l3', 'l5'],
      maxTokens: 5000,
      rawMessages: [{ role: 'user', content: 'Pagar dicat hijau' }],
    })
    expect(result.included).toContain('l5')
    expect(result.text).toContain('Pagar dicat hijau')
  })

  it('does not fall back to L5 when L3 already has relevant knowledge', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const result = builder.build('postgresql database', {
      layers: ['l3', 'l5'],
      maxTokens: 5000,
      rawMessages: [{ role: 'user', content: 'random chat' }],
    })
    expect(result.included).toContain('l3')
    expect(result.included).not.toContain('l5')
  })

  it('renders L4 historical sessions from compiled summaries', () => {
    const dir = tempDir()
    const store = seedStore()
    const builder = new ContextBuilder({ store, sessionsDir: `${dir}/sessions` })
    fs.mkdirSync(`${dir}/sessions`, { recursive: true })
    fs.writeFileSync(`${dir}/sessions/session-001.md`, '# Session\nsummary: Session session-001: 1 new.\n', 'utf8')
    const result = builder.build('', { layers: ['l4'], maxTokens: 5000 })
    expect(result.text).toContain('session-001')
    rmDir(dir)
  })

  it('estimateTokens is a simple deterministic estimate', () => {
    expect(estimateTokens('1234')).toBe(1)
    expect(estimateTokens('x'.repeat(10))).toBe(3)
  })
})
