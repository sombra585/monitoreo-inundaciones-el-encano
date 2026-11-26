import { Cloud, Database, RadioTower, ShieldCheck } from 'lucide-react'

export default function ProjectInfo({ isConfigured }) {
  return (
    <main className="page">
      <section className="page-heading simple">
        <div><p className="section-overline">SOBRE EL SISTEMA</p><h1>Información del proyecto</h1><p>Monitoreo y alerta temprana ante riesgos de inundación en El Encano.</p></div>
      </section>
      <section className="project-grid">
        <article className="project-card">
          <div className="project-card-icon"><RadioTower size={22} /></div>
          <h2>Arquitectura</h2>
          <p>ESP32 → HTTPS Edge Function → Supabase/PostgreSQL → React. Las lecturas llegan a la web mediante Realtime y consulta periódica de respaldo.</p>
          <span className="architecture-status">{isConfigured ? 'Supabase configurado' : 'Conexión real pendiente'}</span>
        </article>
        <article className="project-card">
          <div className="project-card-icon"><Database size={22} /></div>
          <h2>Base de datos</h2>
          <p>La migración define perfiles, dispositivos, lecturas, umbrales, alertas, actividad y credenciales con hash. La clave service role permanece en el entorno de Edge Functions.</p>
          <span className="architecture-status">{isConfigured ? 'Requiere verificación externa' : 'Sin configurar'}</span>
        </article>
        <article className="project-card">
          <div className="project-card-icon"><Cloud size={22} /></div>
          <h2>Datos recibidos</h2>
          <p>{isConfigured ? 'La aplicación consulta registros reales de Supabase.' : 'No se presentan datos de prueba. Configura Supabase y registra el ESP32 para recibir lecturas.'}</p>
        </article>
        <article className="project-card">
          <div className="project-card-icon"><ShieldCheck size={22} /></div>
          <h2>Umbrales iniciales del recipiente</h2>
          <p>Normal: menos de 2 cm · Advertencia: 2 a menos de 2.5 cm · Peligro: 2.5 a menos de 3 cm · Peligro crítico: desde 3 cm.</p>
        </article>
      </section>
      <section className="disclaimer">
        <strong>Nota técnica</strong>
        <p>El YL-83/YL-38 es un indicador cualitativo, no un pluviómetro. El porcentaje del YL-69 es una estimación provisional, no humedad volumétrica certificada. Este prototipo monitorea condiciones y no predice inundaciones con certeza.</p>
      </section>
    </main>
  )
}
