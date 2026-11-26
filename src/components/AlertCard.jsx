import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { describeRisk, getRiskKey } from '../utils/risk'

export function AlertCard({ alert }) {
  const key = alert.severity === 'INFO' ? 'info' : getRiskKey(alert.severity)
  const statusKey = alert.status === 'RESOLVED'
    ? 'reviewed'
    : alert.status === 'ACKNOWLEDGED'
      ? 'acknowledged'
      : 'pending'
  const date = new Date(alert.created_at)

  return (
    <article className={`alert-card severity-${key}`}>
      <div className="alert-symbol">
        {key === 'normal' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
      </div>
      <div className="alert-body">
        <div className="alert-heading">
          <strong>{alert.title}</strong>
          <span>{alert.category} · {alert.severity === 'INFO' ? 'Información' : describeRisk(alert.severity)}</span>
        </div>
        <p>{alert.description}</p>
        <time>{date.toLocaleDateString('es-CO')} · {date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</time>
      </div>
      <span className={`alert-status ${statusKey}`}>
        {statusKey === 'pending' ? <Circle size={11} fill="currentColor" /> : <CheckCircle2 size={13} />}
        {statusKey === 'reviewed' ? 'Resuelta' : statusKey === 'acknowledged' ? 'Reconocida' : 'Activa'}
      </span>
    </article>
  )
}