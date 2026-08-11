import { describe, it, expect } from 'vitest'
import { searchEntries, rankRelevant, scoreEntry } from '../retrieval/relevance.js'

const NOW = new Date('2026-02-01T00:00:00.000Z').getTime()

function entry(overrides) {
  return {
    id: 'fact-000',
    type: 'fact',
    content: '',
    topic: '',
    keywords: [],
    status: 'active',
    confidence: 0.6,
    importance: 2,
    created_at: new Date(NOW - 86400000).toISOString(),
    last_verified: new Date(NOW - 86400000).toISOString(),
    ...overrides,
  }
}

describe('scoreEntry', () => {
  it('scores keyword overlap with importance & confidence', () => {
    const low = entry({ content: 'ban scooter', keywords: ['ban'] })
    const high = entry({ content: 'postgresql', keywords: ['postgresql'], importance: 5, confidence: 0.95 })
    const sLow = scoreEntry(low, ['ban'], { now: NOW })
    const sHigh = scoreEntry(high, ['postgresql'], { now: NOW })
    expect(sHigh).toBeGreaterThan(sLow)
  })

  it('excludes superseded/deprecated unless includeObsolete', () => {
    const active = entry({ content: 'pakai postgresql', keywords: ['postgresql'] })
    const old = entry({ content: 'pakai postgresql', keywords: ['postgresql'], status: 'superseded' })
    expect(scoreEntry(old, ['postgresql'], { now: NOW })).toBe(0)
    expect(scoreEntry(old, ['postgresql'], { now: NOW, includeObsolete: true })).toBeGreaterThan(0)
    expect(scoreEntry(active, ['postgresql'], { now: NOW })).toBeGreaterThan(0)
  })

  it('favors recently verified entries', () => {
    const fresh = entry({ content: 'api port 3005', keywords: ['api', 'port'] })
    const stale = entry({
      content: 'api port 3005', keywords: ['api', 'port'],
      last_verified: new Date(NOW - 90 * 86400000).toISOString(),
      created_at: new Date(NOW - 90 * 86400000).toISOString(),
    })
    expect(scoreEntry(fresh, ['api'], { now: NOW })).toBeGreaterThan(scoreEntry(stale, ['api'], { now: NOW }))
  })
})

describe('searchEntries / rankRelevant', () => {
  const entries = [
    entry({ id: 'decision-001', type: 'decision', content: 'Kita pakai PostgreSQL untuk database', keywords: ['postgresql', 'database'], importance: 4, confidence: 0.9 }),
    entry({ id: 'decision-002', type: 'decision', content: 'Kita pakai SQLite untuk database', keywords: ['sqlite', 'database'], importance: 4, confidence: 0.9, status: 'superseded' }),
    entry({ id: 'fact-003', content: 'Lampu scooter SD-01 redup', keywords: ['lampu', 'scooter'] }),
  ]

  it('ranks relevant over irrelevant and active over superseded', () => {
    const hits = searchEntries(entries, 'postgresql database', { now: NOW })
    expect(hits.length).toBe(1)
    expect(hits[0].entry.id).toBe('decision-001')
  })

  it('getRelevant returns top-k with scores', () => {
    const hits = rankRelevant(entries, 'database', { now: NOW, k: 2 })
    expect(hits.length).toBe(1)
    expect(hits[0].score).toBeGreaterThan(0)
    expect(hits[0].entry.id).toBe('decision-001')
  })

  it('empty query returns nothing', () => {
    expect(searchEntries(entries, '  ', { now: NOW })).toHaveLength(0)
  })

  it('budget caps cumulative content tokens (L3 enforcement), highest-ranked survive', () => {
    const pool = [
      entry({ id: 'fact-001', content: 'postgresql dipakai untuk database utama', keywords: ['postgresql', 'database'], importance: 5 }),
      entry({ id: 'fact-002', content: 'postgresql versi lama didokumentasikan', keywords: ['postgresql'], importance: 1 }),
      entry({ id: 'fact-003', content: 'postgresql tuning lanjutan sangat panjang sekali', keywords: ['postgresql'], importance: 4 }),
    ]
    const hits = rankRelevant(pool, 'postgresql', { now: NOW, budget: 20, k: 10 })
    expect(hits.length).toBeGreaterThan(0)
    const usedTokens = hits.reduce((sum, h) => sum + Math.ceil(h.entry.content.length / 4), 0)
    expect(usedTokens).toBeLessThanOrEqual(24)
    // Paling relevan (importance 5) pasti lolos
    expect(hits[0].entry.id).toBe('fact-001')
  })

  it('does not crash when keywords are missing (hand-edited JSONL)', () => {
    const bare = [{ id: 'fact-001', type: 'fact', content: 'postgresql dipakai', status: 'active', importance: 3, confidence: 0.6 }]
    expect(() => searchEntries(bare, 'postgresql', { now: NOW })).not.toThrow()
    const hits = searchEntries(bare, 'postgresql', { now: NOW })
    expect(hits[0].entry.id).toBe('fact-001')
  })
})
