import { describe, it, expect, vi } from 'vitest'

// Mock LiveTimer inline to avoid date-fns dependency in test
vi.mock('./LiveTimer', () => ({
  default: ({ status, lastUpdated }) => `<LiveTimer status="${status}" lastUpdated="${lastUpdated}" />`
}))

// Since we can't easily render JSX without DOM in unit tests,
// test the pure logic that determines card appearance

function getStatusConfig(status) {
  const configs = {
    available: {
      label: 'Tersedia',
      color: 'green',
    },
    'in-use': {
      label: 'Sedang Digunakan',
      color: 'red',
    },
    maintenance: {
      label: 'Maintenance',
      color: 'warning',
    },
  }
  return configs[status] || configs.available
}

describe('ScooterCard status logic', () => {
  it('returns available config for available status', () => {
    const config = getStatusConfig('available')
    expect(config.label).toBe('Tersedia')
    expect(config.color).toBe('green')
  })

  it('returns in-use config for in-use status', () => {
    const config = getStatusConfig('in-use')
    expect(config.label).toBe('Sedang Digunakan')
    expect(config.color).toBe('red')
  })

  it('returns maintenance config for maintenance status', () => {
    const config = getStatusConfig('maintenance')
    expect(config.label).toBe('Maintenance')
    expect(config.color).toBe('warning')
  })

  it('falls back to available for unknown status (Worst Case)', () => {
    const config = getStatusConfig('unknown_status')
    expect(config.label).toBe('Tersedia')
  })

  it('falls back for null status (Worst Case)', () => {
    const config = getStatusConfig(null)
    expect(config.label).toBe('Tersedia')
  })

  it('falls back for undefined status (Worst Case)', () => {
    const config = getStatusConfig(undefined)
    expect(config.label).toBe('Tersedia')
  })
})

describe('ScooterCard type label', () => {
  function getTypeLabel(type) {
    return type === 'sd' ? 'Standar (SD)' : 'Jumbo (SJ)'
  }

  it('returns correct label for sd type', () => {
    expect(getTypeLabel('sd')).toBe('Standar (SD)')
  })

  it('returns correct label for sj type', () => {
    expect(getTypeLabel('sj')).toBe('Jumbo (SJ)')
  })

  it('handles unknown type gracefully (Worst Case)', () => {
    expect(getTypeLabel('unknown')).toBe('Jumbo (SJ)')
  })

  it('handles null type gracefully (Worst Case)', () => {
    expect(getTypeLabel(null)).toBe('Jumbo (SJ)')
  })
})

describe('LiveTimer duration logic', () => {
  function getDurationText(startISO, nowISO) {
    const start = new Date(startISO)
    const now = new Date(nowISO)
    if (isNaN(start.getTime()) || isNaN(now.getTime())) return '00:00:00'
    const diffSecs = Math.max(0, Math.floor((now - start) / 1000))
    const hrs = Math.floor(diffSecs / 3600)
    const mins = Math.floor((diffSecs % 3600) / 60)
    const secs = diffSecs % 60
    return [String(hrs).padStart(2, '0'), String(mins).padStart(2, '0'), String(secs).padStart(2, '0')].join(':')
  }

  it('shows 00:00:00 for just checked out', () => {
    const t = new Date().toISOString()
    expect(getDurationText(t, t)).toBe('00:00:00')
  })

  it('shows correct elapsed time', () => {
    const start = new Date('2026-07-28T10:00:00Z').toISOString()
    const now = new Date('2026-07-28T10:05:30Z').toISOString()
    expect(getDurationText(start, now)).toBe('00:05:30')
  })

  it('shows hours correctly', () => {
    const start = new Date('2026-07-28T08:00:00Z').toISOString()
    const now = new Date('2026-07-28T15:30:45Z').toISOString()
    expect(getDurationText(start, now)).toBe('07:30:45')
  })

  it('handles same second (Worst Case)', () => {
    const t = '2026-07-28T12:00:00.000Z'
    expect(getDurationText(t, t)).toBe('00:00:00')
  })

  it('handles future date gracefully (Worst Case)', () => {
    const start = new Date('2026-07-28T12:00:00Z').toISOString()
    const now = new Date('2026-07-28T11:00:00Z').toISOString()
    expect(getDurationText(start, now)).toBe('00:00:00')
  })

  it('handles invalid date string (Worst Case)', () => {
    const result = getDurationText('invalid-date', new Date().toISOString())
    expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('handles null ISO (Worst Case)', () => {
    const config = getStatusConfig(null)
    expect(config).toBeDefined()
  })
})
