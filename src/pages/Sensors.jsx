import { CloudRain, Cpu, Droplets, Radio, Waves } from 'lucide-react'
import { describeRain, describeSoil, describeRisk, isWaterReadingValid } from '../utils/risk'

const sensors = [
  { name: 'HC-SR04', icon: Waves, function: 'Distancia entre el sensor ultrasónico y la superficie del agua.', variable: 'Distancia y altura de agua', unit: 'cm', connection: 'TRIG GPIO 12 · ECHO GPIO 14 con divisor a 3.3 V', field: 'water' },
  { name: 'YL-83/YL-38', icon: CloudRain, function: 'Indicador cualitativo de humedad en la placa; no mide precipitación en mm/h.', variable: 'ADC, voltaje, categoría', unit: 'ADC / V', connection: 'AO GPIO 35', field: 'rain_adc' },
  { name: 'YL-69', icon: Droplets, function: 'Estimación de humedad del suelo según calibración provisional. DO GPIO 25 no se usa para la clasificación.', variable: 'ADC y porcentaje estimado', unit: '% estimado', connection: 'AO GPIO 34', field: 'soil_adc' },
  { name: 'ESP32', icon: Cpu, function: 'Lee sensores y transmite registros por HTTPS cuando hay conexión. No se usan LEDs.', variable: 'Comunicación del dispositivo', unit: 'Estado', connection: 'Buzzer activo LOW GPIO 33', field: 'device' },
]

export default function Sensors({ latest, devices = [], isConfigured, role }) {
  const device = latest ? devices.find((item) => item.id === latest.device_id) : null
  const technical = role === 'engineer' || role === 'admin'
  const waterValid = isWaterReadingValid(latest)
  const readings = {
    water: waterValid ? `${latest.water_status} · ${latest.water_distance_cm} cm` : 'Sin lectura válida',
    rain_adc: latest?.rain_adc == null ? 'Sin lectura' : `${describeRain(latest.rain_status)}${technical ? ` · ${latest.rain_adc} ADC · ${Number(latest.rain_voltage).toFixed(2)} V` : ''}`,
    soil_adc: latest?.soil_adc == null ? 'Sin lectura' : `${describeSoil(latest.soil_status)}${technical ? ` · ${latest.soil_adc} ADC · ${Number(latest.soil_percent).toFixed(1)}% estimado` : ''}`,
    device: device?.last_seen_at ? (device.active ? 'Último contacto registrado' : 'Desactivado') : 'Sin comunicación registrada',
  }

  return (
    <main className="page">
      {!isConfigured && <div className="connection-notice">Sin conexión a Supabase. El estado de los sensores físicos todavía no se puede confirmar.</div>}
      <section className="page-heading simple">
        <div><p className="section-overline">INVENTARIO TÉCNICO</p><h1>Información de sensores</h1><p>Componentes previstos para el prototipo experimental.</p></div>
      </section>
      <section className="sensor-info-grid">
        {sensors.map((sensor) => {
          const Icon = sensor.icon
          const hasReading = sensor.field === 'device'
            ? Boolean(device?.last_seen_at)
            : sensor.field === 'water'
              ? waterValid
              : latest?.[sensor.field] != null
          return (
            <article className="sensor-info-card" key={sensor.name}>
              <div className="sensor-info-icon"><Icon size={23} /></div>
              <h2>{sensor.name}</h2>
              <p>{sensor.function}</p>
              <dl>
                <div><dt>Variable</dt><dd>{sensor.variable}</dd></div>
                <div><dt>Unidad</dt><dd>{sensor.unit}</dd></div>
                <div><dt>Conexión</dt><dd>{sensor.connection}</dd></div>
                <div><dt>Estado</dt><dd><span className={`verification-status ${hasReading ? 'reading' : ''}`}><Radio size={12} /> {hasReading ? 'Lectura disponible' : isConfigured ? 'Sin lectura' : 'Pendiente de conexión'}</span></dd></div>
                <div><dt>Última lectura</dt><dd>{sensor.field === 'device'
                  ? device?.last_seen_at ? new Date(device.last_seen_at).toLocaleString('es-CO') : 'Sin comunicación'
                  : latest?.recorded_at ? `${readings[sensor.field]} · ${new Date(latest.recorded_at).toLocaleString('es-CO')}` : 'Esperando datos del ESP32'}</dd></div>
                {sensor.field === 'water' && latest && <div><dt>Riesgo general</dt><dd>{describeRisk(latest.general_risk)}</dd></div>}
              </dl>
            </article>
          )
        })}
      </section>
    </main>
  )
}
