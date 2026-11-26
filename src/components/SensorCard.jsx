import { ArrowUpRight } from 'lucide-react'
import { getRiskKey } from '../utils/risk'

export default function SensorCard({
  icon: Icon,
  title,
  value,
  unit,
  status,
  description,
  updatedAt,
  progress,
  hasData = false,
  accent = 'blue',
}) {
  const statusKey = getRiskKey(status)
  const statusClass = [
    'normal', 'advertencia', 'peligro', 'peligro_critico', 'sin_lectura',
    'sin_lluvia', 'lluvia_moderada', 'lluvia_excesiva', 'seco',
    'humedad_normal', 'humedad_preventiva', 'humedad_excesiva',
  ].includes(statusKey) ? statusKey : ''

  return (
    <article className={`sensor-card accent-${accent}`}>
      <div className="sensor-card-top">
        <div className="sensor-icon"><Icon size={21} /></div>
        <span className={`sensor-live ${hasData ? 'available' : 'unavailable'}`}>
          <span /> {hasData ? 'Datos disponibles' : 'Sin datos'}
        </span>
      </div>
      <div className="sensor-content">
        <p className="sensor-title">{title}</p>
        <div className="sensor-value">
          <strong>{value}</strong>
          {unit && <span>{unit}</span>}
        </div>
        {status && <span className={`sensor-status ${statusClass}`}>{status}</span>}
        {description && <p className="sensor-description">{description}</p>}
        {typeof progress === 'number' && (
          <div className="progress-track" aria-label={`Progreso: ${progress}%`}>
            <span style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
        )}
      </div>
      <footer>
        <span>Última actualización</span>
        <strong>{updatedAt || 'Sin mediciones'}</strong>
        <ArrowUpRight size={15} />
      </footer>
    </article>
  )
}