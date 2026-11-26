import { useEffect, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CloudRain, Droplets, MapPin, ShieldAlert, Waves } from 'lucide-react'
import SensorCard from '../components/SensorCard'
import { AlertCard } from '../components/AlertCard'
import { SYSTEM_CONFIG } from '../config'
import { fetchChartMeasurements } from '../services/dataService'
import {
  describeRain,
  describeRisk,
  describeSoil,
  getEnvironmentalWarning,
  isWaterReadingValid,
  normalizeRisk,
} from '../utils/risk'

function formatTime(value) {
  if (!value) return 'Sin mediciones'
  return new Date(value).toLocaleString('es-CO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <p key={item.dataKey}>
          <span style={{ background: item.color }} />
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  )
}

export default function Dashboard({
  alerts,
  latest,
  devices,
  thresholdConfig,
  thresholdError,
  isConfigured,
  error,
  now,
  staleAfterSeconds,
  refreshKey,
  role,
  onNavigate,
}) {
  const [period, setPeriod] = useState('24')
  const [chartMeasurements, setChartMeasurements] = useState([])
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState('')

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(async () => {
      setChartLoading(true)
      setChartError('')
      try {
        const result = await fetchChartMeasurements(Number(period))
        if (!active) return
        if (result.error) {
          setChartError(result.error.message)
          setChartMeasurements([])
        } else {
          setChartMeasurements(result.data)
        }
      } catch (requestError) {
        if (!active) return
        setChartError(requestError instanceof Error ? requestError.message : 'No se pudieron consultar las gráficas.')
        setChartMeasurements([])
      } finally {
        if (active) setChartLoading(false)
      }
    }, 0)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isConfigured, period, refreshKey])

  const chartData = chartMeasurements.map((item) => {
    const date = new Date(item.recorded_at)
    return {
      time: date.toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      nivelAgua: item.water_height_cm == null ? null : Number(item.water_height_cm),
      lluviaVoltaje: item.rain_voltage == null ? null : Number(item.rain_voltage),
      humedad: item.soil_percent == null ? null : Number(item.soil_percent),
    }
  })

  const height = latest?.water_height_cm != null
    ? Number(latest.water_height_cm)
    : null
  const risk = normalizeRisk(latest?.general_risk)
  const waterStatus = latest?.water_status || 'SIN_LECTURA'
  const rainStatus = latest?.rain_status || 'SIN_LECTURA'
  const soilStatus = latest?.soil_status || 'SIN_LECTURA'
  const warning = latest ? getEnvironmentalWarning(rainStatus, soilStatus) : null
  const rainLabel = describeRain(rainStatus)
  const soilLabel = describeSoil(soilStatus)
  const latestTime = formatTime(latest?.recorded_at)
  const pendingAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED').length
  const latestDevice = devices?.find((device) => device.id === latest?.device_id) || null
  const deviceLastContact = latestDevice
    ? {
        device: latestDevice,
        time: latestDevice.last_seen_at ? new Date(latestDevice.last_seen_at).getTime() : 0,
      }
    : null
  const isStale = !deviceLastContact?.time ||
    (now && now.getTime() - deviceLastContact.time > staleAfterSeconds * 1000)
  const isEngineer = role === 'engineer' || role === 'admin'
  const waterValid = isWaterReadingValid(latest)
  const waterThresholds = thresholdConfig
    ? [
        Number(thresholdConfig.water_warning_cm),
        Number(thresholdConfig.water_danger_cm),
        Number(thresholdConfig.water_buzzer_cm),
      ]
    : []

  return (
    <main className="page dashboard-page">
      {!isConfigured && (
        <div className="connection-notice">
          Supabase aún no está configurado. Esperando conexión y datos del ESP32.
        </div>
      )}
      {isConfigured && !latest && !error && (
        <div className="connection-notice">
          Esperando datos del ESP32. Las mediciones aparecerán aquí cuando el dispositivo envíe su primer registro.
        </div>
      )}
      {latest && isStale && (
        <div className="stale-notice" role="status">
          Sin comunicación reciente con el dispositivo. Último contacto: {formatTime(deviceLastContact?.device?.last_seen_at)}.
        </div>
      )}
      {thresholdError && (
        <div className="environment-warning" role="status">
          No se pudieron consultar los umbrales del dispositivo: {thresholdError}
        </div>
      )}
      {latest && !waterValid && (
        <div className="environment-warning" role="alert">
          Sin lectura válida del sensor de agua. No se asigna un nivel de agua ni se activa el buzzer por esta lectura.
        </div>
      )}

      <section className="page-heading">
        <div>
          <p className="location"><MapPin size={15} /> El Encano, Nariño, Colombia</p>
          <h1>Panel de monitoreo ambiental</h1>
          <p>Supervisión de las condiciones ambientales y detección temprana de riesgos de inundación en El Encano.</p>
        </div>
        <div className="system-summary">
          <span className={`summary-risk risk-${risk.toLowerCase()}`}>{describeRisk(risk)}</span>
          <div>
            <small>Última medición</small>
            <strong>{latestTime}</strong>
            <small>{deviceLastContact?.device?.name || 'ESP32'} · {isStale ? 'Sin comunicación reciente' : 'Comunicación reciente'}</small>
          </div>
        </div>
      </section>

      {warning && <div className="environment-warning"><ShieldAlert size={18} /><span>{warning}</span></div>}

      <section className="sensor-grid">
        <SensorCard
          icon={Waves}
          title="Nivel del agua"
          value={height == null ? '—' : height.toFixed(1)}
          unit={height == null ? '' : 'cm'}
          status={describeRisk(waterStatus)}
          description={waterValid
            ? `Nivel calculado desde una distancia válida del HC-SR04.${isEngineer ? ` Distancia: ${Number(latest.water_distance_cm).toFixed(1)} cm.` : ''}`
            : 'Sin lectura válida del sensor de agua.'}
          updatedAt={latestTime}
          progress={height == null ? undefined : (height / SYSTEM_CONFIG.distanceBaseCm) * 100}
          hasData={waterValid}
          accent="blue"
        />
        <SensorCard
          icon={CloudRain}
          title="Indicador de lluvia"
          value={rainLabel}
          status={rainStatus}
          description={isEngineer && latest?.rain_adc != null
            ? `${Number(latest.rain_voltage).toFixed(2)} V · ADC ${latest.rain_adc}. Indicador cualitativo de humedad en la placa; no mide mm/h.`
            : 'Indicador cualitativo; sin lectura disponible.'}
          updatedAt={latestTime}
          hasData={latest?.rain_adc != null}
          accent="cyan"
        />
        <SensorCard
          icon={Droplets}
          title="Humedad del suelo"
          value={soilLabel}
          status={soilStatus}
          description={isEngineer && latest?.soil_percent != null
            ? `${Number(latest.soil_percent).toFixed(1)}% estimado · ADC ${latest.soil_adc}. No es humedad volumétrica certificada.`
            : 'Porcentaje estimado; sin lectura disponible.'}
          updatedAt={latestTime}
          progress={latest?.soil_percent == null ? undefined : Number(latest.soil_percent)}
          hasData={latest?.soil_adc != null}
          accent="green"
        />
        <SensorCard
          icon={ShieldAlert}
          title="Estado de riesgo"
          value={describeRisk(risk)}
          status={describeRisk(risk)}
          description={latest
            ? `Estado del agua: ${describeRisk(waterStatus)}. Buzzer: ${latest.buzzer_active ? 'activo' : 'inactivo'}; umbral configurado: ${thresholdConfig?.water_buzzer_cm ?? 'sin configuración'} cm.`
            : 'Esperando mediciones del sistema.'}
          updatedAt={latestTime}
          hasData={Boolean(latest && risk !== 'SIN_LECTURA')}
          accent="orange"
        />
      </section>

      <section className="chart-section">
        <div className="section-toolbar">
          <div>
            <p className="section-overline">ANÁLISIS TEMPORAL</p>
            <h2>Evolución ambiental</h2>
          </div>
          <div className="period-filter" aria-label="Filtro temporal">
            {[['24', '24 horas'], ['168', '7 días'], ['720', '30 días']].map(([value, label]) => (
              <button key={value} type="button" className={period === value ? 'active' : ''} onClick={() => setPeriod(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {chartLoading ? (
          <div className="empty-chart">Consultando datos históricos…</div>
        ) : chartError ? (
          <div className="global-error" role="alert">No se pudieron consultar las gráficas: {chartError}</div>
        ) : chartData.length === 0 ? (
          <div className="empty-chart">No existen mediciones para el período seleccionado.</div>
        ) : (
          <div className="chart-grid">
            <article className="chart-card chart-wide">
              <div className="chart-card-heading"><div><p>NIVEL DEL AGUA</p><h3>Evolución del nivel</h3></div><strong>{height == null ? '—' : `${height.toFixed(1)} cm`}</strong></div>
              <div className="chart-container">
                {!chartData.some((item) => item.nivelAgua != null) ? (
                  <div className="empty-chart">Sin lecturas válidas del sensor de agua en este período.</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 12, right: 10, left: -16, bottom: 0 }}>
                    <defs>
                      <linearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#263449" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="time" stroke="#94A3B8" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, SYSTEM_CONFIG.distanceBaseCm]} stroke="#94A3B8" tick={{ fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    {waterThresholds.every(Number.isFinite) && <ReferenceLine y={waterThresholds[0]} stroke="#FACC15" strokeDasharray="5 5" />}
                    {waterThresholds.every(Number.isFinite) && <ReferenceLine y={waterThresholds[1]} stroke="#F97316" strokeDasharray="5 5" />}
                    {waterThresholds.every(Number.isFinite) && <ReferenceLine y={waterThresholds[2]} stroke="#EF4444" strokeDasharray="5 5" />}
                    <Area type="monotone" dataKey="nivelAgua" name="Nivel" stroke="#38BDF8" strokeWidth={2.5} fill="url(#waterFill)" />
                  </AreaChart>
                </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="chart-card">
              <div className="chart-card-heading"><div><p>PLACA DE LLUVIA</p><h3>Voltaje cualitativo</h3></div></div>
              <div className="chart-container compact">
                {!chartData.some((item) => item.lluviaVoltaje != null) ? (
                  <div className="empty-chart">Sin lecturas de voltaje en este período.</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid stroke="#263449" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="time" stroke="#94A3B8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={1.5} stroke="#F97316" strokeDasharray="5 5" />
                    <ReferenceLine y={2.6} stroke="#38BDF8" strokeDasharray="5 5" />
                    <Bar dataKey="lluviaVoltaje" name="Voltaje (V)" fill="#2563EB" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="chart-card">
              <div className="chart-card-heading"><div><p>HUMEDAD</p><h3>Sensor del suelo</h3></div></div>
              <div className="chart-container compact">
                {!chartData.some((item) => item.humedad != null) ? (
                  <div className="empty-chart">Sin porcentajes estimados en este período.</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid stroke="#263449" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="time" stroke="#94A3B8" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#94A3B8" tick={{ fontSize: 10 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="humedad" name="Humedad estimada (%)" stroke="#22C55E" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </article>
          </div>
        )}
      </section>

      <section className="recent-alerts">
        <div className="section-toolbar">
          <div><p className="section-overline">NOTIFICACIONES</p><h2>Alertas recientes</h2></div>
          <button className="text-button" type="button" onClick={() => onNavigate('alerts')}>Ver todas · {pendingAlerts}</button>
        </div>
        {alerts.length ? alerts.slice(0, 3).map((alert) => <AlertCard key={alert.id} alert={alert} />) : (
          <div className="empty-state">No hay alertas registradas.</div>
        )}
        <div className="interpretation-note">
          <strong>Cómo interpretar:</strong> el sensor de lluvia es un indicador cualitativo de humedad en su placa, no un pluviómetro. El porcentaje del YL-69 es una estimación según calibración provisional. Las alertas indican condiciones observadas por el prototipo; no predicen ni confirman inundaciones.
        </div>
      </section>
    </main>
  )
}