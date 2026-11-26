import { useEffect, useState } from 'react'
import { Save, Settings2 } from 'lucide-react'
import {
  fetchDevices,
  fetchSystemSettings,
  fetchThresholdConfig,
  updateSystemSettings,
  updateThresholdConfig,
} from '../services/dataService'

const numericSystemSettings = [
  'measurement_interval_seconds',
  'upload_interval_seconds',
  'stale_after_seconds',
]

const thresholdFields = [
  ['water_warning_cm', 'Advertencia de nivel de agua (cm)', 0, 20],
  ['water_danger_cm', 'Peligro de nivel de agua (cm)', 0, 20],
  ['water_buzzer_cm', 'Activación del buzzer (cm)', 0, 20],
  ['soil_warning_pct', 'Advertencia de humedad del suelo (%)', 0, 100],
  ['soil_preventive_pct', 'Humedad preventiva (%)', 0, 100],
  ['soil_excessive_pct', 'Humedad excesiva (%)', 0, 100],
  ['rain_excessive_voltage', 'Voltaje de lluvia excesiva (V)', 0, 3.3],
  ['rain_dry_voltage', 'Voltaje de placa seca (V)', 0, 3.3],
]

function toInputValues(values, fields) {
  return Object.fromEntries(fields.map(([field]) => [field, String(values[field] ?? '')]))
}

function parseNumericValues(values, keys) {
  const parsed = {}
  for (const key of keys) {
    const value = Number(values[key])
    if (!Number.isFinite(value)) return null
    parsed[key] = value
  }
  return parsed
}

