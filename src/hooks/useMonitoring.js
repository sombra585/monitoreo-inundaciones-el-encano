import { useCallback, useEffect, useState } from 'react'
import { supabaseConfigured } from '../services/supabase'
import {
  fetchAlerts,
  fetchAllSystemSettings,
  fetchDevices,
  fetchLatestMeasurement,
  fetchThresholdConfig,
  subscribeToMonitoring,
} from '../services/dataService'

function settledValue(result) {
  if (result.status === 'rejected') return { data: null, error: result.reason }
  return result.value
}

function errorMessage(error) {
  if (error instanceof Error) return error.message
  return error?.message || 'Error desconocido al consultar Supabase.'
}

function receivedServerResponse(error) {
  return Number(error?.status) >= 100 ||
    error?.code === '42501' ||
    (typeof error?.code === 'string' && error.code.startsWith('PGRST'))
}

export function useMonitoring() {
  const [latest, setLatest] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [devices, setDevices] = useState([])
  const [thresholdConfig, setThresholdConfig] = useState(null)
  const [thresholdError, setThresholdError] = useState(null)
  const [staleAfterSeconds, setStaleAfterSeconds] = useState(180)
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState({})
  const [connectionStatus, setConnectionStatus] = useState(
    supabaseConfigured ? 'checking' : 'unconfigured',
  )
  const [lastUpdated, setLastUpdated] = useState(null)
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [now, setNow] = useState(() => new Date())

  const refresh = useCallback(async () => {
    setLoading(true)

    if (!supabaseConfigured) {
      setLatest(null)
      setAlerts([])
      setDevices([])
      setThresholdConfig(null)
      setThresholdError(null)
      setErrors({})
      setConnectionStatus('unconfigured')
      setLastUpdated(null)
      setLoading(false)
      return
    }

    try {
      const results = await Promise.allSettled([
        fetchLatestMeasurement(),
        fetchAlerts(),
        fetchDevices(),
        fetchAllSystemSettings(),
      ])
      const [latestResult, alertsResult, devicesResult, settingsResult] = results.map(settledValue)
      const nextErrors = {}
      const successfulQueries = results.filter((result, index) =>
        result.status === 'fulfilled' && ![
          latestResult,
          alertsResult,
          devicesResult,
          settingsResult,
        ][index].error,
      ).length
      const requestErrors = []

      if (latestResult.error) {
        nextErrors.measurements = errorMessage(latestResult.error)
        requestErrors.push(latestResult.error)
      } else {
        setLatest(latestResult.data)
      }

      if (alertsResult.error) {
        nextErrors.alerts = errorMessage(alertsResult.error)
        requestErrors.push(alertsResult.error)
      } else {
        setAlerts(alertsResult.data || [])
      }

      if (devicesResult.error) {
        nextErrors.devices = errorMessage(devicesResult.error)
        requestErrors.push(devicesResult.error)
      } else {
        setDevices(devicesResult.data || [])
      }

      if (settingsResult.error) {
        nextErrors.settings = errorMessage(settingsResult.error)
        requestErrors.push(settingsResult.error)
      } else if (settingsResult.data?.stale_after_seconds) {
        setStaleAfterSeconds(settingsResult.data.stale_after_seconds)
      }

      if (!latestResult.error && latestResult.data) {
        const thresholdsResult = await Promise.allSettled([
          fetchThresholdConfig(latestResult.data.device_id),
        ])
        const result = settledValue(thresholdsResult[0])
        if (result.error) {
          nextErrors.thresholds = errorMessage(result.error)
          requestErrors.push(result.error)
          setThresholdError(errorMessage(result.error))
          setThresholdConfig(null)
        } else {
          setThresholdConfig(result.data)
          setThresholdError(null)
        }
      } else if (!latestResult.error) {
        setThresholdConfig(null)
        setThresholdError(null)
      }

      setErrors(nextErrors)
      setLastUpdated(new Date())
      if (!requestErrors.length) {
        setConnectionStatus('connected')
      } else if (
        successfulQueries > 0 ||
        requestErrors.some(receivedServerResponse)
      ) {
        setConnectionStatus('query-error')
      } else {
        setConnectionStatus('unavailable')
      }
    } catch (requestError) {
      const message = errorMessage(requestError)
      setErrors({ measurements: message })
      setConnectionStatus('unavailable')
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(refresh, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  useEffect(() => {
    const channel = subscribeToMonitoring(
      () => refresh(),
      (status) => setRealtimeConnected(status === 'SUBSCRIBED'),
    )
    return () => {
      setRealtimeConnected(false)
      channel?.unsubscribe()
    }
  }, [refresh])

  useEffect(() => {
    if (!supabaseConfigured || realtimeConnected) return undefined
    const interval = window.setInterval(refresh, 20000)
    return () => window.clearInterval(interval)
  }, [realtimeConnected, refresh])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 15000)
    return () => window.clearInterval(interval)
  }, [])

  return {
    latest,
    alerts,
    devices,
    thresholdConfig,
    thresholdError,
    staleAfterSeconds,
    loading,
    errors,
    error: Object.values(errors).join(' · '),
    connectionStatus,
    lastUpdated,
    realtimeConnected,
    now,
    refresh,
    isConfigured: supabaseConfigured,
  }
}
