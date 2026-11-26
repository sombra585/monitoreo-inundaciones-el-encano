
import { createClient } from 'npm:@supabase/supabase-js@2'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  })
}

const url = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const adminClient =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey)
    : null

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (request.method !== 'POST') {
    return respond({ error: 'Método no permitido.' }, 405)
  }

  if (!url || !anonKey || !adminClient) {
    return respond({
      error: 'La función no tiene configuración de Supabase.',
    }, 500)
  }

  const authorization = request.headers.get('authorization') || ''
  const jwt = authorization.startsWith('Bearer ')
    ? authorization.slice(7)
    : ''

  if (!jwt) {
    return respond({
      error: 'Se requiere una sesión de administrador.',
    }, 401)
  }

  const callerClient = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  })

  const { data: userData, error: userError } =
    await callerClient.auth.getUser(jwt)

  if (userError || !userData?.user) {
    return respond({
      error: 'Sesión inválida.',
    }, 401)
  }

  const { data: callerProfile, error: profileError } =
    await callerClient
      .from('profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .maybeSingle()

  if (profileError) {
    console.error('No se pudo verificar el perfil del administrador:', profileError.message)
    return respond({ error: 'No se pudo verificar el perfil del administrador.' }, 500)
  }

  if (callerProfile?.role !== 'admin' || callerProfile.active !== true) {
    return respond({
      error: 'Solo un administrador activo puede consultar los usuarios.',
    }, 403)
  }

  const { data: profiles, error: profilesError } =
    await callerClient
      .from('profiles')
      .select('id, full_name, role, active, created_at')
      .order('created_at', { ascending: false })

  if (profilesError) {
    console.error('No se pudieron consultar perfiles para el administrador:', profilesError.message)
    return respond({
      error: 'No se pudieron consultar los perfiles.',
    }, 500)
  }

  const authUsers: Array<{ id: string; email?: string }> = []
  const perPage = 100

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } =
      await adminClient.auth.admin.listUsers({
        page,
        perPage,
      })

    if (error) {
      console.error('No se pudieron consultar usuarios de Auth:', error.message)
      return respond({
        error: 'No se pudieron consultar los correos de Auth.',
      }, 500)
    }

    authUsers.push(...data.users)

    if (data.users.length < perPage) {
      break
    }

    if (page === 100) {
      return respond({
        error: 'La consulta de usuarios superó el límite de paginación.',
      }, 500)
    }
  }

  const emailById = new Map(
    authUsers.map((user) => [user.id, user.email || null] as const)
  )

  const users = (profiles || []).map((profile) => ({
    ...profile,
    email: emailById.get(profile.id) || null,
  }))

  return respond({ users }, 200)
})
