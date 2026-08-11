import { describe, it, expect } from 'vitest'
import { extractTopic } from '../compiler/topics.js'

describe('extractTopic', () => {
  it('maps database choices to stable topic', () => {
    expect(extractTopic('Kita pakai PostgreSQL untuk database')).toEqual({ topic: 'database', stable: true })
    expect(extractTopic('Use SQLite')).toEqual({ topic: 'database', stable: true })
  })

  it('maps framework choices to stable topic (contradiction-ready)', () => {
    expect(extractTopic('Project menggunakan Express')).toEqual({ topic: 'framework', stable: true })
    expect(extractTopic('Project sekarang menggunakan Fastify')).toEqual({ topic: 'framework', stable: true })
  })

  it('maps frontend / deployment / api domains', () => {
    expect(extractTopic('Ganti ke React')).toEqual({ topic: 'frontend', stable: true })
    expect(extractTopic('Deploy pakai nginx')).toEqual({ topic: 'deployment', stable: true })
    expect(extractTopic('Endpoint /api/scooters')).toEqual({ topic: 'api', stable: true })
  })

  it('uses the purpose pattern when no category matches', () => {
    expect(extractTopic('Pakai warna biru untuk tombol utama')).toEqual({ topic: 'tombol-utama', stable: true })
  })

  it('falls back to unstable normalized content for open-ended facts', () => {
    const t = extractTopic('Suhu ruangan penyimpanan cukup nyaman')
    expect(t.stable).toBe(false)
    expect(t.topic).toBeTruthy()
  })

  it('handles empty / noisy input gracefully', () => {
    expect(extractTopic('')).toEqual({ topic: 'general', stable: false })
  })
})
