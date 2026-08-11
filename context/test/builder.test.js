import fs from 'node:fs'
import { describe, it, expect } from 'vitest'
import { MemoryContextStore } from '../store/store.js'
import { ContextBuilder, estimateTokens, LAYER_NAMES } from '../builder/builder.js'
import { LAYER_BUDGETS, resolveLayerBudgets } from '../config.js'
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

describe('config budgets', () => {
  it('exposes explicit per-layer defaults from a single source', () => {
    expect(LAYER_BUDGETS.l0).toBe(300)
    expect(LAYER_BUDGETS.l1).toBe(800)
    expect(LAYER_BUDGETS.l2).toBe(800)
    expect(LAYER_BUDGETS.l3).toBe(1500)
    expect(LAYER_BUDGETS.l4).toBe(0)
  })

  it('resolves overrides and env variables', () => {
    expect(resolveLayerBudgets({ l3: 500 }, {})).toMatchObject({ l3: 500, l0: 300 })
    expect(resolveLayerBudgets({}, { CONTEXT_BUDGET_L0: '100' })).toMatchObject({ l0: 100 })
    expect(resolveLayerBudgets({ l0: 50 }, { CONTEXT_BUDGET_L0: '100' })).toMatchObject({ l0: 50 }) // override menang
  })
})

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

  it('enforces per-layer token budgets (L3 capped by ranking order)', () => {
    const store = seedStore()
    store.add({ type: 'fact', content: 'postgresql tuning lanjutan yang sangat panjang sekali', topic: 'database', importance: 4, confidence: 0.7 })
    const builder = new ContextBuilder({ store, budgets: { l3: 40 } })
    const result = builder.build('postgresql', { maxTokens: 5000 })
    expect(result.layerTokens.l3).toBeLessThanOrEqual(60)
    expect(result.text).toContain('postgresql')
  })

  it('respects the total token budget and reports omissions', () => {
    const store = seedStore()
    const builder = new ContextBuilder({ store })
    const tiny = builder.build('database', { maxTokens: 40 })
    expect(tiny.tokens).toBeLessThanOrEqual(60)
    expect(tiny.omitted.length).toBeGreaterThan(0)
  })

  it('redacts sensitive items by default and includes them with includeSensitive', () => {
    const store = seedStore()
    store.add({ type: 'fact', content: 'API key produksi ada di .env', importance: 4, confidence: 0.9, sensitive: true })
    const builder = new ContextBuilder({ store })
    const redacted = builder.build('', { maxTokens: 5000 })
    expect(redacted.text).not.toContain('.env')

    const full = builder.build('', { maxTokens: 5000, includeSensitive: true })
    expect(full.text).toContain('.env')
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

  it('renders L4 historical sessions from compiled summaries (on-demand)', () => {
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

  it('LAYER_NAMES exposes the layer ladder', () => {
    expect(LAYER_NAMES).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5'])
  })
})
