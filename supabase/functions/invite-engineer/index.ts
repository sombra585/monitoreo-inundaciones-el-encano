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

  const callerClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
  const { data: userData, error: userError } = await callerClient.auth.getUser(jwt)
  if (userError || !userData.user) return respond({ error: 'Sesión inválida.' }, 401)
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profileError || profile?.role !== 'admin' || !profile.active) {
    return respond({ error: 'Solo un administrador activo puede invitar ingenieros.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return respond({ error: 'El cuerpo debe ser JSON válido.' }, 400)
  }
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !name || name.length > 120) {
    return respond({ error: 'Proporciona un nombre y un correo válidos.' }, 400)
  }

  const { data: invitation, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { name },
  })
  if (inviteError || !invitation.user) {
    return respond({ error: inviteError?.message || 'No se pudo enviar la invitación.' }, 400)
  }

  const { error: roleError } = await callerClient.rpc('admin_set_profile_access', {
    target_user_id: invitation.user.id,
    new_role: 'engineer',
    new_active: true,
  })
  if (roleError) {
    console.error('Invitación enviada, pero no se pudo asignar el rol engineer:', roleError.message)
    return respond({ error: 'La invitación se envió, pero no se pudo asignar el rol de ingeniero. Revisa el perfil en Supabase.' }, 500)
  }

  return respond({ invited: true, email, profile_id: invitation.user.id }, 201)
})
