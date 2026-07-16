import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getScooters,
  addScooter,
  deleteScooter,
  updateScooter,
  getActivityLog,
  toggleScooterStatus
} from './storage'

const BIKES_KEY = 'trackbike:bikes'
const LOG_KEY = 'trackbike:activity_log'

describe('Storage Core Logic (Unit & Worst Case Tests)', () => {
  let mockStorage = {}

  beforeEach(() => {
    mockStorage = {}
    
    // Mock localStorage for node environment
    if (typeof global.localStorage === 'undefined') {
      global.localStorage = {
        getItem: vi.fn((key) => mockStorage[key] || null),
        setItem: vi.fn((key, val) => { mockStorage[key] = val.toString() }),
        removeItem: vi.fn((key) => { delete mockStorage[key] }),
        clear: vi.fn(() => { mockStorage = {} })
      }
    } else {
      localStorage.clear()
    }
    
    // Mock window.dispatchEvent if undefined
    if (typeof global.window === 'undefined') {
      global.window = { dispatchEvent: vi.fn() }
    } else if (!global.window.dispatchEvent) {
      global.window.dispatchEvent = vi.fn()
    }
    
    if (typeof global.CustomEvent === 'undefined') {
      global.CustomEvent = class CustomEvent {}
    }

    vi.restoreAllMocks()
  })

  it('1. Adds a scooter correctly', async () => {
    const s = await addScooter({ id: 'SD-100', type: 'sd' })
    expect(s.id).toBe('SD-100')
    expect(s.status).toBe('available')
    
    const bikes = await getScooters()
    expect(bikes.length).toBe(1)
    expect(bikes[0].id).toBe('SD-100')
  })

  it('2. Prevents duplicate IDs (Worst Case)', async () => {
    await addScooter({ id: 'SD-100', type: 'sd' })
    
    // Attempting to add the exact same ID
    await expect(addScooter({ id: 'sd-100', type: 'sd' }))
      .rejects.toThrow('ID "SD-100" sudah terdaftar di sistem.')
  })

  it('3. Auto-generates correct ID sequence', async () => {
    await addScooter({ id: 'SD-005', type: 'sd' })
    await addScooter({ id: 'SD-099', type: 'sd' })
    
    // Should generate SD-100 because 99 is the max numeric
    const s = await addScooter({ type: 'sd' })
    expect(s.id).toBe('SD-100')
  })

  it('4. Handles corrupted LocalStorage data gracefully (Worst Case)', async () => {
    // Manually inject invalid JSON
    localStorage.setItem(BIKES_KEY, '{ invalid_json')
    localStorage.setItem(LOG_KEY, 'not array')
    
    // It should catch parsing errors and return empty arrays
    const bikes = await getScooters()
    const logs = await getActivityLog()
    
    expect(bikes).toEqual([])
    expect(logs).toEqual([])
  })

  it('5. Rejects toggle for non-existent scooter (Worst Case)', async () => {
    const result = await toggleScooterStatus('GHOST-1')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/tidak ditemukan/i)
  })

  it('6. Blocks checkout if scooter is in maintenance (Worst Case / Safety)', async () => {
    await addScooter({ id: 'SD-001', type: 'sd' })
    await updateScooter('SD-001', { status: 'maintenance', maintenanceNote: 'Ban Bocor' })
    
    // Try to toggle without force flag
    const result = await toggleScooterStatus('SD-001')
    expect(result.success).toBe(false)
    expect(result.requiresConfirmation).toBe(true)
    expect(result.message).toContain('Ban Bocor')
  })

  it('7. Allows override checkout if forceMaintenance is true', async () => {
    await addScooter({ id: 'SD-001', type: 'sd' })
    await updateScooter('SD-001', { status: 'maintenance' })
    
    // Toggle with force flag
    const result = await toggleScooterStatus('SD-001', true)
    expect(result.success).toBe(true)
    expect(result.action).toBe('checkout')
    
    const bikes = await getScooters()
    expect(bikes[0].status).toBe('in-use')
  })

  it('8. Throws quota exceeded correctly if LocalStorage is full (Worst Case)', async () => {
    await addScooter({ id: 'SD-001', type: 'sd' })

    // Mock setItem to throw QuotaExceededError
    const originalSetItem = global.localStorage.setItem
    global.localStorage.setItem = vi.fn(() => {
      const err = new Error('QuotaExceededError')
      err.name = 'QuotaExceededError'
      throw err
    })

    // Update should fail due to storage being full
    await expect(updateScooter('SD-001', { status: 'in-use' })).rejects.toThrow('QuotaExceededError')
    global.localStorage.setItem = originalSetItem
  })

  it('9. Logs activity correctly upon status toggle', async () => {
    await addScooter({ id: 'SJ-001', type: 'sj' })
    
    // Checkout
    await toggleScooterStatus('SJ-001')
    let log = await getActivityLog()
    expect(log.length).toBe(1)
    expect(log[0].action).toBe('checkout')
    expect(log[0].scooterId).toBe('SJ-001')

    // Return
    await toggleScooterStatus('SJ-001')
    log = await getActivityLog()
    expect(log.length).toBe(2)
    expect(log[0].action).toBe('return') // Sorted newest first
  })
})
