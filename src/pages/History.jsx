import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { fetchMeasurementHistory } from '../services/dataService'
import { describeRain, describeRisk, describeSoil, getRiskKey } from '../utils/risk'

export default function History({ isConfigured, refreshKey }) {
  const [query, setQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState('Todos')
  const [dateFilter, setDateFilter] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 8
  const [records, setRecords] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchMeasurementHistory({
          page,
          pageSize,
          risk: riskFilter,
          query,
          date: dateFilter,
        })
        if (cancelled) return
        if (result.error) {
          setError(result.error.message)
          setRecords([])
          setTotalCount(0)
        } else {
          setRecords(result.data)
          setTotalCount(result.count)
        }
      } catch (requestError) {
        if (cancelled) return
        setError(requestError instanceof Error ? requestError.message : 'Error inesperado al consultar el historial.')
        setRecords([])
        setTotalCount(0)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [dateFilter, isConfigured, page, pageSize, query, refreshKey, riskFilter])

  const hasFilters = Boolean(query.trim() || dateFilter || riskFilter !== 'Todos')

  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const safePage = Math.min(page, pageCount)

  return (
    <main className="page">
      {!isConfigured && <div className="connection-notice">Configura Supabase para consultar las mediciones enviadas por el ESP32.</div>}
      <section className="page-heading simple">
        <div><p className="section-overline">REGISTROS</p><h1>Historial de mediciones</h1><p>Consulta paginada de las mediciones almacenadas.</p></div>
      </section>
      <section className="table-card">
        <div className="table-toolbar">
          <label className="search-field">
            <Search size={16} />
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Buscar dispositivo" />
          </label>
          <label><span>Fecha</span><input type="date" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPage(1) }} /></label>
          <label><span>Riesgo</span>
            <select value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value); setPage(1) }}>
              <option value="Todos">Todos</option>
              <option value="SIN_LECTURA">Sin lectura</option>
              <option value="NORMAL">Normal</option>
              <option value="ADVERTENCIA">Advertencia</option>
              <option value="PELIGRO">Peligro</option>
              <option value="PELIGRO_CRITICO">Peligro crítico</option>
            </select>
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Fecha y hora</th><th>Dispositivo</th><th>Nivel del agua</th><th>Distancia</th><th>Lluvia</th><th>Humedad</th><th>Riesgo</th></tr></thead>
            <tbody>
              {records.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.recorded_at).toLocaleString('es-CO')}</td>
                  <td>{item.device_id}</td>
                  <td><strong>{item.water_height_cm != null ? `${Number(item.water_height_cm).toFixed(1)} cm` : '—'}</strong></td>
                  <td>{item.water_distance_cm != null ? `${Number(item.water_distance_cm).toFixed(1)} cm` : '—'}</td>
                  <td>{describeRain(item.rain_status)}</td>
                  <td>{describeSoil(item.soil_status)}{item.soil_percent != null ? ` · ${Number(item.soil_percent).toFixed(1)}%` : ''}</td>
                  <td><span className={`table-risk risk-${getRiskKey(item.general_risk)}`}>{describeRisk(item.general_risk)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <div className="empty-table" role="alert">No se pudo consultar el historial: {error}</div>}
          {!error && loading && <div className="empty-table">Consultando mediciones...</div>}
          {!error && !loading && !records.length && <div className="empty-table">{hasFilters ? 'No se encontraron registros con los filtros seleccionados.' : 'Esperando datos del ESP32. Todavía no hay mediciones recibidas.'}</div>}
        </div>
        <div className="pagination">
          <span>{totalCount} registros</span>
          <div>
            <button type="button" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Anterior</button>
            <span>Página {safePage} de {pageCount}</span>
            <button type="button" disabled={safePage === pageCount || loading} onClick={() => setPage(safePage + 1)}>Siguiente</button>
          </div>
        </div>
      </section>
    </main>
  )
}