import { supabase, supabaseConfigured } from './supabase'

const READING_COLUMNS = [
  'id',
  'device_id',
  'water_distance_cm',
  'water_height_cm',
  'water_status',
  'rain_adc',
  'rain_voltage',
  'rain_status',
  'soil_adc',
  'soil_percent',
  'soil_status',
  'general_risk',
  'buzzer_active',
  'recorded_at',
].join(', ')

const ALERT_COLUMNS = [
  'id',
  'device_id',
  'reading_id',
  'severity',
  'category',
  'title',
  'description',
  'status',
  'created_at',
  'resolved_at',
].join(', ')

const SYSTEM_SETTING_KEYS = [
  'project_name',
  'measurement_interval_seconds',
  'upload_interval_seconds',
  'stale_after_seconds',
]

function toFiniteNumber(value) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export async function fetchLatestMeasurement() {
  if (!supabaseConfigured) return { data: null, error: null }
  const { data, error } = await supabase
    .from('sensor_readings')
    .select(READING_COLUMNS)
    .order('recorded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { data, error }
}

export async function fetchChartMeasurements(hours) {
  if (!supabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase.rpc('get_monitoring_chart', { p_hours: hours })
  return { data: data || [], error }
}

export async function fetchMeasurementHistory({
  page = 1,
  pageSize = 8,
  risk = 'Todos',
  query = '',
  date = '',
} = {}) {
  if (!supabaseConfigured) return { data: [], error: null, count: 0 }

  const from = (page - 1) * pageSize
  let request = supabase
    .from('sensor_readings')
    .select(READING_COLUMNS, { count: 'exact' })
    .order('recorded_at', { ascending: false })
    .range(from, from + pageSize - 1)

  if (risk !== 'Todos') request = request.eq('general_risk', risk)
  if (query.trim()) {
    const escapedQuery = query.trim().replace(/[\\%_*]/g, '\\$&')
    request = request.ilike('device_id', `%${escapedQuery}%`)
  }
  if (date) {
    const start = new Date(`${date}T00:00:00`)
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    request = request.gte('recorded_at', start.toISOString()).lt('recorded_at', end.toISOString())
  }

  const { data, error, count } = await request
  return { data: data || [], error, count: count || 0 }
}

export async function fetchAlerts() {
  if (!supabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('alert_events')
    .select(ALERT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100)
  return { data: data || [], error }
}

export async function fetchDevices() {
  if (!supabaseConfigured) return { data: [], error: null }
  const { data, error } = await supabase
    .from('devices')
    .select('id, name, location, active, last_seen_at, created_at')
  return { data: data || [], error }
}

export async function fetchAllSystemSettings() {
  if (!supabaseConfigured) return { data: null, error: null }
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .eq('key', 'stale_after_seconds')
    .single()

  if (error) return { data: null, error }
  const staleAfterSeconds = toFiniteNumber(data.value)
  if (staleAfterSeconds === null || staleAfterSeconds <= 0) {
    return {
      data: null,
      error: new Error('system_settings.stale_after_seconds.value debe ser un número positivo.'),
    }
  }
  return { data: { stale_after_seconds: staleAfterSeconds }, error: null }
}

export function subscribeToMonitoring(onChange, onStatusChange) {
  if (!supabaseConfigured) return null
  return supabase
    .channel('public-monitoring')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sensor_readings' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_events' }, onChange)
    .subscribe(onStatusChange)
}

export async function fetchThresholdConfig(deviceId) {
  if (!supabaseConfigured) return { data: null, error: null }
  if (!deviceId) return { data: null, error: new Error('Selecciona un dispositivo para consultar sus umbrales.') }
  return supabase
    .from('threshold_configs')
    .select('id, device_id, water_warning_cm, water_danger_cm, water_buzzer_cm, soil_warning_pct, soil_preventive_pct, soil_excessive_pct, rain_excessive_voltage, rain_dry_voltage, updated_at')
    .eq('device_id', deviceId)
    .maybeSingle()
}

export async function fetchSystemSettings() {
  if (!supabaseConfigured) return { data: null, error: null }
  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value, description, updated_at')
    .in('key', SYSTEM_SETTING_KEYS)
  if (error) return { data: null, error }

  const settings = Object.fromEntries((data || []).map((row) => [row.key, row.value]))
  const missingKeys = SYSTEM_SETTING_KEYS.filter((key) => !Object.prototype.hasOwnProperty.call(settings, key))
  if (missingKeys.length) {
    return { data: null, error: new Error(`Faltan claves en system_settings: ${missingKeys.join(', ')}.`) }
  }
  return { data: settings, error: null }
}

export async function updateThresholdConfig(deviceId, values, userId) {
  if (!supabaseConfigured) return { data: null, error: new Error('Supabase no está configurado.') }
  if (!deviceId) return { data: null, error: new Error('Selecciona un dispositivo para guardar sus umbrales.') }
  const allowedFields = [
    'water_warning_cm',
    'water_danger_cm',
    'water_buzzer_cm',
    'soil_warning_pct',
    'soil_preventive_pct',
    'soil_excessive_pct',
    'rain_excessive_voltage',
    'rain_dry_voltage',
  ]
  const unsupportedFields = Object.keys(values).filter((key) => !allowedFields.includes(key))
  if (unsupportedFields.length) {
    return { data: null, error: new Error(`Campos de umbral no permitidos: ${unsupportedFields.join(', ')}.`) }
  }
  if (!Object.keys(values).length) {
    return { data: null, error: new Error('No hay umbrales para guardar.') }
  }
  const changes = { ...values }
  return supabase
    .from('threshold_configs')
    .update({ ...changes, updated_by: userId })
    .eq('device_id', deviceId)
    .select()
    .single()
}

export async function updateSystemSettings(values, userId) {
  if (!supabaseConfigured) return { data: null, error: new Error('Supabase no está configurado.') }
  const allowedKeys = new Set(SYSTEM_SETTING_KEYS)
  const entries = Object.entries(values).filter(([key]) => allowedKeys.has(key))
  const unsupportedKeys = Object.keys(values).filter((key) => !allowedKeys.has(key))
  if (unsupportedKeys.length) {
    return { data: null, error: new Error(`Claves de configuración no permitidas: ${unsupportedKeys.join(', ')}.`) }
  }
  if (!entries.length) return { data: null, error: new Error('No hay ajustes para guardar.') }
  const results = await Promise.all(entries.map(async ([key, value]) => {
    const result = await supabase
      .from('system_settings')
      .update({ value, updated_by: userId })
      .eq('key', key)
      .select('key')
      .single()
    return { key, ...result }
  }))
  const failed = results.find((result) => result.error)
  return {
    data: results.filter((result) => !result.error).map((result) => result.key),
    error: failed?.error || null,
  }
}
