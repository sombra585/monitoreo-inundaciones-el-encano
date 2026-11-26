import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

async function hashToken(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const adminClient = url && serviceRoleKey ? createClient(url, serviceRoleKey) : null

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405)
  if (!url || !anonKey || !adminClient) return respond({ error: 'La función no tiene configuración de Supabase.' }, 500)

  const authorization = request.headers.get('authorization') || ''
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!jwt) return respond({ error: 'Se requiere una sesión de administrador.' }, 401)
  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: userData, error: userError } = await caller.auth.getUser(jwt)
  if (userError || !userData.user) return respond({ error: 'Sesión inválida.' }, 401)
  const { data: profile } = await adminClient.from('profiles').select('role, active').eq('id', userData.user.id).maybeSingle()
  if (profile?.role !== 'admin' || !profile.active) return respond({ error: 'Solo un administrador activo puede registrar dispositivos.' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return respond({ error: 'El cuerpo debe ser JSON válido.' }, 400)
  }
  const id = typeof payload.id === 'string' ? payload.id.trim() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const location = typeof payload.location === 'string' ? payload.location.trim() : 'El Encano, Nariño, Colombia'
  if (!/^[A-Za-z0-9_-]{2,64}$/.test(id) || !name || name.length > 120 || location.length > 200) {
    return respond({ error: 'Identificador (2–64 caracteres), nombre y ubicación no válidos.' }, 400)
  }

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32))
  const deviceToken = Array.from(tokenBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  const { error: deviceError } = await adminClient.from('devices').insert({ id, name, location })
  if (deviceError) return respond({ error: 'No se pudo registrar el dispositivo. Verifica que el ID no exista.' }, 409)

  const { error: credentialError } = await adminClient.from('device_credentials').insert({
    device_id: id,
    token_hash: await hashToken(deviceToken),
  })
  if (credentialError) {
    const { error: cleanupError } = await adminClient.from('devices').delete().eq('id', id)
    if (cleanupError) console.error('No se pudo retirar el dispositivo provisionado parcialmente:', cleanupError.message)
    console.error('Error creando credenciales del dispositivo:', credentialError.message)
    return respond({
      error: cleanupError
        ? 'No se pudieron crear credenciales y falló la limpieza; revisa el dispositivo antes de reintentar.'
        : 'No se pudieron crear credenciales para el dispositivo.',
    }, 500)
  }

  const { error: auditError } = await adminClient.from('activity_logs').insert({
    actor_id: userData.user.id,
    action: 'device_provisioned',
    target_type: 'device',
    target_id: id,
    details: { name, location },
  })
  if (auditError) {
    const { error: cleanupError } = await adminClient.from('devices').delete().eq('id', id)
    if (cleanupError) console.error('No se pudo retirar el dispositivo tras fallar su auditoría:', cleanupError.message)
    console.error('No se pudo registrar la auditoría de provisionamiento:', auditError.message)
    return respond({
      error: cleanupError
        ? 'Falló la auditoría y no se pudo limpiar el dispositivo; revisa su estado antes de reintentar.'
        : 'No se pudo registrar la auditoría; el dispositivo no quedó provisionado.',
    }, 500)
  }

  return respond({
    device: { id, name, location },
    device_token: deviceToken,
    warning: 'Copia este token ahora; no se volverá a mostrar.',
  }, 201)
})
