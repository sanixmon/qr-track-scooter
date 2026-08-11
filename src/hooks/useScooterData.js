import { useState, useEffect, useCallback, useRef } from 'react'
import { getScooters, getActivityLog, getMaintenanceRecords } from '../storage'

const POLL_INTERVAL_MS = 30_000 // silent refresh every 30s

export function useScooterData() {
  const [scooters,    setScooters]    = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [maintenanceRecords, setMaintenanceRecords] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(() => {
    const load = async () => {
      try {
        const [s, l, m] = await Promise.all([getScooters(), getActivityLog(), getMaintenanceRecords()])
        if (mountedRef.current) {
          setScooters(s)
          setActivityLog(l)
          setMaintenanceRecords(m)
          setError(null)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        if (mountedRef.current) {
          setError(err.message || 'Gagal membaca data.')
        }
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    // Initial load — same code path as refresh(), no duplicated logic.
    refresh()

    // Silent background polling keeps the dashboard "real-time" without
    // requiring a manual refresh after every action elsewhere.
    const interval = setInterval(refresh, POLL_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      clearInterval(interval)
    }
  }, [refresh])

  return { scooters, activityLog, maintenanceRecords, loading, error, refresh }
}
