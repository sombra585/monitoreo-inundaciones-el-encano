import { AlertTriangle, Bell, CloudOff, Radio, RefreshCcw, Wifi, WifiOff } from 'lucide-react'

function ConnectionBadge({ status }) {
  if (status === 'unconfigured') {
    return (
      <span className="connection-badge warning" title="Supabase no está configurado." aria-label="Base de datos sin configurar">
        <WifiOff size={15} /> BD sin configurar
      </span>
    )
  }
  if (status === 'checking') {
    return (
      <span className="connection-badge warning" title="Comprobando la conexión con Supabase." aria-label="Comprobando la base de datos">
        <Wifi size={15} /> Comprobando BD
      </span>
    )
  }
  if (status === 'query-error') {
    return (
      <span className="connection-badge warning" title="Supabase respondió, pero una o más consultas fallaron." aria-label="Error en una o más consultas a la base de datos">
        <AlertTriangle size={15} /> Error de consulta
      </span>
    )
  }
  if (status === 'connected') {
    return (
      <span className="connection-badge success" title="Supabase respondió correctamente." aria-label="Base de datos conectada">
        <Wifi size={15} /> BD conectada
      </span>
    )
  }
  return (
    <span className="connection-badge danger" title="No se pudo establecer comunicación con Supabase." aria-label="Base de datos no disponible">
      <CloudOff size={15} /> BD no disponible
    </span>
  )
}

function DeviceBadge({ status }) {
  const badge = {
    waiting: {
      label: 'ESP32 sin datos',
      title: 'Todavía no hay mediciones recibidas del dispositivo.',
      icon: <Radio size={15} />,
      className: 'warning',
    },
    stale: {
      label: 'ESP32 obsoleto',
      title: 'La última comunicación del dispositivo está desactualizada.',
      icon: <WifiOff size={15} />,
      className: 'warning',
    },
    connected: {
      label: 'ESP32 con datos',
      title: 'El dispositivo ha enviado datos recientemente.',
      icon: <Radio size={15} />,
      className: 'success',
    },
    unknown: {
      label: 'ESP32 estado desconocido',
      title: 'No fue posible verificar el estado del dispositivo.',
      icon: <AlertTriangle size={15} />,
      className: 'warning',
    },
  }[status]

  return (
    <span className={`connection-badge ${badge.className}`} title={badge.title} aria-label={badge.label}>
      {badge.icon} {badge.label}
    </span>
  )
}

export default function Header({
  sectionName,
  isConfigured,
  connectionStatus,
  deviceStatus,
  loading,
  onRefresh,
  pendingAlerts,
  onOpenAlerts,
  profile,
  onSignIn,
  onSignOut,
}) {
  const today = new Intl.DateTimeFormat('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  return (
    <header className="top-header">
      <div>
        <p className="header-overline">El Encano · Nariño</p>
        <h2>{sectionName}</h2>
      </div>
      <div className="header-actions">
        <span className="header-date">{today}</span>
        <ConnectionBadge status={connectionStatus} />
        <DeviceBadge status={deviceStatus} />
        <button className="icon-button" type="button" onClick={onRefresh} disabled={loading} aria-label="Actualizar datos">
          <RefreshCcw size={18} className={loading ? 'spinning' : ''} />
        </button>
        <button className="icon-button notification-button" type="button" onClick={onOpenAlerts} aria-label="Ver notificaciones">
          <Bell size={19} />
          {pendingAlerts > 0 && <span className="notification-count">{pendingAlerts}</span>}
        </button>
        {profile ? (
          <button className="auth-button" type="button" onClick={onSignOut} title="Cerrar sesión">
            {profile.full_name || profile.email} · {profile.role}
          </button>
        ) : isConfigured && (
          <button className="auth-button" type="button" onClick={onSignIn}>Iniciar sesión</button>
        )}
      </div>
    </header>
  )
}