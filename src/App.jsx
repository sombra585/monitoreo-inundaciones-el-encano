import { useState } from 'react'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Alerts from './pages/Alerts'
import Sensors from './pages/Sensors'
import ProjectInfo from './pages/ProjectInfo'
import Login from './pages/Login'
import Settings from './pages/Settings'
import AdminManagement from './pages/AdminManagement'
import { useMonitoring } from './hooks/useMonitoring'
import { useAuth } from './hooks/useAuth'
import './App.css'

function App() {
  const [activeSection, setActiveSection] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const monitoring = useMonitoring()
  const auth = useAuth()
  const role = auth.profile?.role || null
  const latestDevice = monitoring.devices.find((device) => device.id === monitoring.latest?.device_id)
  const deviceLastSeen = latestDevice?.last_seen_at
    ? new Date(latestDevice.last_seen_at).getTime()
    : null
  const deviceStatus = !monitoring.latest
    ? 'waiting'
    : monitoring.errors.devices
      ? 'unknown'
      : deviceLastSeen === null || !Number.isFinite(deviceLastSeen)
        ? 'unknown'
        : monitoring.now.getTime() - deviceLastSeen >
            monitoring.staleAfterSeconds * 1000
          ? 'stale'
          : 'connected'
  const monitoringErrors = Object.entries(monitoring.errors)
  const errorLabels = {
    measurements: 'Mediciones',
    alerts: 'Alertas',
    devices: 'Dispositivos',
    settings: 'Configuración',
    thresholds: 'Umbrales',
  }

  const sectionNames = {
    dashboard: 'Dashboard',
    history: 'Historial',
    alerts: 'Alertas',
    sensors: 'Sensores',
    info: 'Información del proyecto',
    settings: 'Umbrales y buzzer',
    admin: 'Administración',
    login: 'Iniciar sesión',
  }

  const navigate = (section) => {
    setActiveSection(section)
    setSidebarOpen(false)
  }

  const renderSection = () => {
    const shared = {
      latest: monitoring.latest,
      alerts: monitoring.alerts,
      devices: monitoring.devices,
      thresholdConfig: monitoring.thresholdConfig,
      thresholdError: monitoring.thresholdError,
      isConfigured: monitoring.isConfigured,
      refreshKey: monitoring.lastUpdated?.getTime() ?? 0,
      role,
      profile: auth.profile,
    }

    switch (activeSection) {
      case 'login':
        return (
          <Login
            onSignIn={auth.signIn}
            onCancel={() => navigate('dashboard')}
            error={auth.error}
            loading={auth.loading}
          />
        )
      case 'history':
        return <History {...shared} />
      case 'alerts':
        return <Alerts {...shared} />
      case 'sensors':
        return <Sensors {...shared} />
      case 'info':
        return <ProjectInfo isConfigured={monitoring.isConfigured} />
      case 'settings':
        if (role === 'engineer' || role === 'admin') {
          return <Settings user={auth.profile} role={role} />
        }
        return <Dashboard {...shared} error={monitoring.errors.measurements} now={monitoring.now} staleAfterSeconds={monitoring.staleAfterSeconds} onNavigate={navigate} />
      case 'admin':
        if (role === 'admin') return <AdminManagement />
        return <Dashboard {...shared} error={monitoring.errors.measurements} now={monitoring.now} staleAfterSeconds={monitoring.staleAfterSeconds} onNavigate={navigate} />
      default:
        return (
          <Dashboard
            {...shared}
            loading={monitoring.loading}
            error={monitoring.errors.measurements}
            now={monitoring.now}
            staleAfterSeconds={monitoring.staleAfterSeconds}
            onNavigate={navigate}
          />
        )
    }
  }

  const pendingAlerts = monitoring.alerts.filter((alert) => alert.status === 'OPEN').length

  return (
    <div className="app-shell">
      <Sidebar
        activeSection={activeSection}
        onNavigate={navigate}
        open={sidebarOpen}
        role={role}
        onToggle={() => setSidebarOpen((open) => !open)}
      />
      <div className="app-content">
        <Header
          sectionName={sectionNames[activeSection]}
          isConfigured={monitoring.isConfigured}
          connectionStatus={monitoring.connectionStatus}
          deviceStatus={deviceStatus}
          loading={monitoring.loading}
          onRefresh={monitoring.refresh}
          pendingAlerts={pendingAlerts}
          onOpenAlerts={() => navigate('alerts')}
          profile={auth.profile}
          onSignIn={() => navigate('login')}
          onSignOut={auth.signOut}
        />
        {monitoringErrors.length > 0 && (
          <div className="global-error" role="alert">
            No fue posible consultar algunos datos de Supabase:
            <ul>
              {monitoringErrors.map(([section, message]) => (
                <li key={section}><strong>{errorLabels[section] || section}:</strong> {message}</li>
              ))}
            </ul>
          </div>
        )}
        {monitoring.loading && !monitoring.latest ? (
          <main className="page loading-page"><div className="loading-spinner" /><p>Cargando información...</p></main>
        ) : renderSection()}
      </div>
    </div>
  )
}

export default App
