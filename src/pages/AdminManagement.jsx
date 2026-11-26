
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, UserPlus, Users } from 'lucide-react'
import { supabase } from '../services/supabase'

export default function AdminManagement() {
  const [profiles, setProfiles] = useState([])
  const [devices, setDevices] = useState([])
  const [logs, setLogs] = useState([])
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [deviceToken, setDeviceToken] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)

  const queryData = useCallback(async () => {
    const [usersResult, deviceResult, logResult] = await Promise.all([
      supabase.functions.invoke('admin-list-users'),
      supabase
        .from('devices')
        .select('id, name, location, active, last_seen_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('activity_logs')
        .select('id, actor_id, action, target_type, target_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    let usersError = usersResult.error

    // Obtener el mensaje real devuelto por la Edge Function.
    if (usersError?.context) {
      try {
        const response = usersError.context
        const body = await response.clone().json()

        if (body?.error) {
          usersError = new Error(body.error)
        }
      } catch {
        // Se conserva el error original si la respuesta no es JSON.
      }
    }

    if (!usersError && usersResult.data?.error) {
      usersError = new Error(usersResult.data.error)
    }

    return [
      {
        data: usersResult.data?.users || [],
        error: usersError,
      },
      deviceResult,
      logResult,
    ]
  }, [])

  const loadData = useCallback((profileResult, deviceResult, logResult) => {
    const errors = []

    if (profileResult.error) {
      errors.push(`Perfiles: ${profileResult.error.message}`)
    } else {
      setProfiles(profileResult.data || [])
    }

    if (deviceResult.error) {
      errors.push(`Dispositivos: ${deviceResult.error.message}`)
    } else {
      setDevices(deviceResult.data || [])
    }

    if (logResult.error) {
      errors.push(`Bitácora: ${logResult.error.message}`)
    } else {
      setLogs(logResult.data || [])
    }

    setError(errors.join(' '))
    setLoading(false)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)

    try {
      loadData(...await queryData())
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible cargar la administración.'
      )
      setLoading(false)
    }
  }, [loadData, queryData])

  useEffect(() => {
    let active = true

    queryData()
      .then((results) => {
        if (active) loadData(...results)
      })
      .catch((loadError) => {
        if (!active) return

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No fue posible cargar la administración.'
        )
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadData, queryData])

  async function inviteEngineer(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    try {
      const { data, error: inviteError } =
        await supabase.functions.invoke('invite-engineer', {
          body: { email, name },
        })

      if (inviteError || data?.error) {
        setError(data?.error || inviteError.message)
      } else {
        setNotice(`Invitación enviada a ${email}.`)
        setEmail('')
        setName('')
        refresh()
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo enviar la invitación.'
      )
    }
  }

  async function changeProfile(
    profile,
    nextRole = profile.role,
    nextActive = profile.active
  ) {
    const displayName = profile.full_name || profile.email || profile.id

    if (!window.confirm(`¿Confirmas actualizar el acceso de ${displayName}?`)) {
      return
    }

    try {
      const { error: updateError } = await supabase.rpc(
        'admin_set_profile_access',
        {
          target_user_id: profile.id,
          new_role: nextRole,
          new_active: nextActive,
        }
      )

      if (updateError) {
        setError(updateError.message)
      } else {
        setNotice('Acceso actualizado y registrado en la bitácora.')
        refresh()
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo actualizar el perfil.'
      )
    }
  }

  async function provisionDevice(event) {
    event.preventDefault()
    setError('')
    setNotice('')
    setDeviceToken('')

    try {
      const { data, error: provisionError } =
        await supabase.functions.invoke('provision-device', {
          body: {
            id: deviceId,
            name: deviceName,
            location: 'El Encano, Nariño, Colombia',
          },
        })

      if (provisionError || data?.error) {
        setError(data?.error || provisionError.message)
      } else {
        setDeviceToken(data.device_token)
        setNotice(data.warning)
        setDeviceId('')
        setDeviceName('')
        refresh()
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo registrar el dispositivo.'
      )
    }
  }

  async function toggleDevice(device) {
    if (
      !window.confirm(
        `¿Confirmas ${device.active ? 'desactivar' : 'activar'} el dispositivo ${device.id}?`
      )
    ) {
      return
    }

    try {
      const { error: updateError } = await supabase
        .from('devices')
        .update({ active: !device.active })
        .eq('id', device.id)

      if (updateError) {
        setError(updateError.message)
      } else {
        setNotice(
          `Dispositivo ${device.active ? 'desactivado' : 'activado'}.`
        )
        refresh()
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No se pudo cambiar el estado del dispositivo.'
      )
    }
  }

  return (
    <main className="page">
      <section className="page-heading simple">
        <div>
          <p className="section-overline">SOLO ADMINISTRADOR</p>
          <h1>Administración del proyecto</h1>
          <p>Usuarios autorizados, dispositivos y auditoría.</p>
        </div>
      </section>

      {error && (
        <div className="global-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="connection-notice" role="status">
          {notice}
        </div>
      )}

      {deviceToken && (
        <div className="token-reveal">
          <KeyRound size={18} />
          <div>
            <strong>Token del dispositivo — copiar ahora</strong>
            <code>{deviceToken}</code>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state">Cargando administración…</div>
      ) : (
        <>
          <section className="admin-panel">
            <div className="admin-panel-title">
              <Users size={20} />
              <h2>Perfiles</h2>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Correo</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id}>
                      <td>{profile.full_name || '—'}</td>
                      <td>{profile.email || '—'}</td>
                      <td>{profile.role}</td>
                      <td>
                        {profile.active ? 'Activo' : 'Desactivado'}
                      </td>
                      <td>
                        {profile.role !== 'admin' && (
                          <div className="admin-row-actions">
                            <select
                              aria-label={`Rol para ${profile.email || profile.full_name || profile.id}`}
                              value={profile.role}
                              onChange={(event) =>
                                changeProfile(
                                  profile,
                                  event.target.value,
                                  profile.active
                                )
                              }
                            >
                              <option value="user">user</option>
                              <option value="engineer">engineer</option>
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                changeProfile(
                                  profile,
                                  profile.role,
                                  !profile.active
                                )
                              }
                            >
                              {profile.active ? 'Desactivar' : 'Reactivar'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="admin-form" onSubmit={inviteEngineer}>
              <h3>
                <UserPlus size={17} /> Invitar ingeniero
              </h3>

              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre"
                required
              />

              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Correo electrónico"
                required
              />

              <button className="primary-button" type="submit">
                Enviar invitación
              </button>
            </form>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-title">
              <KeyRound size={20} />
              <h2>Dispositivos ESP32</h2>
            </div>

            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th>Último contacto</th>
                    <th></th>
                  </tr>
                </thead>

                <tbody>
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td>{device.id}</td>
                      <td>{device.name}</td>
                      <td>
                        {device.active ? 'Activo' : 'Desactivado'}
                      </td>
                      <td>
                        {device.last_seen_at
                          ? new Date(device.last_seen_at).toLocaleString('es-CO')
                          : 'Sin comunicación'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => toggleDevice(device)}
                        >
                          {device.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form className="admin-form" onSubmit={provisionDevice}>
              <h3>
                Registrar dispositivo (token secreto se muestra una sola vez)
              </h3>

              <input
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
                placeholder="ID, por ejemplo ENCANO-ESP32-01"
                pattern="[A-Za-z0-9_-]{2,64}"
                required
              />

              <input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="Nombre del dispositivo"
                required
              />

              <button className="primary-button" type="submit">
                Crear credencial
              </button>
            </form>
          </section>

          <section className="admin-panel">
            <div className="admin-panel-title">
              <KeyRound size={20} />
              <h2>Bitácora de actividad</h2>
            </div>

            {logs.length ? (
              logs.map((log) => (
                <article className="activity-row" key={log.id}>
                  <strong>{log.action}</strong>
                  <span>
                    {log.target_type}: {log.target_id || '—'}
                  </span>
                  <time>
                    {new Date(log.created_at).toLocaleString('es-CO')}
                  </time>
                </article>
              ))
            ) : (
              <div className="empty-state">
                No hay acciones registradas.
              </div>
            )}
          </section>
        </>
      )}
    </main>
  )
}