export default function Settings({ user, role }) {
  const [devices, setDevices] = useState([])
  const [deviceId, setDeviceId] = useState('')
  const [thresholds, setThresholds] = useState(null)
  const [system, setSystem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([fetchDevices(), fetchSystemSettings()])
      .then(([devicesResult, systemResult]) => {
        if (!active) return
        const failed = devicesResult.error || systemResult.error
        if (failed) {
          setError(failed.message)
          setLoading(false)
          return
        }

        const orderedDevices = [...devicesResult.data].sort((a, b) => Number(b.active) - Number(a.active))
        setDevices(orderedDevices)
        setDeviceId(orderedDevices[0]?.id || '')
        setSystem({
          project_name: String(systemResult.data.project_name),
          measurement_interval_seconds: String(systemResult.data.measurement_interval_seconds),
          upload_interval_seconds: String(systemResult.data.upload_interval_seconds),
          stale_after_seconds: String(systemResult.data.stale_after_seconds),
        })
        setLoading(false)
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la configuración.')
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!deviceId) return undefined

    let active = true
    fetchThresholdConfig(deviceId)
      .then(({ data, error: requestError }) => {
        if (!active) return
        if (requestError) setError(requestError.message)
        else if (!data) setError(`No hay una fila en threshold_configs para el dispositivo ${deviceId}.`)
        else {
          setThresholds(toInputValues(data, thresholdFields))
          setError('')
        }
      })
      .catch((requestError) => {
        if (!active) return
        setError(requestError instanceof Error ? requestError.message : 'No se pudieron cargar los umbrales.')
      })
    return () => { active = false }
  }, [deviceId])

  async function save(event) {
    event.preventDefault()
    setMessage('')
    setError('')
    if (!deviceId || !thresholds || !system) {
      setError('Selecciona un dispositivo y espera a que su configuración termine de cargar.')
      return
    }

    const numericThresholds = parseNumericValues(thresholds, thresholdFields.map(([field]) => field))
    const numericSettings = parseNumericValues(system, numericSystemSettings)
    if (!system.project_name.trim() || system.project_name.trim().length > 200 ||
        !numericThresholds || !numericSettings ||
        Object.values(numericSettings).some((value) => !Number.isInteger(value) || value <= 0)) {
      setError('Revisa los valores: nombre obligatorio y menor de 201 caracteres; intervalos enteros positivos; umbrales numéricos.')
      return
    }
    if (numericThresholds.water_warning_cm >= numericThresholds.water_danger_cm ||
        numericThresholds.water_danger_cm >= numericThresholds.water_buzzer_cm ||
        numericThresholds.soil_warning_pct >= numericThresholds.soil_preventive_pct ||
        numericThresholds.soil_preventive_pct >= numericThresholds.soil_excessive_pct ||
        thresholdFields.some(([field, , min, max]) =>
          numericThresholds[field] < min || numericThresholds[field] > max)) {
      setError('Los umbrales deben estar dentro de sus rangos y ordenados: agua advertencia < peligro < buzzer; suelo advertencia < preventiva < excesiva.')
      return
    }
    if (!window.confirm(`¿Guardar los umbrales de ${deviceId} y los ajustes generales?`)) return

    setSaving(true)
    try {
      const [thresholdResult, settingsResult] = await Promise.all([
        updateThresholdConfig(deviceId, numericThresholds, user.id),
        updateSystemSettings({
          project_name: system.project_name.trim(),
          ...numericSettings,
        }, user.id),
      ])

      if (thresholdResult.error || settingsResult.error) {
        const details = []
        if (thresholdResult.error) details.push(`Umbrales: ${thresholdResult.error.message}`)
        if (settingsResult.error) {
          const updatedKeys = settingsResult.data?.join(', ')
          details.push(`Ajustes generales: ${settingsResult.error.message}${updatedKeys ? ` (actualizados antes del error: ${updatedKeys})` : ''}`)
        } else if (thresholdResult.error && settingsResult.data?.length) {
          details.push(`Los ajustes generales sí se guardaron: ${settingsResult.data.join(', ')}.`)
        }
        setError(`No se guardaron todos los cambios. ${details.join(' ')}`)
        return
      }

      setThresholds(toInputValues(thresholdResult.data, thresholdFields))
      const refreshedSettings = await fetchSystemSettings()
      if (refreshedSettings.error) {
        setError(`Los cambios se guardaron, pero no se pudo volver a leer la configuración: ${refreshedSettings.error.message}`)
        return
      }
      setSystem({
        project_name: String(refreshedSettings.data.project_name),
        measurement_interval_seconds: String(refreshedSettings.data.measurement_interval_seconds),
        upload_interval_seconds: String(refreshedSettings.data.upload_interval_seconds),
        stale_after_seconds: String(refreshedSettings.data.stale_after_seconds),
      })
      setMessage('Configuración guardada correctamente.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la configuración.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="page"><div className="empty-state">Cargando configuración…</div></main>
  if (!system) return <main className="page"><div className="global-error" role="alert">{error || 'No hay ajustes generales disponibles.'}</div></main>

  return (
    <main className="page">
      <section className="page-heading simple">
        <div>
          <p className="section-overline">HERRAMIENTAS TÉCNICAS</p>
          <h1>Umbrales y ajustes</h1>
          <p>Configura umbrales por dispositivo y ajustes generales del proyecto.</p>
        </div>
      </section>
      <form className="settings-card" onSubmit={save}>
        <div className="settings-title"><Settings2 size={20} /><h2>Umbrales del dispositivo</h2></div>
        <label>Dispositivo
          <select
            value={deviceId}
            onChange={(event) => {
              setThresholds(null)
              setError('')
              setDeviceId(event.target.value)
            }}
            required
          >
            <option value="">Selecciona un dispositivo</option>
            {devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.id})</option>)}
          </select>
        </label>
        <p>Los umbrales se leen y guardan en la fila de threshold_configs cuyo device_id coincide con el dispositivo seleccionado.</p>
        <div className="settings-fields">
          {thresholdFields.map(([field, label, min, max]) => (
            <label key={field}>{label}
              <input
                type="number"
                step="0.1"
                min={min}
                max={max}
                value={thresholds?.[field] ?? ''}
                onChange={(event) => setThresholds({ ...thresholds, [field]: event.target.value })}
                disabled={!thresholds}
                required
              />
            </label>
          ))}
        </div>
        <div className="settings-divider" />
        <div className="settings-title"><Settings2 size={20} /><h2>Ajustes generales</h2></div>
        <p>Estos valores se guardan en system_settings.value usando cada key existente.</p>
        <div className="settings-fields">
          <label>Nombre del proyecto
            <input value={system.project_name} onChange={(event) => setSystem({ ...system, project_name: event.target.value })} maxLength={200} required />
          </label>
          <label>Intervalo de medición (s)
            <input type="number" min="1" step="1" value={system.measurement_interval_seconds} onChange={(event) => setSystem({ ...system, measurement_interval_seconds: event.target.value })} required />
          </label>
          <label>Intervalo de envío (s)
            <input type="number" min="1" step="1" value={system.upload_interval_seconds} onChange={(event) => setSystem({ ...system, upload_interval_seconds: event.target.value })} required />
          </label>
          <label>Datos obsoletos después de (s)
            <input type="number" min="1" step="1" value={system.stale_after_seconds} onChange={(event) => setSystem({ ...system, stale_after_seconds: event.target.value })} required />
          </label>
        </div>
        {error && <div className="global-error" role="alert">{error}</div>}
        {message && <div className="connection-notice" role="status">{message}</div>}
        <button className="primary-button" type="submit" disabled={saving || !thresholds || !devices.length}>
          <Save size={16} />{saving ? 'Guardando…' : `Guardar cambios (${role})`}
        </button>
      </form>
    </main>
  )
}
