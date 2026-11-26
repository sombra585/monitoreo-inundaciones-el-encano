import { useMemo, useState } from 'react'
import { AlertTriangle, Filter } from 'lucide-react'
import { AlertCard } from '../components/AlertCard'
import { supabase } from '../services/supabase'
import { describeRisk } from '../utils/risk'

export default function Alerts({ alerts, isConfigured, role }) {
  const [severity, setSeverity] = useState('Todas')
  const [status, setStatus] = useState('Todas')
  const [actionError, setActionError] = useState('')
  const [savingId, setSavingId] = useState(null)

  const filtered = useMemo(() => alerts.filter((alert) => {
    const matchesSeverity = severity === 'Todas' || alert.severity === severity
    const matchesStatus = status === 'Todas' ||
      (status === 'Activas' && alert.status === 'OPEN') ||
      (status === 'Reconocidas' && alert.status === 'ACKNOWLEDGED') ||
      (status === 'Resueltas' && alert.status === 'RESOLVED')
    return matchesSeverity && matchesStatus
  }), [alerts, severity, status])

  async function updateAlert(alert, nextStatus) {
    setActionError('')
    if (nextStatus === 'RESOLVED' && !window.confirm('¿Confirmas resolver esta alerta?')) return
    setSavingId(alert.id)
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        setActionError(userError?.message || 'Inicia sesión con una cuenta autorizada para gestionar alertas.')
        return
      }
      const now = new Date().toISOString()
      const changes = nextStatus === 'ACKNOWLEDGED'
        ? { status: nextStatus, acknowledged_by: userData.user.id }
        : { status: nextStatus, resolved_by: userData.user.id, resolved_at: now }
      const { error } = await supabase.from('alert_events').update(changes).eq('id', alert.id)
      if (error) setActionError(error.message)
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'No se pudo actualizar la alerta.')
    } finally {
      setSavingId(null)
    }
  }

  const pending = alerts.filter((alert) => alert.status !== 'RESOLVED').length

  return (
    <main className="page">
      {!isConfigured && <div className="connection-notice">Configura Supabase para consultar las alertas generadas a partir de datos reales.</div>}
      <section className="page-heading simple">
        <div><p className="section-overline">CENTRO DE NOTIFICACIONES</p><h1>Alertas del sistema</h1><p>Eventos de riesgo, condiciones ambientales y calidad de datos.</p></div>
        <div className="summary-count"><AlertTriangle size={20} /><strong>{pending}</strong><span>activas</span></div>
      </section>
      <section className="alerts-panel">
        <div className="table-toolbar">
          <div className="filter-title"><Filter size={16} /><strong>Filtros</strong></div>
          <label><span>Gravedad</span><select value={severity} onChange={(event) => setSeverity(event.target.value)}>
            <option value="Todas">Todas</option>
            {['INFO', 'ADVERTENCIA', 'PELIGRO', 'PELIGRO_CRITICO'].map((item) => <option key={item} value={item}>{item === 'INFO' ? item : describeRisk(item)}</option>)}
          </select></label>
          <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}>
            {['Todas', 'Activas', 'Reconocidas', 'Resueltas'].map((item) => <option key={item}>{item}</option>)}
          </select></label>
        </div>
        {actionError && <div className="global-error" role="alert">{actionError}</div>}
        {filtered.length ? filtered.map((alert) => (
          <div className="alert-management-row" key={alert.id}>
            <AlertCard alert={alert} />
            {(role === 'engineer' || role === 'admin') && alert.status !== 'RESOLVED' && (
              <div className="alert-actions">
                {alert.status === 'OPEN' && <button type="button" disabled={savingId === alert.id} onClick={() => updateAlert(alert, 'ACKNOWLEDGED')}>Reconocer</button>}
                <button type="button" disabled={savingId === alert.id} onClick={() => updateAlert(alert, 'RESOLVED')}>Resolver</button>
              </div>
            )}
          </div>
        )) : <div className="empty-state">{alerts.length ? 'No hay alertas que coincidan con los filtros seleccionados.' : 'Esperando datos del ESP32; aún no hay alertas registradas.'}</div>}
      </section>
    </main>
  )
}
