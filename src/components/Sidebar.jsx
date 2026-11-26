import {
  Activity,
  BellRing,
  CircleGauge,
  History,
  Info,
  Settings,
  UserCog,
  Menu,
  RadioTower,
  X,
} from 'lucide-react'

export default function Sidebar({ activeSection, onNavigate, open, onToggle, role }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: CircleGauge },
    { id: 'history', label: 'Historial', icon: History },
    { id: 'alerts', label: 'Alertas', icon: BellRing },
    { id: 'sensors', label: 'Sensores', icon: RadioTower },
    { id: 'info', label: 'Información del proyecto', icon: Info },
    ...(role === 'engineer' || role === 'admin'
      ? [{ id: 'settings', label: 'Umbrales y buzzer', icon: Settings }]
      : []),
    ...(role === 'admin'
      ? [{ id: 'admin', label: 'Administración', icon: UserCog }]
      : []),
  ]

  return (
    <>
      <button className="mobile-menu-button" type="button" onClick={onToggle} aria-label="Abrir menú">
        {open ? <X size={22} /> : <Menu size={22} />}
      </button>
      {open && <button className="sidebar-backdrop" type="button" aria-label="Cerrar menú" onClick={onToggle} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-icon"><Activity size={23} /></div>
          <div>
            <strong>MONITOREO EL ENCANO</strong>
            <span>Sistema de alerta temprana</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={activeSection === item.id ? 'active' : ''}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="sidebar-status">
          <span className="status-dot" />
          <div>
            <strong>El Encano</strong>
            <small>Panel de monitoreo ambiental</small>
          </div>
        </div>
      </aside>
    </>
  )
}