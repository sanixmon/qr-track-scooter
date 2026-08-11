import { describe, it, expect } from 'vitest'
import { isBadField, isWarnField, fieldTone, buildIssueList } from './deviceCondition'
import { STATUS_LABELS, STATUS_ORDER, DEVICE_FIELDS, TYPE_LABELS, DEVICE_LABELS } from '../constants'

describe('isBadField', () => {
  it('marks non-normal monitor as bad (any error code)', () => {
    for (const v of ['e2', 'e4', 'e16', 'e6', 'lain']) {
      expect(isBadField('monitor', v)).toBe(true)
    }
  })

  it('marks normal monitor as not bad', () => {
    expect(isBadField('monitor', 'normal')).toBe(false)
  })

  it('marks bad values for each field', () => {
    expect(isBadField('setelan', 'tidak')).toBe(true)
    expect(isBadField('lampu', 'tidak')).toBe(true)
    expect(isBadField('baterai', 'drop')).toBe(true)
    expect(isBadField('rem', 'rusak')).toBe(true)
    expect(isBadField('ban', 'botak')).toBe(true)
  })

  it('returns false for missing value (Worst Case)', () => {
    expect(isBadField('baterai', null)).toBe(false)
    expect(isBadField('baterai', undefined)).toBe(false)
    expect(isBadField('baterai', '')).toBe(false)
  })

  it('returns false for unknown field (Worst Case)', () => {
    expect(isBadField('sprocket', 'rusak')).toBe(false)
  })
})

describe('isWarnField', () => {
  it('marks thin tire as warning', () => {
    expect(isWarnField('ban', 'tipis')).toBe(true)
  })

  it('does not warn for other fields', () => {
    expect(isWarnField('ban', 'botak')).toBe(false)
    expect(isWarnField('ban', 'aman')).toBe(false)
    expect(isWarnField('baterai', 'drop')).toBe(false)
  })

  it('handles missing value (Worst Case)', () => {
    expect(isWarnField('ban', null)).toBe(false)
  })
})

describe('fieldTone', () => {
  it('returns none when condition never saved', () => {
    expect(fieldTone('baterai', null, false)).toBe('none')
  })

  it('returns bad for broken component', () => {
    expect(fieldTone('baterai', 'drop', true)).toBe('bad')
    expect(fieldTone('monitor', 'e4', true)).toBe('bad')
  })

  it('returns warn for thin tire', () => {
    expect(fieldTone('ban', 'tipis', true)).toBe('warn')
  })

  it('returns good for healthy values', () => {
    expect(fieldTone('baterai', 'normal', true)).toBe('good')
    expect(fieldTone('ban', 'aman', true)).toBe('good')
  })
})

describe('buildIssueList', () => {
  it('collects all issues with correct tone', () => {
    const issues = buildIssueList({
      baterai: 'drop', lampu: 'tidak', monitor: 'e4', rem: 'rusak', ban: 'botak', setelan: 'tidak'
    })
    expect(issues).toContainEqual({ text: 'Baterai drop', tone: 'bad' })
    expect(issues).toContainEqual({ text: 'Lampu tidak nyala', tone: 'bad' })
    expect(issues).toContainEqual({ text: 'Error E4', tone: 'bad' })
    expect(issues).toContainEqual({ text: 'Rem rusak', tone: 'bad' })
    expect(issues).toContainEqual({ text: 'Ban botak', tone: 'bad' })
    expect(issues).toContainEqual({ text: 'Spakbor tidak ada', tone: 'bad' })
  })

  it('marks thin tire as warn', () => {
    const issues = buildIssueList({ ban: 'tipis' })
    expect(issues).toEqual([{ text: 'Ban tipis', tone: 'warn' }])
  })

  it('uses monitor_detail for lain monitor', () => {
    const issues = buildIssueList({ monitor: 'lain', monitor_detail: 'Spakbor retak' })
    expect(issues).toContainEqual({ text: 'Spakbor retak', tone: 'bad' })
  })

  it('returns empty for healthy unit', () => {
    expect(buildIssueList({
      baterai: 'normal', lampu: 'nyala', monitor: 'normal', rem: 'normal', ban: 'aman', setelan: 'ada'
    })).toEqual([])
  })

  it('returns empty for null condition (Worst Case)', () => {
    expect(buildIssueList(null)).toEqual([])
    expect(buildIssueList(undefined)).toEqual([])
  })
})

describe('shared constants', () => {
  it('covers all 4 statuses with labels and order', () => {
    expect(Object.keys(STATUS_LABELS).sort()).toEqual(['available', 'in-use', 'maintenance', 'rusak'])
    expect(STATUS_ORDER.available).toBeLessThan(STATUS_ORDER['in-use'])
    expect(STATUS_ORDER['in-use']).toBeLessThan(STATUS_ORDER.rusak)
    expect(STATUS_ORDER.rusak).toBeLessThan(STATUS_ORDER.maintenance)
  })

  it('device fields cover all 6 checklist items', () => {
    expect(DEVICE_FIELDS.map(f => f.key)).toEqual(['setelan', 'lampu', 'baterai', 'monitor', 'rem', 'ban'])
  })

  it('device label maps match field options', () => {
    for (const f of DEVICE_FIELDS) {
      for (const [val] of f.options) {
        expect(DEVICE_LABELS[f.key][val]).toBeDefined()
      }
    }
  })

  it('type labels cover both types', () => {
    expect(TYPE_LABELS.sd).toBe('Standar (SD)')
    expect(TYPE_LABELS.sj).toBe('Jumbo (SJ)')
  })
})
