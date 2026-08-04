import { useState, useEffect, useCallback, useRef } from 'react'
import { getScooters, getActivityLog } from '../storage'

export function useScooterData() {
  const [scooters,    setScooters]    = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const mountedRef = useRef(true)

  const refresh = useCallback(() => {
    const load = async () => {
      try {
        const [s, l] = await Promise.all([getScooters(), getActivityLog()])
        if (mountedRef.current) {
          setScooters(s)
          setActivityLog(l)
          setError(null)
        }
      } catch (err) {
        console.error('Error fetching data:', err)
        if (mountedRef.current) {
          setError(err.message || 'Gagal membaca data.')
        }
      }
    }
    load()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    getScooters()
      .then(s => { if (mountedRef.current) setScooters(s) })
      .catch(err => { if (mountedRef.current) setError(err.message || 'Gagal membaca data.') })
    getActivityLog()
      .then(l => { if (mountedRef.current) setActivityLog(l) })
      .catch(() => {})
      .finally(() => { if (mountedRef.current) setLoading(false) })
    return () => { mountedRef.current = false }
  }, [])

  return { scooters, activityLog, loading, error, refresh }
}
