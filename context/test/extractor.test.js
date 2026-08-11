import { describe, it, expect } from 'vitest'
import { classifyUtterance, extractCandidates, splitUtterances } from '../lib/extractor.js'

describe('classifyUtterance', () => {
  it('classifies decisions', () => {
    const r = classifyUtterance('Kita pakai PostgreSQL untuk database', { role: 'user' })
    expect(r.type).toBe('decision')
    expect(r.confidence).toBeGreaterThanOrEqual(0.85)
    expect(r.importance).toBe(4)
  })

  it('classifies negative constraints before decision markers', () => {
    expect(classifyUtterance('Jangan pakai MySQL', { role: 'user' }).type).toBe('constraint')
    expect(classifyUtterance('Tidak boleh pakai X', { role: 'user' }).type).toBe('constraint')
  })

  it('classifies soft constraints', () => {
    const r = classifyUtterance('Harus mendukung offline', { role: 'user' })
    expect(r.type).toBe('constraint')
  })

  it('records user questions only', () => {
    expect(classifyUtterance('Apakah API sudah jalan?', { role: 'user' }).type).toBe('question')
    expect(classifyUtterance('Sudahkah kamu cek endpoint-nya?', { role: 'assistant' }).type).not.toBe('question')
  })

  it('classifies speculation with low confidence', () => {
    const r = classifyUtterance('Mungkin perlu rate limit nanti', { role: 'user' })
    expect(r.type).toBe('speculation')
    expect(r.confidence).toBeLessThan(0.5)
  })

  it('classifies terminology definitions', () => {
    expect(classifyUtterance('Istilah onboarding artinya proses orientasi', { role: 'user' }).type).toBe('term')
  })

  it('classifies goals and assumptions', () => {
    expect(classifyUtterance('Tujuannya memangkas klik operator', { role: 'user' }).type).toBe('goal')
    expect(classifyUtterance('Dengan asumsi semua unit online', { role: 'user' }).type).toBe('assumption')
  })

  it('classifies tasks from user directives only', () => {
    expect(classifyUtterance('Tolong buat tombol export Excel', { role: 'user' }).type).toBe('task')
    expect(classifyUtterance('Tolong buat tombol export Excel', { role: 'assistant' }).type).not.toBe('task')
  })

  it('classifies current state and lessons', () => {
    expect(classifyUtterance('Server sekarang berjalan normal', { role: 'user' }).type).toBe('state')
    expect(classifyUtterance('Ternyata FK cascade menyelesaikan masalah', { role: 'user' }).type).toBe('lesson')
  })

  it('falls back to fact for declarative statements', () => {
    const r = classifyUtterance('Lampu scooter SD-01 redup', { role: 'user' })
    expect(r.type).toBe('fact')
    expect(r.confidence).toBe(0.6)
  })

  it('returns null for fragments', () => {
    expect(classifyUtterance('ok', { role: 'user' })).toBeNull()
  })
})

describe('splitUtterances', () => {
  it('splits on sentence boundaries and newlines', () => {
    const parts = splitUtterances('Satu. Dua!\nTiga? Empat…')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('Satu.')
    expect(parts[3]).toBe('Empat…')
  })
})

describe('extractCandidates', () => {
  it('extracts typed candidates with topic/keywords/source', () => {
    const now = () => new Date('2026-01-01T00:00:00.000Z').getTime()
    const candidates = extractCandidates(
      [
        { role: 'user', content: 'Kita pakai PostgreSQL untuk database. Tolong buat halaman monitor.' },
        { role: 'assistant', content: 'Siap, halaman monitor sudah dibuat.' },
      ],
      { sourceSession: 'session-001', now },
    )
    const types = candidates.map(c => c.type)
    expect(types).toContain('decision')
    expect(types).toContain('task')
    const decision = candidates.find(c => c.type === 'decision')
    expect(decision.topic).toBe('database')
    expect(decision.source_session).toBe('session-001')
    expect(decision.keywords).toContain('postgresql')
    expect(decision.created_at).toBe('2026-01-01T00:00:00.000Z')
  })
})
