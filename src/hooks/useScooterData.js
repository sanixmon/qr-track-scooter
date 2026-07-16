import { useState, useEffect, useCallback } from 'react'
import { getScooters, getActivityLog } from '../storage'

export function useScooterData() {
  const [scooters,    setScooters]    = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const s = await getScooters()
      const l = await getActivityLog()
      setScooters(s)
      setActivityLog(l)
    } catch (err) {
      console.error('Error reading local storage:', err)
      setError(err.message || 'Gagal membaca data lokal.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()

    // Listen for localStorage changes (same tab via custom events, other tabs via 'storage' event)
    const handleChange = () => { refresh() }

    window.addEventListener('trackbike:bikes-changed', handleChange)
    window.addEventListener('trackbike:log-changed',   handleChange)
    window.addEventListener('storage',                 handleChange)

    return () => {
      window.removeEventListener('trackbike:bikes-changed', handleChange)
      window.removeEventListener('trackbike:log-changed',   handleChange)
      window.removeEventListener('storage',                 handleChange)
    }
  }, [refresh])

  return { scooters, activityLog, loading, error, refresh }
}
